
import os, json, datetime, secrets
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, update
from sqlalchemy.orm import declarative_base, sessionmaker
from passlib.context import CryptContext

DATABASE_URL=os.getenv("DATABASE_URL","sqlite:///./oporumbov9.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL="postgresql+psycopg://"+DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL="postgresql+psycopg://"+DATABASE_URL[len("postgresql://"):]

connect_args={"check_same_thread":False} if DATABASE_URL.startswith("sqlite") else {}
engine=create_engine(DATABASE_URL,pool_pre_ping=True,connect_args=connect_args)
SessionLocal=sessionmaker(bind=engine,autoflush=False,autocommit=False)
Base=declarative_base()
pwd=CryptContext(schemes=["bcrypt"],deprecated="auto")

class User(Base):
    __tablename__="users"
    id=Column(Integer,primary_key=True)
    email=Column(String(320),unique=True,index=True,nullable=False)
    password_hash=Column(String(255),nullable=False)
    created_at=Column(String(40),nullable=False)
class SessionToken(Base):
    __tablename__="sessions"
    token=Column(String(128),primary_key=True)
    user_id=Column(Integer,ForeignKey("users.id"),nullable=False)
    created_at=Column(String(40),nullable=False)
class Progress(Base):
    __tablename__="progress"
    user_id=Column(Integer,ForeignKey("users.id"),primary_key=True)
    data=Column(Text,nullable=False)
    updated_at=Column(String(40),nullable=False)

def init_db(): Base.metadata.create_all(engine)

def register(email,password):
    s=SessionLocal()
    try:
        email=email.strip().lower()
        if s.query(User).filter(User.email==email).first(): return None
        u=User(email=email,password_hash=pwd.hash(password),created_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
        s.add(u);s.commit();s.refresh(u)
        default={"selected":"cabo_gc","mode":"free","academy_selected":[],"xp":0,"topics":{},"tasks":[]}
        s.add(Progress(user_id=u.id,data=json.dumps(default),updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat()));s.commit()
        return create_session(u.id)
    finally:s.close()

def login(email,password):
    s=SessionLocal()
    try:
        u=s.query(User).filter(User.email==email.strip().lower()).first()
        if not u or not pwd.verify(password,u.password_hash): return None
        return create_session(u.id)
    finally:s.close()

def create_session(uid):
    token=secrets.token_urlsafe(40);s=SessionLocal()
    try:s.add(SessionToken(token=token,user_id=uid,created_at=datetime.datetime.now(datetime.timezone.utc).isoformat()));s.commit()
    finally:s.close()
    return token

def user_from_token(token):
    s=SessionLocal()
    try:
        st=s.query(SessionToken).filter(SessionToken.token==token).first()
        if not st:return None
        u=s.query(User).filter(User.id==st.user_id).first()
        return {"id":u.id,"email":u.email} if u else None
    finally:s.close()

def get_progress(uid):
    s=SessionLocal()
    try:
        p=s.query(Progress).filter(Progress.user_id==uid).first()
        return json.loads(p.data) if p else {"selected":"cabo_gc","mode":"free","academy_selected":[],"xp":0,"topics":{},"tasks":[]}
    finally:s.close()

def save_progress(uid,data):
    s=SessionLocal()
    try:
        p=s.query(Progress).filter(Progress.user_id==uid).first()
        now=datetime.datetime.now(datetime.timezone.utc).isoformat()
        if p:p.data=json.dumps(data,ensure_ascii=False);p.updated_at=now
        else:s.add(Progress(user_id=uid,data=json.dumps(data,ensure_ascii=False),updated_at=now))
        s.commit()
    finally:s.close()

class ProgressConflict(Exception):
    pass

def mutate_progress(uid, change, expected_revision=None):
    """Compare-and-swap the existing JSON row; no schema migration required.

    The conditional UPDATE also protects SQLite and simultaneous Render workers.
    A failed write never replaces progress from another session.
    """
    with SessionLocal() as s:
        row=s.query(Progress).filter(Progress.user_id==uid).first()
        if row is None:
            raise ProgressConflict("No se ha encontrado el progreso de esta cuenta")
        original=row.data
        data=json.loads(original)
        revision=int(data.get("_revision",0))
        if expected_revision is not None and revision != expected_revision:
            raise ProgressConflict("Tu progreso cambió en otra sesión. Se ha actualizado la pantalla; vuelve a intentarlo.")
        change(data)
        data["_revision"]=revision+1
        result=s.execute(update(Progress).where(
            Progress.user_id==uid, Progress.data==original
        ).values(data=json.dumps(data,ensure_ascii=False),
                 updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat()),
                 execution_options={"synchronize_session":False})
        if result.rowcount != 1:
            s.rollback()
            raise ProgressConflict("Otro dispositivo acaba de guardar cambios. Actualiza y vuelve a intentarlo.")
        s.commit()
        return data
