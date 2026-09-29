
from fastapi import FastAPI,HTTPException,Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel,EmailStr,Field
from typing import Literal
from datetime import date
from pathlib import Path
import json
from .db import init_db,register,login,user_from_token,get_progress,mutate_progress,ProgressConflict
from .workload import weights, earned_minutes
from .actions import identify_tasks,complete_task,undo_last_task
from .planner import make_day,record_test,roadmap,_today
from .researcher import search_catalog,search_boe,inspect_boe

BASE=Path(__file__).resolve().parent
CATALOG=json.loads((BASE/"catalog.json").read_text(encoding="utf-8"))
app=FastAPI(title="OpoRumbo",version="19.1")
init_db()

@app.exception_handler(ProgressConflict)
async def conflict_handler(request, exc):
    return JSONResponse(status_code=409,content={"detail":str(exc)})

@app.middleware("http")
async def cache_policy(request, call_next):
    response=await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"]="no-store"
    elif request.url.path in ("/", "/sw.js") or request.url.path.endswith((".html", ".js", ".css", ".webmanifest")):
        response.headers["Cache-Control"]="no-cache"
    response.headers["X-Content-Type-Options"]="nosniff"
    return response

class AuthReq(BaseModel):
    email:EmailStr
    password:str
class SaveReq(BaseModel):
    data:dict
class ResearchSelectReq(BaseModel):
    kind:str
    catalog_id:str|None=None
    boe_id:str|None=None
class SetupReq(BaseModel):
    opposition:dict
    exam_date:date
    days_per_week:int=Field(6,ge=1,le=7)
    minutes_per_day:int=Field(180,ge=30,le=720)
    target_rounds:int=Field(3,ge=1,le=5)
    target_score:int=Field(80,ge=50,le=100)
    mode:Literal["free","academy"]="free"
    revision:int=0
class PlanReq(BaseModel):
    opposition_id:str
    minutes:int=Field(180,ge=30,le=720)
    mode:Literal["free","academy"]="free"
    academy_topic_indexes:list[int]=Field(default_factory=list)
    exam_date:date
    days_per_week:int=Field(6,ge=1,le=7)
    target_rounds:int=Field(3,ge=1,le=5)
    revision:int|None=None
    replan:bool=False
    target_score:int|None=Field(None,ge=50,le=100)
class TestResultReq(BaseModel):
    opposition_id:str
    topic_index:int
    block_index:int=0
    score:int=Field(ge=0,le=100)
    task_id:str|None=None

class CompleteReq(BaseModel):
    actual_minutes:float|None=Field(None,gt=0,le=1440,allow_inf_nan=False)
    score:int|None=Field(None,ge=0,le=100)

class UndoReq(BaseModel):
    revision:int

def require_user(a):
    if not a or not a.lower().startswith("bearer "):raise HTTPException(401,"Falta sesión")
    u=user_from_token(a.split(" ",1)[1])
    if not u:raise HTTPException(401,"Sesión no válida")
    return u

def get_opp_for_progress(p, oid):
    if oid=="custom_researched":
        return p.get("custom_opposition")
    return next((o for o in CATALOG if o["id"]==oid),None)

def refresh_workload(p):
    o=get_opp_for_progress(p,p.get("selected"))
    if o and p.get("settings"):
        s=p["settings"]
        p["roadmap"]=roadmap(o,p,s.get("exam_date"),s.get("days_per_week",6),s.get("target_rounds",3))
        p["workload_weights"]={"schema":1,"blocks":weights(o)}
        p.setdefault("workload_anchor",{"date":_today().isoformat(),"required_minutes":p["roadmap"]["estimated_minutes_required"],"earned_minutes":earned_minutes(o,p,s.get("target_rounds",3)),"target_rounds":s.get("target_rounds",3),"daily_minutes":s.get("minutes_default",180),"days_per_week":s.get("days_per_week",6)})

@app.get("/api/health")
def health():return {"ok":True,"version":"19.1"}

@app.post("/api/register")
def api_register(x:AuthReq):
    if len(x.password)<8:raise HTTPException(400,"Usa al menos 8 caracteres")
    token=register(x.email,x.password)
    if not token:raise HTTPException(409,"Ese correo ya está registrado")
    return {"token":token}

@app.post("/api/login")
def api_login(x:AuthReq):
    token=login(x.email,x.password)
    if not token:raise HTTPException(401,"Credenciales incorrectas")
    return {"token":token}

@app.get("/api/me")
def me(authorization:str|None=Header(None)):return require_user(authorization)

@app.get("/api/progress")
def progress(authorization:str|None=Header(None)):
    u=require_user(authorization);p=get_progress(u["id"]);identify_tasks(p);refresh_workload(p);return p

