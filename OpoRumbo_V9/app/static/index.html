
from fastapi import FastAPI,HTTPException,Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel,EmailStr
from pathlib import Path
import json
from .db import init_db,register,login,user_from_token,get_progress,save_progress
from .planner import make_day,record_test,roadmap
from .researcher import search_catalog,search_boe,inspect_boe

BASE=Path(__file__).resolve().parent
CATALOG=json.loads((BASE/"catalog.json").read_text(encoding="utf-8"))
app=FastAPI(title="OpoRumbo V14",version="14.0")
init_db()

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
    exam_date:str
    days_per_week:int=6
    minutes_per_day:int=180
    target_rounds:int=3
    target_score:int=80
    mode:str="free"
class PlanReq(BaseModel):
    opposition_id:str
    minutes:int=180
    mode:str="free"
    academy_topic_indexes:list[int]=[]
    exam_date:str="2027-03-15"
    days_per_week:int=6
    target_rounds:int=3
class TestResultReq(BaseModel):
    opposition_id:str
    topic_index:int
    block_index:int=0
    score:int

def require_user(a):
    if not a or not a.lower().startswith("bearer "):raise HTTPException(401,"Falta sesión")
    u=user_from_token(a.split(" ",1)[1])
    if not u:raise HTTPException(401,"Sesión no válida")
    return u

def get_opp_for_progress(p, oid):
    if oid=="custom_researched":
        return p.get("custom_opposition")
    return next((o for o in CATALOG if o["id"]==oid),None)

@app.get("/api/health")
def health():return {"ok":True,"version":"14.0"}

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
    u=require_user(authorization);return get_progress(u["id"])

@app.put("/api/progress")
def save(x:SaveReq,authorization:str|None=Header(None)):
    u=require_user(authorization);save_progress(u["id"],x.data);return {"ok":True}

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
    return {"query":q,"catalog":search_catalog(CATALOG,q),"boe":await search_boe(q)}

@app.post("/api/research/select")
async def research_select(x:ResearchSelectReq,authorization:str|None=Header(None)):
    require_user(authorization)
    if x.kind=="catalog" and x.catalog_id:
        o=next((o for o in CATALOG if o["id"]==x.catalog_id),None)
        if not o:raise HTTPException(404,"Oposición no encontrada")
        return {"opposition":o,"status":"verified_catalog"}
    if x.kind=="boe" and x.boe_id:
        try:o=await inspect_boe(x.boe_id)
        except Exception:raise HTTPException(502,"No se pudo leer el documento BOE")
        return {"opposition":o,"status":"automatic_extraction"}
    raise HTTPException(400,"Selección no válida")

@app.post("/api/setup")
def setup(x:SetupReq,authorization:str|None=Header(None)):
    u=require_user(authorization);p=get_progress(u["id"]);o=x.opposition
    if not o.get("topics"):raise HTTPException(400,"No se ha detectado un temario utilizable")
    if o.get("id"):
        p["selected"]=o["id"];p.pop("custom_opposition",None)
    else:
        o["id"]="custom_researched";p["selected"]="custom_researched";p["custom_opposition"]=o
    p["setup_complete"]=True;p["mode"]=x.mode;p["academy_selected"]=[]
    p["settings"]={
        "exam_date":x.exam_date,
        "days_per_week":x.days_per_week,
        "target_rounds":x.target_rounds,
        "minutes_today":x.minutes_per_day,
        "minutes_default":x.minutes_per_day,
        "target_score":max(50,min(100,x.target_score))
    }
    p["topics"]={};p["tasks"]=[]
    save_progress(u["id"],p);return p

@app.post("/api/test/result")
def test_result(x:TestResultReq,authorization:str|None=Header(None)):
    u=require_user(authorization);p=get_progress(u["id"])
    opp=get_opp_for_progress(p,x.opposition_id)
    if not opp:raise HTTPException(404,"Oposición no encontrada")
    if not 0<=x.topic_index<len(opp["topics"]):raise HTTPException(400,"Tema no válido")
    target=int((p.get("settings") or {}).get("target_score",80))
    rec=record_test(p,x.topic_index,x.block_index,x.score,target)
    s=p.get("settings") or {}
    p["roadmap"]=roadmap(opp,p,s.get("exam_date","2027-03-15"),s.get("days_per_week",6),s.get("target_rounds",3))
    save_progress(u["id"],p)
    return {"result":rec,"progress":p}

@app.post("/api/plan/today")
def today(x:PlanReq,authorization:str|None=Header(None)):
    u=require_user(authorization);p=get_progress(u["id"])
    opp=get_opp_for_progress(p,x.opposition_id)
    if not opp:raise HTTPException(404,"Oposición no encontrada")
    p["selected"]=x.opposition_id;p["mode"]=x.mode;p["academy_selected"]=x.academy_topic_indexes
    old=p.get("settings") or {}
    p["settings"]={
        "exam_date":x.exam_date,
        "days_per_week":x.days_per_week,
        "target_rounds":x.target_rounds,
        "minutes_today":x.minutes,
        "minutes_default":x.minutes,
        "target_score":old.get("target_score",80)
    }
    result=make_day(opp,x.minutes,p,x.mode,x.academy_topic_indexes,x.exam_date,x.days_per_week,x.target_rounds)
    p["tasks"]=result["tasks"];p["roadmap"]=result["roadmap"];p["due_reviews"]=result["due_reviews"]
    save_progress(u["id"],p);return p

app.mount("/static",StaticFiles(directory=BASE/"static"),name="static")
@app.get("/")
def index():return FileResponse(BASE/"static"/"index.html")
@app.get("/manifest.webmanifest")
def manifest():return FileResponse(BASE/"static"/"manifest.webmanifest",media_type="application/manifest+json")
@app.get("/sw.js")
def sw():return FileResponse(BASE/"static"/"sw.js",media_type="application/javascript")
