
from datetime import date, datetime, timedelta
import math

def _topic_state(progress, idx):
    topics = progress.setdefault("topics", {})
    return topics.setdefault(str(idx), {
        "block": 0,
        "score": None,
        "tests": [],
        "reviews": {}
    })

def _review_key(block_idx):
    return str(int(block_idx))

def _parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None

def _today():
    return date.today()

def review_interval(score, target=80, streak=0):
    """
    Adaptive interval in days.
    Low scores repeat quickly.
    High scores still return later for forgetting-curve maintenance.
    """
    if score < 50:
        base = 1
    elif score < 65:
        base = 2
    elif score < target:
        base = 4
    elif score < 90:
        base = 8
    elif score < 95:
        base = 14
    else:
        base = 24

    # Repeated successful recalls stretch spacing.
    if score >= target:
        multiplier = 1 + min(2.0, max(0, streak) * 0.35)
        base = round(base * multiplier)

    return max(1, min(60, base))

def mastery_from_score(score, target):
    if score is None:
        return 0
    # 100% mastery corresponds to target score or above, but we preserve headroom.
    return max(0, min(100, round((score / max(1, target)) * 85 + max(0, score-target)*0.5)))

def record_test(progress, topic_idx, block_idx, score, target=80):
    st = _topic_state(progress, topic_idx)
    score = max(0, min(100, int(score)))
    tests = st.setdefault("tests", [])
    same = [x for x in tests if int(x.get("block", -1)) == int(block_idx)]
    success_streak = 0
    for x in reversed(same):
        if int(x.get("score", 0)) >= target:
            success_streak += 1
        else:
            break

    interval = review_interval(score, target, success_streak)
    due = _today() + timedelta(days=interval)
    status = (
        "critical" if score < 50 else
        "weak" if score < 65 else
        "below_target" if score < target else
        "good" if score < 90 else
        "strong" if score < 95 else
        "excellent"
    )

    rec = {
        "date": _today().isoformat(),
        "block": int(block_idx),
        "score": score,
        "target": int(target),
        "status": status,
        "next_review": due.isoformat(),
        "interval_days": interval
    }
    tests.append(rec)
    st["score"] = score
    st.setdefault("reviews", {})[_review_key(block_idx)] = {
        "last_score": score,
        "next_review": due.isoformat(),
        "interval_days": interval,
        "status": status
    }
    return rec

def _due_reviews(opposition, progress):
    due = []
    today = _today()
    target = int((progress.get("settings") or {}).get("target_score", 80))
    for i, topic in enumerate(opposition.get("topics", [])):
        st = _topic_state(progress, i)
        for block_key, rev in (st.get("reviews") or {}).items():
            d = _parse_date(rev.get("next_review"))
            if d and d <= today:
                b = int(block_key)
                blocks = topic.get("blocks") or [topic.get("name", f"Tema {i+1}")]
                b = min(max(0, b), len(blocks)-1)
                score = rev.get("last_score")
                urgency = 100
                if score is not None:
                    urgency += max(0, target - int(score)) * 2
                urgency += max(0, (today-d).days) * 5
                due.append({
                    "priority": urgency,
                    "topic_index": i,
                    "block_index": b,
                    "topic": topic,
                    "detail": blocks[b],
                    "last_score": score,
                    "status": rev.get("status"),
                    "due": rev.get("next_review")
                })
    due.sort(key=lambda x: x["priority"], reverse=True)
    return due

def _next_block(topic, state):
    blocks = topic.get("blocks") or [topic.get("name", "Bloque")]
    return min(int(state.get("block", 0)), len(blocks)-1)

def _topic_priority(topic, state, target):
    score = state.get("score")
    p = 45
    if score is None:
        p += 25
    elif score < 50:
        p += 90
    elif score < 65:
        p += 65
    elif score < target:
        p += 40
    elif score < 90:
        p += 15
    else:
        p -= 10

    blocks = topic.get("blocks") or [topic.get("name", "Bloque")]
    p += max(0, len(blocks) - int(state.get("block", 0))) * 3
    return p