@app.put("/api/progress")
def save(x:SaveReq,authorization:str|None=Header(None)):
    u=require_user(authorization)
    def change(p):
        # Preserve compatibility with the legacy full-state payload, but reject
        # stale snapshots instead of silently erasing a newer device's work.
        p.update(x.data)
        refresh_workload(p)
    p=mutate_progress(u["id"],change,int(x.data.get("_revision",0)))
    return {"ok":True,"progress":p}

@app.get("/api/oppositions")
def oppositions():
    return [{"id":o["id"],"name":o["name"],"year":o.get("year",""),"topics":len(o.get("topics",[]))} for o in CATALOG]

@app.get("/api/oppositions/{oid}")
def get_opposition(oid:str,authorization:str|None=Header(None)):
    if oid=="custom_researched":
        u=require_user(authorization);p=get_progress(u["id"]);o=p.get("custom_opposition")
        if not o:raise HTTPException(404,"No hay oposición investigada guardada")
        return o
    o=next((o for o in CATALOG if o["id"]==oid),None)
    if not o:raise HTTPException(404,"Oposición no encontrada")
    return o

@app.get("/api/research/opposition")
async def research_opposition(q:str,authorization:str|None=Header(None)):
    require_user(authorization)
    q=q.strip()
    if len(q)<3:raise HTTPException(400,"Escribe al menos 3 caracteres")
    warning=None
    try:boe=await search_boe(q)
    except RuntimeError as e:boe=[];warning=str(e)
    return {"query":q,"catalog":search_catalog(CATALOG,q),"boe":boe,"warning":warning}

@app.post("/api/research/select")
async def research_select(x:ResearchSelectReq,authorization:str|None=Header(None)):
    require_user(authorization)
    if x.kind=="catalog" and x.catalog_id:
        o=next((o for o in CATALOG if o["id"]==x.catalog_id),None)
        if not o:raise HTTPException(404,"Oposición no encontrada")
        return {"opposition":o,"status":"catalog_reference"}
    if x.kind=="boe" and x.boe_id:
        try:o=await inspect_boe(x.boe_id)
        except Exception:raise HTTPException(502,"No se pudo leer el documento BOE")
        return {"opposition":o,"status":"automatic_extraction"}
    raise HTTPException(400,"Selección no válida")

@app.post("/api/setup")
def setup(x:SetupReq,authorization:str|None=Header(None)):
    u=require_user(authorization)
    if x.exam_date < _today():
        raise HTTPException(422,"La fecha de examen no puede estar en el pasado")
    def change(p):
        o=x.opposition.copy()
        if not o.get("topics"):
            raise HTTPException(400,"No se ha detectado un temario utilizable")
        if o.get("id") and o["id"] != "custom_researched":
            o=next((v for v in CATALOG if v["id"]==o["id"]),None)
            if not o:raise HTTPException(404,"Oposición no encontrada")
        old_id=p.get("selected")
        new_id=o.get("id") or "custom_researched"
        same=old_id==new_id and (new_id!="custom_researched" or p.get("custom_opposition",{}).get("boe_id")==o.get("boe_id"))
        if not same:
            p.pop("last_completion",None)
            p.setdefault("opposition_history",[]).append({"selected":old_id,"topics":p.get("topics",{}),"tasks":p.get("tasks",[]),"custom_opposition":p.get("custom_opposition"),"pacing":p.get("pacing"),"practice_credit":p.get("practice_credit"),"workload_anchor":p.get("workload_anchor"),"saved_on":_today().isoformat()})
            p["topics"]={};p["tasks"]=[];p.pop("plan_date",None)
            for key in ("pacing","practice_credit","workload_anchor"):p.pop(key,None)
        p["selected"]=new_id
        if new_id=="custom_researched":
            o["id"]=new_id;p["custom_opposition"]=o
        p["setup_complete"]=True;p["mode"]=x.mode
        p.setdefault("academy_selected",[])
        p["settings"]={"exam_date":x.exam_date.isoformat(),"days_per_week":x.days_per_week,
            "target_rounds":x.target_rounds,"minutes_today":x.minutes_per_day,
            "minutes_default":x.minutes_per_day,"target_score":x.target_score}
        refresh_workload(p)
    return mutate_progress(u["id"],change,x.revision)

@app.post("/api/tasks/{task_id}/complete")
def finish(task_id:str,x:CompleteReq,authorization:str|None=Header(None)):
    u=require_user(authorization)
    def change(p):
        opp=get_opp_for_progress(p,p.get("selected"))
        if not opp:raise HTTPException(404,"Oposición no encontrada")
        complete_task(p,opp,task_id,x.score,x.actual_minutes)
    return mutate_progress(u["id"],change)

