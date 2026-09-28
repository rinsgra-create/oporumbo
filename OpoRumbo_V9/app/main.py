
from fastapi import FastAPI,HTTPException,Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel,EmailStr
from pathlib import Path
import json
from .db import init_db,register,login,user_from_token,get_progress,save_progress
from .planner import make_day, roadmap

BASE=Path(__file__).resolve().parent
CATALOG=json.loads((BASE/"catalog.json").read_text(encoding="utf-8"))
app=FastAPI(title="OpoRumbo V11",version="11.0")
init_db()

class AuthReq(BaseModel):
    email:EmailStr
    password:str
class SaveReq(BaseModel):
    data:dict
class PlanReq(BaseModel):
    opposition_id:str
    minutes:int=180
    mode:str="free"
    academy_topic_indexes:list[int]=[]
    exam_date:str="2027-03-15"
    days_per_week:int=6
    target_rounds:int=3

def require_user(a):
    if not a or not a.lower().startswith("bearer "): raise HTTPException(401,"Falta sesión")
    u=user_from_token(a.split(" ",1)[1])
    if not u: raise HTTPException(401,"Sesión no válida")
    return u

@app.get("/api/health")
def health(): return {"ok":True,"version":"11.0"}

@app.post("/api/register")
def api_register(x:AuthReq):
    if len(x.password)<8: raise HTTPException(400,"Usa al menos 8 caracteres")
    token=register(x.email,x.password)
    if not token: raise HTTPException(409,"Ese correo ya está registrado")
    return {"token":token}

@app.post("/api/login")
def api_login(x:AuthReq):
    token=login(x.email,x.password)
    if not token: raise HTTPException(401,"Credenciales incorrectas")
    return {"token":token}

@app.get("/api/me")
def me(authorization:str|None=Header(None)): return require_user(authorization)

@app.get("/api/progress")
def progress(authorization:str|None=Header(None)):
    u=require_user(authorization); return get_progress(u["id"])

@app.put("/api/progress")
def save(x:SaveReq,authorization:str|None=Header(None)):
    u=require_user(authorization); save_progress(u["id"],x.data); return {"ok":True}

@app.get("/api/oppositions")
def oppositions():
    return [{"id":o["id"],"name":o["name"],"year":o["year"],"topics":len(o["topics"])} for o in CATALOG]

@app.get("/api/oppositions/{oid}")
def get_opposition(oid:str):
    o=next((o for o in CATALOG if o["id"]==oid),None)
    if not o: raise HTTPException(404,"Oposición no encontrada")
    return o

@app.post("/api/plan/today")
def today(x:PlanReq,authorization:str|None=Header(None)):
    u=require_user(authorization); p=get_progress(u["id"])
    opp=next((o for o in CATALOG if o["id"]==x.opposition_id),None)
    if not opp: raise HTTPException(404,"Oposición no encontrada")

    p["selected"]=x.opposition_id
    p["mode"]=x.mode
    p["academy_selected"]=x.academy_topic_indexes
    p["settings"]={
        "exam_date":x.exam_date,
        "days_per_week":x.days_per_week,
        "target_rounds":x.target_rounds,
        "minutes_today":x.minutes
    }

    result=make_day(
        opp,x.minutes,p,x.mode,x.academy_topic_indexes,
        x.exam_date,x.days_per_week,x.target_rounds
    )
    p["tasks"]=result["tasks"]
    p["roadmap"]=result["roadmap"]
    save_progress(u["id"],p)
    return p

app.mount("/static",StaticFiles(directory=BASE/"static"),name="static")
@app.get("/")
def index(): return FileResponse(BASE/"static"/"index.html")

@app.get("/manifest.webmanifest")
def manifest(): return FileResponse(BASE/"static"/"manifest.webmanifest",media_type="application/manifest+json")

@app.get("/sw.js")
def sw(): return FileResponse(BASE/"static"/"sw.js",media_type="application/javascript")