def roadmap(opposition, progress, exam_date, days_per_week=6, target_rounds=3):
    topics = opposition["topics"]
    total_blocks = sum(max(1, len(t.get("blocks", []))) for t in topics)
    completed = 0
    for i, t in enumerate(topics):
        completed += min(int(_topic_state(progress, i).get("block", 0)), max(1, len(t.get("blocks", []))))

    try:
        exam = datetime.strptime(exam_date, "%Y-%m-%d").date()
        days_left = max(1, (exam - _today()).days)
    except Exception:
        days_left = 180

    study_days = max(1, round((days_left/7) * max(1, min(7, int(days_per_week)))))
    target_rounds = max(1, min(5, int(target_rounds)))
    pass_minutes = [75,45,30,25,20]

    required = max(0, total_blocks-completed) * pass_minutes[0]
    for r in range(1, target_rounds):
        required += total_blocks * pass_minutes[min(r, len(pass_minutes)-1)]

    target_score = int((progress.get("settings") or {}).get("target_score", 80))
    scores = []
    for i,_ in enumerate(topics):
        st = _topic_state(progress, i)
        for x in st.get("tests", []):
            if x.get("score") is not None:
                scores.append(int(x["score"]))
    avg_score = round(sum(scores)/len(scores),1) if scores else None

    return {
        "days_left": days_left,
        "study_days_left": study_days,
        "total_blocks": total_blocks,
        "completed_first_blocks": completed,
        "first_round_pct": round(completed/total_blocks*100) if total_blocks else 0,
        "target_rounds": target_rounds,
        "estimated_minutes_required": required,
        "required_minutes_per_study_day": math.ceil(required/study_days),
        "target_score": target_score,
        "average_test_score": avg_score,
        "mastery_index": round(sum(mastery_from_score(s,target_score) for s in scores)/len(scores),1) if scores else 0,
        "tests_recorded": len(scores)
    }

def make_day(opposition, minutes, progress, mode="free", academy_topic_indexes=None,
             exam_date=None, days_per_week=6, target_rounds=3):
    minutes = max(30, int(minutes))
    target = int((progress.get("settings") or {}).get("target_score", 80))
    academy_topic_indexes = academy_topic_indexes or []
    tasks = []
    remaining = minutes

    # 1) Due review first. Only one urgent review in a normal day.
    due = _due_reviews(opposition, progress)
    if due:
        r = due[0]
        score = r.get("last_score")
        maintenance = score is not None and score >= target
        rev_minutes = 12 if maintenance else 25
        rev_minutes = min(rev_minutes, max(10, round(minutes*0.20)))
        tasks.append({
            "kind":"maintenance" if maintenance else "urgent_review",
            "topic_index":r["topic_index"],
            "block_index":r["block_index"],
            "title":("Mantenimiento" if maintenance else "Repaso prioritario") + f" · Tema {r['topic'].get('n',r['topic_index']+1)}",
            "detail":r["detail"],
            "minutes":rev_minutes,
            "xp":60 if maintenance else 90,
            "done":False,
            "last_score":score,
            "target_score":target
        })
        remaining -= rev_minutes

    # 2) Academy-required content or adaptive main study.
    if mode == "academy" and academy_topic_indexes:
        per = max(20, round(max(30, remaining*0.58)/len(academy_topic_indexes)))
        for idx in academy_topic_indexes:
            if not (0 <= idx < len(opposition["topics"])):
                continue
            t = opposition["topics"][idx]
            st = _topic_state(progress, idx)
            bi = _next_block(t, st)
            blocks = t.get("blocks") or [t["name"]]
            tasks.append({
                "kind":"academy","topic_index":idx,"block_index":bi,
                "title":f"Academia · Tema {t.get('n',idx+1)} · {t['name']}",
                "detail":blocks[bi],"minutes":per,"xp":110,"done":False
            })
            tasks.append({
                "kind":"test","topic_index":idx,"block_index":bi,
                "title":f"Test · Tema {t.get('n',idx+1)}",
                "detail":blocks[bi],"minutes":15,"xp":100,"done":False,
                "target_score":target
            })
            remaining -= per+15
    else:
        candidates=[]
        for i,t in enumerate(opposition["topics"]):
            st=_topic_state(progress,i)
            candidates.append((_topic_priority(t,st,target),i,t,st))
        _,i,t,st=max(candidates,key=lambda x:x[0])
        bi=_next_block(t,st)
        blocks=t.get("blocks") or [t["name"]]
        study=max(25,round(max(40,remaining)*0.48))
        test=max(15,round(max(30,remaining)*0.20))
        tasks += [
            {"kind":"study","topic_index":i,"block_index":bi,
             "title":f"Tema {t.get('n',i+1)} · {t['name']}",
             "detail":blocks[bi],"minutes":study,"xp":100,"done":False},
            {"kind":"test","topic_index":i,"block_index":bi,
             "title":"Test del bloque","detail":blocks[bi],
             "minutes":test,"xp":120,"done":False,"target_score":target}
        ]
        remaining -= study+test

    # 3) Keep ancillary tests only if time remains.
    if remaining >= 35:
        eng = max(15, remaining//2)
        psy = max(15, remaining-eng)
        tasks += [
            {"kind":"english","title":"Inglés","detail":"Práctica + mini test","minutes":eng,"xp":60,"done":False},
            {"kind":"psy","title":"Psicotécnicos","detail":"Bloque cronometrado","minutes":psy,"xp":60,"done":False}
        ]

    return {
        "tasks": tasks,
        "roadmap": roadmap(opposition, progress, exam_date or "2027-03-15", days_per_week, target_rounds),
        "due_reviews": len(due)
    }
