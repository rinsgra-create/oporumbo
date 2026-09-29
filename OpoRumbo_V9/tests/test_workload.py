from copy import deepcopy
from datetime import date, timedelta
import math
import pytest
from app.workload import estimate, weights, pace, coverage, CONFIG
from app.planner import make_day, _today
from app.actions import identify_tasks, complete_task, undo_last_task

TODAY=date(2026,9,29)
OPP={'topics':[{'name':'Normas','blocks':['Artículos 1 a 5','Artículos 1 a 120','Ley 39/2015 completa']}]}

def state():
    return {'topics':{},'settings':{'minutes_default':90,'target_score':80},'xp':0}

def calc(p=None,days=100,week=5,rounds=3):
    return estimate(OPP,p or state(),(TODAY+timedelta(days=days)).isoformat(),week,rounds,TODAY)

def measured(n,ratio=2,kind='study'):
    p=state();p['pacing']={'schema':1,'sessions':[{'category':kind,'baseline_minutes':60,'actual_minutes':60*ratio} for _ in range(n)]};return p

@pytest.mark.parametrize('n',[0,1,5,20])
def test_learning_prior_and_determinism(n):
    p=measured(n);before=deepcopy(p);r=calc(p)
    assert p==before and calc(p)==r
    assert r['estimation_status']==('personalized' if n>=5 else 'initial')
    assert pace(p)['study']['factor']==pytest.approx(1+n/(n+5),abs=.0001)
    assert r['estimated_minutes_required']>=calc()['estimated_minutes_required']

@pytest.mark.parametrize('kind',['study','review','test','english','psy'])
def test_separate_factors(kind):
    p=measured(20,2,kind)
    assert pace(p)[kind]['factor']>1
    assert all(v['factor']==1 for k,v in pace(p).items() if k!=kind)

def test_outlier_does_not_dominate():
    p=measured(20,1);p['pacing']['sessions'][-1]['actual_minutes']=1440
    assert pace(p)['study']['factor']==1
    assert pace(measured(1,24))['study']['factor']<=1.5

def test_short_long_and_provenance():
    ws=weights(OPP)
    assert ws[0]['weight']<ws[1]['weight']
    assert ws[2]['approximate'] and 'aproximado' in ws[2]['method']
    assert ws[2]['estimate_source']=='inferred'
    p=deepcopy(OPP);p['source_url']='https://www.boe.es/buscar/doc.php?id=BOE-A-2026-1'
    assert weights(p)[0]['evidence_source']=='official'
    assert weights(p)[0]['estimate_source']=='inferred'
    p['topics'][0]['block_metadata']={'0':{'weight':3.5}}
    assert weights(p)[0]['estimate_source']=='manual'

def scored(score):
    p=state();p['topics']['0']={'block':1,'block_passes':{'0':1},'reviews':{'0':{'last_score':score,'next_review':TODAY.isoformat(),'interval_days':1 if score<50 else 24}}};return p

def test_weak_and_strong_maintenance_and_no_double_count():
    low,high=calc(scored(40)),calc(scored(98))
    assert low['estimated_minutes_required']>high['estimated_minutes_required']
    assert low['blocks'][0]['future_review_count']>high['blocks'][0]['future_review_count']>0
    assert calc(scored(98))['estimated_minutes_required']<calc(scored(75))['estimated_minutes_required']
    # A single due recall fits inside the later rounds, not an additional full budget.
    p=scored(98);a=calc(p,days=10);p['topics']['0']['reviews']['0']['next_review']=(TODAY+timedelta(days=11)).isoformat()
    assert calc(p,days=10)['estimated_minutes_required']==a['estimated_minutes_required']

@pytest.mark.parametrize('rounds',[2,3,4])
def test_rounds_and_milestones(rounds):
    r=calc(rounds=rounds)
    assert r['round_options']['2']<=r['round_options']['3']<=r['round_options']['4']
    assert r['milestones']['1']<=r['milestones']['2']<=r['milestones']['3']
    assert r['estimated_minutes_required']==calc(rounds=rounds)['estimated_minutes_required']

@pytest.mark.parametrize('days',[0,1,-2])
def test_close_or_expired_exam(days):
    r=calc(days=days)
    assert r['study_days_left']>=0 and r['margin_minutes']<0
    if r['study_days_left']==0: assert r['required_minutes_per_study_day'] is None

