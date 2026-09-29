"""Run with pytest; uses an isolated temporary SQLite DB, never Neon."""
import os
import tempfile
from pathlib import Path
from datetime import date,timedelta
import copy
import pytest

tmp=tempfile.TemporaryDirectory(prefix="oporumbo-tests-")
os.environ["DATABASE_URL"]="sqlite:///"+(Path(tmp.name)/"test.db").as_posix()
from fastapi.testclient import TestClient
from app.main import app,CATALOG
from app.planner import make_day,record_test,roadmap,review_interval,_today
from app.db import get_progress,save_progress,engine

@pytest.fixture(scope='session',autouse=True)
def close_database():
    yield
    engine.dispose()
    tmp.cleanup()

@pytest.fixture
def account():
    client=TestClient(app)
    email=f"test-{os.urandom(6).hex()}@example.com"
    r=client.post('/api/register',json={"email":email,"password":"Local-test-123!"})
    assert r.status_code==200,r.text
    client.headers['Authorization']='Bearer '+r.json()['token']
    body={"opposition":CATALOG[0],"exam_date":(_today()+timedelta(days=180)).isoformat(),"days_per_week":5,"minutes_per_day":90,"target_rounds":3,"mode":"free"}
    r=client.post('/api/setup',json=body);assert r.status_code==200,r.text
    return client,email,body

def plan(client,**extra):
    p=client.get('/api/progress').json();s=p['settings']
    r=client.post('/api/plan/today',json={"opposition_id":p['selected'],"minutes":s['minutes_default'],"mode":p['mode'],"academy_topic_indexes":p.get('academy_selected',[]),"exam_date":s['exam_date'],"days_per_week":s['days_per_week'],"target_rounds":s['target_rounds'],"revision":p.get('_revision',0),**extra})
    assert r.status_code==200,r.text
    return r.json()

def test_full_flow_reload_second_session_and_idempotency(account):
    c,email,_=account;p=plan(c)
    task=next(t for t in p['tasks'] if t['kind']=='study')
    path='/api/tasks/'+task['id']+'/complete'
    a=c.post(path,json={});assert a.status_code==200
    b=c.post(path,json={});assert b.json()['xp']==a.json()['xp']
    test=next(t for t in p['tasks'] if t['kind']=='test')
    a=c.post('/api/tasks/'+test['id']+'/complete',json={"score":42});assert a.status_code==200,a.text
    b=c.post('/api/tasks/'+test['id']+'/complete',json={"score":42});assert b.json()['xp']==a.json()['xp']
    assert len(b.json()['topics'][str(test['topic_index'])]['tests'])==1
    assert b.json()['topics'][str(test['topic_index'])]['tests'][0]['interval_days']==1
    second=TestClient(app)
    login=second.post('/api/login',json={"email":email,"password":"Local-test-123!"});assert login.status_code==200
    second.headers['Authorization']='Bearer '+login.json()['token']
    saved=second.get('/api/progress').json()
    assert next(t for t in saved['tasks'] if t['id']==test['id'])['score']==42
    assert next(t for t in saved['tasks'] if t['id']==task['id'])['done']
    fresh=plan(c,replan=True)
    assert next(t for t in fresh['tasks'] if t['id']==test['id'])['done']
    assert next(t for t in fresh['tasks'] if t['id']==task['id'])['done']

def test_stale_device_cannot_overwrite(account):
    c,_,_=account;p=plan(c);stale=copy.deepcopy(p)
    c.post('/api/tasks/'+p['tasks'][0]['id']+'/complete',json={})
    r=c.put('/api/progress',json={'data':stale});assert r.status_code==409
    assert c.get('/api/progress').json()['tasks'][0]['done']

def test_validation_and_auth(account):
    c,_,_=account;p=plan(c);task=next(t for t in p['tasks'] if t['kind']=='test');url='/api/tasks/'+task['id']+'/complete'
    assert c.post(url,json={'score':101}).status_code==422
    assert c.post(url,json={}).status_code==422
    assert not next(t for t in c.get('/api/progress').json()['tasks'] if t['id']==task['id'])['done']
    assert TestClient(app).get('/api/progress').status_code==401
    assert c.post('/api/tasks/no-such-task/complete',json={}).status_code==409

def test_setup_preserves_same_opposition_and_archives_changes(account):
    c,_,body=account;p=plan(c)
    c.post('/api/tasks/'+p['tasks'][0]['id']+'/complete',json={})
    p=c.get('/api/progress').json();body['revision']=p['_revision']
    r=c.post('/api/setup',json=body);assert r.status_code==200;assert r.json()['topics']==p['topics']
    body['revision']=r.json()['_revision'];body['opposition']={'name':'Custom test','boe_id':'BOE-A-2026-1','topics':[{'n':1,'name':'Test','blocks':['Test']} ]}
    r=c.post('/api/setup',json=body);assert r.status_code==200
    assert r.json()['opposition_history'][-1]['topics']==p['topics']
    assert r.json()['custom_opposition']['topics']
    body['opposition']=r.json()['custom_opposition'];body['revision']=r.json()['_revision']
    assert c.post('/api/setup',json=body).json()['custom_opposition']['topics']

def test_new_day_due_reviews_and_legacy_ids(account):
    c,_,_=account;p=plan(c);uid=c.get('/api/me').json()['id']
    p['plan_date']=(_today()-timedelta(days=1)).isoformat()
    record_test(p,0,0,40);p['topics']['0']['reviews']['0']['next_review']=p['plan_date']
    old_ids={t['id'] for t in p['tasks']};save_progress(uid,p)
    new=plan(c)
    assert new['tasks'][0]['kind']=='urgent_review'
    assert not old_ids.intersection(t['id'] for t in new['tasks'])
    assert new['plan_date']==_today().isoformat()
    # Old v17 rows get stable identities, and their completed tasks survive.
    p=copy.deepcopy(new);p.pop('plan_date');p['tasks'][0]['done']=True
    for t in p['tasks']:t.pop('id')
    save_progress(uid,p)
    before=c.get('/api/progress').json();after=plan(c)
    assert after['tasks'][0]['id']==before['tasks'][0]['id']
    assert after['tasks'][0]['done']

