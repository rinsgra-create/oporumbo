
def _priority(topic,state):
    score=state.get("score")
    block=int(state.get("block",0))
    p=50
    if score is None: p+=20
    elif score<60: p+=70
    elif score<80: p+=30
    else: p-=15
    p+=max(0,len(topic.get("blocks",[]))-block)*5
    return p

def _next_block(topic,state):
    return min(int(state.get("block",0)), max(0,len(topic.get("blocks",[]))-1))

def make_day(opposition, minutes, progress, mode="free", academy_topic_indexes=None):
    minutes=max(30,int(minutes))
    states=progress.get("topics",{})
    academy_topic_indexes=academy_topic_indexes or []
    tasks=[]

    if mode=="academy" and academy_topic_indexes:
        fixed_count=len(academy_topic_indexes)
        # 55% of time goes to academy topics, divided across selected topics
        academy_total=max(30, round(minutes*0.55))
        per=max(20, academy_total//fixed_count)
        used=0
        for idx in academy_topic_indexes:
            if idx<0 or idx>=len(opposition["topics"]): 
                continue
            t=opposition["topics"][idx]
            st=states.get(str(idx),{})
            bi=_next_block(t,st)
            tasks.append({
                "kind":"academy",
                "topic_index":idx,
                "block_index":bi,
                "title":f"Academia · Tema {t['n']} · {t['name']}",
                "detail":t["blocks"][bi],
                "minutes":per,
                "xp":120,
                "done":False,
                "fixed":True
            })
            used += per
            # Add a test tied to the academy topic, lighter weight
            test_m=max(10, round(per*0.30))
            tasks.append({
                "kind":"test",
                "topic_index":idx,
                "block_index":bi,
                "title":f"Test Tema {t['n']}",
                "detail":f"Solo sobre {t['blocks'][bi]}",
                "minutes":test_m,
                "xp":90,
                "done":False,
                "fixed":False
            })
            used += test_m

        remaining=max(20, minutes-used)

        # Fill remaining time with adaptive support tasks
        candidates=[]
        for i,t in enumerate(opposition["topics"]):
            if i in academy_topic_indexes: 
                continue
            st=states.get(str(i),{})
            candidates.append((_priority(t,st),i,t,st))
        if candidates:
            _,i,t,st=max(candidates,key=lambda x:x[0])
            bi=_next_block(t,st)
            rep=min(max(15, round(remaining*0.45)), remaining)
            tasks.append({
                "kind":"review",
                "topic_index":i,
                "block_index":bi,
                "title":f"Repaso recomendado · Tema {t['n']}",
                "detail":t["blocks"][bi],
                "minutes":rep,
                "xp":70,
                "done":False,
                "fixed":False
            })
            remaining=max(0,remaining-rep)

        if remaining>=15:
            eng=max(15,remaining//2)
            psy=max(15,remaining-eng)
            tasks.append({"kind":"english","title":"Inglés","detail":"Gramática + comprensión + mini test","minutes":eng,"xp":60,"done":False,"fixed":False})
            tasks.append({"kind":"psy","title":"Psicotécnicos","detail":"Bloque cronometrado","minutes":psy,"xp":60,"done":False,"fixed":False})
        return tasks

    # Free mode: app decides everything
    candidates=[]
    for i,t in enumerate(opposition["topics"]):
        st=states.get(str(i),{})
        candidates.append((_priority(t,st),i,t,st))
    _,i,t,st=max(candidates,key=lambda x:x[0])
    bi=_next_block(t,st)

    study=max(25,round(minutes*.35))
    test=max(15,round(minutes*.15))
    review=max(15,round(minutes*.15))
    english=max(20,round(minutes*.18))
    psy=max(15,minutes-study-test-review-english)
    return [
      {"kind":"study","topic_index":i,"block_index":bi,"title":f"Tema {t['n']} · {t['name']}","detail":t["blocks"][bi],"minutes":study,"xp":100,"done":False,"fixed":False},
      {"kind":"test","topic_index":i,"block_index":bi,"title":"Test del bloque","detail":t["blocks"][bi],"minutes":test,"xp":120,"done":False,"fixed":False},
      {"kind":"review","topic_index":i,"block_index":bi,"title":"Repaso / consolidación","detail":"Recuerdo activo + errores anteriores","minutes":review,"xp":80,"done":False,"fixed":False},
      {"kind":"english","title":"Inglés","detail":"Gramática + comprensión + mini test","minutes":english,"xp":70,"done":False,"fixed":False},
      {"kind":"psy","title":"Psicotécnicos","detail":"Bloque cronometrado","minutes":psy,"xp":70,"done":False,"fixed":False}
    ]