@app.post("/api/test/result")
def test_result(x:TestResultReq,authorization:str|None=Header(None)):
    u=require_user(authorization)
    result={}
    def change(p):
        opp=get_opp_for_progress(p,x.opposition_id)
        if not opp or p.get("selected")!=x.opposition_id:raise HTTPException(404,"Oposición no encontrada")
        if not 0<=x.topic_index<len(opp["topics"]):raise HTTPException(400,"Tema no válido")
        blocks=opp["topics"][x.topic_index].get("blocks") or [""]
        if not 0<=x.block_index<len(blocks):raise HTTPException(400,"Bloque no válido")
        identify_tasks(p)
        task=next((t for t in p.get("tasks",[]) if t.get("kind")=="test" and t.get("topic_index")==x.topic_index and t.get("block_index",0)==x.block_index and (not x.task_id or t["id"]==x.task_id)),None)
        if task:
            complete_task(p,opp,task["id"],x.score)
            result.update(score=task.get("score"),next_review=task.get("next_review"))
        else:
            raise HTTPException(409,"Organiza el día antes de registrar este test")
    p=mutate_progress(u["id"],change)
    return {"result":result,"progress":p}

@app.post("/api/tasks/{task_id}/undo")
def undo(task_id:str,x:UndoReq,authorization:str|None=Header(None)):
    u=require_user(authorization)
    def change(p):
        opp=get_opp_for_progress(p,p.get("selected"))
        if not opp:raise HTTPException(404,"Oposición no encontrada")
        undo_last_task(p,opp,task_id)
    return mutate_progress(u["id"],change,x.revision)

@app.post("/api/plan/today")
def today(x:PlanReq,authorization:str|None=Header(None)):
    u=require_user(authorization)
    def change(p):
        opp=get_opp_for_progress(p,x.opposition_id)
        if not opp or p.get("selected")!=x.opposition_id:raise HTTPException(404,"Oposición no encontrada")
        if any(i<0 or i>=len(opp["topics"]) for i in x.academy_topic_indexes):
            raise HTTPException(422,"Tema de academia no válido")
        if x.mode=="academy" and not x.academy_topic_indexes:
            raise HTTPException(422,"Marca los temas de academia que tocan hoy")
        identify_tasks(p)
        today_key=_today().isoformat()
        same_day=p.get("plan_date",today_key)==today_key
        if not same_day:p.pop("last_completion",None)
        selection={"mode":x.mode,"topics":list(dict.fromkeys(x.academy_topic_indexes))[:2] if x.mode=="academy" else []}
        previous=p.get("plan_selection")
        if previous is None:
            # V18/V19 had no plan provenance. Infer academy topics from the actual
            # tasks, not the profile, which may already contain a newer selection.
            academy=list(dict.fromkeys(t.get("topic_index") for t in p.get("tasks",[]) if t.get("kind")=="academy"))
            previous={"mode":"academy" if academy else p.get("mode","free"),"topics":academy[:2]}
        # Reuse only a plan built for the current selection, including on reload.
        if same_day and p.get("tasks") and not x.replan and previous==selection:
            p["plan_date"]=today_key
            p["plan_selection"]=selection
            refresh_workload(p)
            return
        completed=[t for t in p.get("tasks",[]) if t.get("done")] if same_day else []
        p["mode"]=x.mode;p["academy_selected"]=list(dict.fromkeys(x.academy_topic_indexes))
        old=p.get("settings") or {}
        p["settings"]={"exam_date":x.exam_date.isoformat(),"days_per_week":x.days_per_week,
            "target_rounds":x.target_rounds,"minutes_today":x.minutes,"minutes_default":x.minutes,
            "target_score":x.target_score if x.target_score is not None else old.get("target_score",80)}
        used=sum(t.get("actual_minutes",t.get("minutes",0)) for t in completed)
        remaining=max(0,x.minutes-used)
        result=make_day(opp,max(30,remaining),p,x.mode,p["academy_selected"],x.exam_date.isoformat(),x.days_per_week,x.target_rounds)
        def key(t):
            kind=t.get("kind")
            if kind in ("study","academy","urgent_review","maintenance"):kind="reading"
            return (kind,t.get("topic_index"),t.get("block_index"))
        done_keys={key(t) for t in completed}
        fresh=[t for t in result["tasks"] if key(t) not in done_keys] if remaining>=30 else []
        # A replan cannot erase completed work or grow today's core list forever.
        p["tasks"]=completed+fresh[:max(0,5-len(completed))]
        p["plan_date"]=today_key
        p["plan_selection"]=selection
        identify_tasks(p)
        p["roadmap"]=result["roadmap"];p["due_reviews"]=result["due_reviews"]
        refresh_workload(p)
    return mutate_progress(u["id"],change,x.revision)

app.mount("/static",StaticFiles(directory=BASE/"static"),name="static")
@app.get("/")
def index():return FileResponse(BASE/"static"/"index.html")
@app.get("/manifest.webmanifest")
def manifest():return FileResponse(BASE/"static"/"manifest.webmanifest",media_type="application/manifest+json")
@app.get("/sw.js")
def sw():return FileResponse(BASE/"static"/"sw.js",media_type="application/javascript")