@pytest.mark.parametrize('minutes',[30,45,90,180,360])
@pytest.mark.parametrize('mode',['free','academy'])
def test_daily_budget_and_task_limit(minutes,mode):
    p={'settings':{'target_score':80}}
    record_test(p,0,0,40);p['topics']['0']['reviews']['0']['next_review']=_today().isoformat()
    result=make_day(CATALOG[0],minutes,p,mode,[0,1,2,3])
    assert len(result['tasks'])<=5
    assert sum(t['minutes'] for t in result['tasks'])<=minutes
    assert all(t['minutes']>0 for t in result['tasks'])
    assert result['tasks'][0]['kind']=='urgent_review'

def test_round_progress_and_recall_intervals():
    opp={'topics':[{'name':'A','blocks':['a','b']},{'name':'B','blocks':['c']}]}
    p={'settings':{'target_score':80},'topics':{'0':{'block':2,'block_passes':{'0':1,'1':1}},'1':{'block':0}}}
    tasks=make_day(opp,30,p)['tasks'];assert tasks[0]['topic_index']==1
    a=roadmap(opp,p,(_today()+timedelta(days=100)).isoformat())
    p['topics']['0']['block_passes']['0']=2
    b=roadmap(opp,p,(_today()+timedelta(days=100)).isoformat())
    assert b['estimated_minutes_required']<a['estimated_minutes_required']
    assert a['round_options']['2']<=a['round_options']['3']<=a['round_options']['4']
    assert review_interval(40)<review_interval(85)<review_interval(98)
    assert review_interval(85,90)<review_interval(85,80)

def test_headers_and_local_3d():
    c=TestClient(app)
    assert c.get('/api/health').headers['cache-control']=='no-store'
    assert c.get('/').headers['cache-control']=='no-cache'
    assert c.get('/sw.js').headers['cache-control']=='no-cache'
    assert 'id="pet3dFrame"' in c.get('/').text
    assert c.get('/static/vendor/three.module.js').status_code==200
    assert c.get('/static/pet-scene.js').status_code==200

def test_undo_last_test_restores_progress(account):
    c,_,_=account;p=plan(c)
    study=next(t for t in p['tasks'] if t['kind']=='study')
    test=next(t for t in p['tasks'] if t['kind']=='test')
    before=c.post('/api/tasks/'+study['id']+'/complete',json={}).json()
    after=c.post('/api/tasks/'+test['id']+'/complete',json={'score':93}).json()
    assert c.post('/api/tasks/'+study['id']+'/undo',json={'revision':after['_revision']}).status_code==409
    undone=c.post('/api/tasks/'+test['id']+'/undo',json={'revision':after['_revision']})
    assert undone.status_code==200,undone.text
    assert undone.json()['topics']==before['topics']
    assert undone.json()['xp']==before['xp']
    assert not next(t for t in undone.json()['tasks'] if t['id']==test['id'])['done']
    again=c.post('/api/tasks/'+test['id']+'/complete',json={'score':70}).json()
    assert len(again['topics'][str(test['topic_index'])]['tests'])==1
    assert again['topics'][str(test['topic_index'])]['score']==70

def test_actual_concurrent_compare_and_swap(account):
    from threading import Barrier
    from concurrent.futures import ThreadPoolExecutor
    from app.db import mutate_progress,ProgressConflict
    c,_,_=account;uid=c.get('/api/me').json()['id'];barrier=Barrier(2)
    def attempt(value):
        def change(p):barrier.wait(timeout=5);p['race_value']=value
        try:return mutate_progress(uid,change)['race_value']
        except ProgressConflict:return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(attempt,[1,2]))
    assert results.count('conflict')==1
    assert c.get('/api/progress').json()['race_value'] in (1,2)

def test_research_failure_is_visible_and_catalog_not_claimed_current(account,monkeypatch):
    import app.main as main
    async def unavailable(q):raise RuntimeError('BOE temporalmente no disponible')
    monkeypatch.setattr(main,'search_boe',unavailable)
    c,_,_=account;r=c.get('/api/research/opposition?q=Cabo')
    assert r.status_code==200;assert r.json()['warning'];assert r.json()['catalog']
    r=c.post('/api/research/select',json={'kind':'catalog','catalog_id':CATALOG[0]['id']})
    assert r.json()['status']=='catalog_reference'

def test_boe_search_form_and_title_parser(monkeypatch):
    import asyncio,httpx
    from app import researcher
    html='<li class="resultado-busqueda"><p class="linea-dem">Organismo</p><p>Convocatoria de prueba</p><a href="../buscar/doc.php?id=BOE-A-2026-1">Ir al documento Ref.</a><a href="../buscar/doc.php?id=BOE-A-2026-1">Más</a></li>'
    class Client:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def get(self,url,params=None):
            assert params['campo[1]']=='TITULOS'
            assert params['dato[1]']=='auxiliar'
            assert params['campo[6]']=='FPU'
            return httpx.Response(200,text=html,request=httpx.Request('GET',url))
    monkeypatch.setattr(researcher.httpx,'AsyncClient',Client)
    results=asyncio.run(researcher.search_boe('auxiliar'))
    assert len(results)==1
    assert results[0]['name']=='Convocatoria de prueba'
    assert results[0]['verified'] is False