def test_availability_pace_and_alternatives_are_calculated():
    p=state();a=calc(p,days=14);p['settings']['minutes_default']=180;b=calc(p,days=14)
    assert b['margin_minutes']>a['margin_minutes'] and b['milestones']['1']<a['milestones']['1']
    assert calc(measured(20,2))['required_minutes_per_study_day']>calc(measured(20,.5))['required_minutes_per_study_day']
    p['settings']['minutes_default']=90+a['alternatives']['extra_minutes_daily']
    assert calc(p,days=14)['pace_sufficient']
    assert calc(days=14,week=6)['required_minutes_per_study_day']==a['alternatives']['with_extra_day_minutes_daily']

def test_academy_priority_and_master_estimate():
    p=scored(40);p['topics']['0']['reviews']['0']['next_review']=_today().isoformat()
    free=make_day(OPP,60,p);acad=make_day(OPP,60,p,'academy',[0])
    assert acad['tasks'][0]['kind']=='academy'
    assert sum(t['minutes'] for t in acad['tasks'])<=60
    pairs=[(t.get('topic_index'),t.get('block_index')) for t in acad['tasks'] if t['kind'] in ('study','academy')]
    assert all((t.get('topic_index'),t.get('block_index')) not in pairs for t in acad['tasks'] if t['kind'] in ('maintenance','urgent_review'))
    assert free['roadmap']['estimated_minutes_required']==acad['roadmap']['estimated_minutes_required']

def test_partial_progress_learning_retry_and_undo():
    p=state();p['tasks']=make_day(OPP,30,p)['tasks'];p['plan_date']=_today().isoformat();identify_tasks(p)
    t=next(t for t in p['tasks'] if t['kind']=='study');before=deepcopy(p)
    complete_task(p,OPP,t['id'],actual_minutes=45)
    assert 0<coverage(p['topics']['0'],t['block_index'])<1
    assert len(p['pacing']['sessions'])==1
    complete_task(p,OPP,t['id'],actual_minutes=45);assert len(p['pacing']['sessions'])==1
    undo_last_task(p,OPP,t['id']);assert not p['pacing']['sessions'] and p['topics']==before['topics']

def test_legacy_unmeasured_task_not_used_to_train():
    p=state();p['tasks']=[{'id':'old','kind':'study','topic_index':0,'block_index':0,'minutes':40,'xp':100}]
    complete_task(p,OPP,'old',actual_minutes=60)
    assert pace(p)['study']['sessions']==0
    assert p['pacing']['sessions'][0]['actual_minutes']==60

def test_test_backlog_scheduled_and_round_not_awarded_early():
    opp={'topics':[{'name':'A','blocks':['A']}]};p=state()
    p['topics']={'0':{'block_passes':{'0':1},'test_coverage':{'0':.2}}}
    task=make_day(opp,60,p)['tasks'][0]
    assert task['kind']=='test'
    assert estimate(opp,p,'2027-01-01',5,3,TODAY)['completed_rounds']==0

def test_practice_learning_affects_cabo_total():
    opp=deepcopy(OPP);opp['id']='cabo_gc'
    a=estimate(opp,state(),'2027-01-01',5,3,TODAY)
    b=estimate(opp,measured(20,2,'english'),'2027-01-01',5,3,TODAY)
    assert b['practice_minutes']>a['practice_minutes']

def test_unknown_date_not_invented():
    assert estimate(OPP,state(),None,5,3,TODAY)['days_left'] is None

def test_bad_score_changes_load_not_calendar_credit():
    from app.workload import earned_minutes
    p=scored(98);p['workload_anchor']={'date':TODAY.isoformat(),'required_minutes':calc(p)['estimated_minutes_required'],'earned_minutes':earned_minutes(OPP,p,3),'daily_minutes':90,'days_per_week':5,'target_rounds':3}
    high=calc(p)
    p['topics']['0']['reviews']['0'].update(last_score=40,interval_days=1)
    low=calc(p)
    assert low['estimated_minutes_required']>high['estimated_minutes_required']
    assert low['schedule_margin_minutes']==high['schedule_margin_minutes']==0

def test_custom_english_has_separate_pace():
    opp={'topics':[{'name':'Inglés','blocks':['Gramática']} ]}
    p=measured(20,2,'english')
    assert make_day(opp,60,p)['tasks'][0]['pace_category']=='english'
    assert estimate(opp,p,'2027-01-01',5,3,TODAY)['estimated_minutes_required']>estimate(opp,state(),'2027-01-01',5,3,TODAY)['estimated_minutes_required']

def test_v18_mastery_uses_latest_topic_score():
    from app.planner import mastery_from_score
    p=state();p['topics']={'0':{'score':90,'tests':[{'block':0,'score':20},{'block':0,'score':90}]}}
    assert calc(p)['mastery_index']==mastery_from_score(90,80)
    assert calc(p)['average_test_score']==55
