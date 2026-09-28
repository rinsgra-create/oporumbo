
from datetime import date, datetime
import math

def _state(progress, i):
    return (progress.get("topics") or {}).get(str(i), {})

def _priority(topic, state):
    score = state.get("score")
    block = int(state.get("block", 0))
    p = 50
    if score is None:
        p += 20
    elif score < 60:
        p += 70 + (60-score)*0.8
    elif score < 80:
        p += 30 + (80-score)*0.4
    else:
        p -= min(20, (score-80)*0.5)
    p += max(0, len(topic.get("blocks", [])) - block) * 4
    return p

def _next_block(topic, state):
    blocks = topic.get("blocks", [])
    if not blocks:
        return 0
    return min(int(state.get("block", 0)), len(blocks)-1)

def _days_until(exam_date):
    try:
        d = datetime.strptime(exam_date, "%Y-%m-%d").date()
        return max(1, (d - date.today()).days)
    except Exception:
        return 180

def _study_days_left(days_left, days_per_week):
    weeks = days_left / 7.0
    return max(1, round(weeks * max(1, min(7, days_per_week))))

def roadmap(opposition, progress, exam_date, days_per_week=6, target_rounds=3):
    topics = opposition["topics"]
    total_blocks = sum(max(1, len(t.get("blocks", []))) for t in topics)
    completed_first = 0
    for i,t in enumerate(topics):
        completed_first += min(int(_state(progress,i).get("block",0)), max(1,len(t.get("blocks",[]))))

    days_left = _days_until(exam_date)
    study_days = _study_days_left(days_left, days_per_week)

    # Effort assumptions: first pass deeper, later passes faster.
    # These are intentionally transparent estimates, not promises.
    pass_minutes = [75, 45, 30, 25, 20]
    target_rounds = max(1, min(5, int(target_rounds)))

    remaining_first_blocks = max(0, total_blocks - completed_first)
    required = remaining_first_blocks * pass_minutes[0]
    for r in range(1, target_rounds):
        required += total_blocks * pass_minutes[min(r, len(pass_minutes)-1)]

    minutes_per_study_day = math.ceil(required / study_days)
    first_progress = completed_first / total_blocks if total_blocks else 0

    # Equivalent rounds already achieved only counts first-pass coverage at this stage.
    current_round_equiv = round(first_progress, 2)

    if first_progress < 0.95:
        phase = "Primera vuelta"
    elif first_progress < 1:
        phase = "Cierre primera vuelta"
    else:
        phase = "Repasos y vueltas sucesivas"

    return {
        "days_left": days_left,
        "study_days_left": study_days,
        "total_blocks": total_blocks,
        "completed_first_blocks": completed_first,
        "first_round_pct": round(first_progress*100),
        "target_rounds": target_rounds,
        "estimated_minutes_required": required,
        "required_minutes_per_study_day": minutes_per_study_day,
        "current_round_equivalent": current_round_equiv,
        "phase": phase,
        "assumptions": {
            "first_round_min_per_block": 75,
            "second_round_min_per_block": 45,
            "third_round_min_per_block": 30
        }
    }

def make_day(opposition, minutes, progress, mode="free", academy_topic_indexes=None,
             exam_date=None, days_per_week=6, target_rounds=3):
    minutes = max(30, int(minutes))
    states = progress.get("topics", {})
    academy_topic_indexes = academy_topic_indexes or []
    tasks = []

    if mode == "academy" and academy_topic_indexes:
        academy_total = max(30, round(minutes * 0.55))
        per = max(20, academy_total // max(1, len(academy_topic_indexes)))
        used = 0

        for idx in academy_topic_indexes:
            if idx < 0 or idx >= len(opposition["topics"]):
                continue
            t = opposition["topics"][idx]
            st = states.get(str(idx), {})
            bi = _next_block(t, st)
            blocks = t.get("blocks") or [t["name"]]
            tasks.append({
                "kind":"academy","topic_index":idx,"block_index":bi,
                "title":f"Academia · Tema {t['n']} · {t['name']}",
                "detail":blocks[bi],"minutes":per,"xp":120,"done":False,"fixed":True
            })
            test_m = max(10, round(per * .28))
            tasks.append({
                "kind":"test","topic_index":idx,"block_index":bi,
                "title":f"Test Tema {t['n']}","detail":blocks[bi],
                "minutes":test_m,"xp":90,"done":False,"fixed":False
            })
            used += per + test_m

        remaining = max(20, minutes-used)
        candidates = []
        for i,t in enumerate(opposition["topics"]):
            if i in academy_topic_indexes:
                continue
            st = states.get(str(i), {})
            candidates.append((_priority(t,st),i,t,st))
        if candidates:
            _,i,t,st = max(candidates,key=lambda x:x[0])
            bi = _next_block(t,st)
            blocks = t.get("blocks") or [t["name"]]
            rep = min(max(15, round(remaining*.45)), remaining)
            tasks.append({
                "kind":"review","topic_index":i,"block_index":bi,
                "title":f"Repaso recomendado · Tema {t['n']}",
                "detail":blocks[bi],"minutes":rep,"xp":70,"done":False,"fixed":False
            })
            remaining = max(0, remaining-rep)

        if remaining >= 20:
            eng = max(10, remaining//2)
            psy = max(10, remaining-eng)
            tasks += [
                {"kind":"english","title":"Inglés","detail":"Gramática + comprensión + mini test","minutes":eng,"xp":60,"done":False,"fixed":False},
                {"kind":"psy","title":"Psicotécnicos","detail":"Bloque cronometrado","minutes":psy,"xp":60,"done":False,"fixed":False}
            ]
    else:
        candidates = []
        for i,t in enumerate(opposition["topics"]):
            st = states.get(str(i), {})
            candidates.append((_priority(t,st),i,t,st))
        _,i,t,st = max(candidates,key=lambda x:x[0])
        bi = _next_block(t,st)
        blocks = t.get("blocks") or [t["name"]]

        study = max(25, round(minutes*.35))
        test = max(15, round(minutes*.15))
        review = max(15, round(minutes*.15))
        english = max(20, round(minutes*.18))
        psy = max(15, minutes-study-test-review-english)
        tasks = [
            {"kind":"study","topic_index":i,"block_index":bi,"title":f"Tema {t['n']} · {t['name']}","detail":blocks[bi],"minutes":study,"xp":100,"done":False,"fixed":False},
            {"kind":"test","topic_index":i,"block_index":bi,"title":"Test del bloque","detail":blocks[bi],"minutes":test,"xp":120,"done":False,"fixed":False},
            {"kind":"review","topic_index":i,"block_index":bi,"title":"Repaso / consolidación","detail":"Recuerdo activo + errores anteriores","minutes":review,"xp":80,"done":False,"fixed":False},
            {"kind":"english","title":"Inglés","detail":"Gramática + comprensión + mini test","minutes":english,"xp":70,"done":False,"fixed":False},
            {"kind":"psy","title":"Psicotécnicos","detail":"Bloque cronometrado","minutes":psy,"xp":70,"done":False,"fixed":False},
        ]

    return {
        "tasks": tasks,
        "roadmap": roadmap(opposition, progress, exam_date or "2027-03-15", days_per_week, target_rounds)
    }
