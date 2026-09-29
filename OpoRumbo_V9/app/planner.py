
from datetime import date, datetime, timedelta
import math
from zoneinfo import ZoneInfo

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
    return datetime.now(ZoneInfo("Europe/Madrid")).date()

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
    counts=state.get("block_passes",{})
    return min(range(len(blocks)), key=lambda b: counts.get(str(b),1 if b<int(state.get("block",0)) else 0))

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
    from .workload import estimate
    return estimate(opposition, progress, exam_date, days_per_week, target_rounds, _today())


def make_day(opposition, minutes, progress, mode="free", academy_topic_indexes=None,
             exam_date=None, days_per_week=6, target_rounds=3, completed_tasks=None):
    from .workload import weights, pace, coverage, test_coverage, unit, practice_kinds
    minutes = max(0, int(minutes))
    target = progress.get("settings", {}).get("target_score", 80)
    personal = pace(progress)
    ws = weights(opposition)
    tasks = []
    remaining = minutes
    selected = list(dict.fromkeys(academy_topic_indexes or [])) if mode == "academy" else []
    completed_tasks = completed_tasks or []
    def task_key(task):
        kind=task.get("kind")
        if kind in ("study","academy","urgent_review","maintenance"):kind="reading"
        return kind,task.get("topic_index"),task.get("block_index")
    done_keys={task_key(t) for t in completed_tasks}
    task_limit=max(5,2*len(selected)+1) if selected else 5
    due = _due_reviews(opposition, progress)
    used_blocks = set()
    if mode=="academy" and not selected:
        return {"tasks":[],"roadmap":roadmap(opposition,progress,exam_date,days_per_week,target_rounds),"due_reviews":len(due)}

    def append(kind, w, base, category, title, fraction=1, cap=None, source=None):
        nonlocal remaining
        if remaining < 1 or len(tasks) >= task_limit: return
        if task_key({"kind":kind,**w}) in done_keys:return
        predicted = max(1, math.ceil(base*personal[category]["factor"]))
        allocation = min(remaining, predicted, cap if cap is not None else remaining)
        share = allocation/predicted
        task = {"kind":kind, "title":title, "detail":w["label"], "minutes":allocation,
            "baseline_minutes":round(base*share,6), "pace_category":category,
            "coverage":round(fraction*share,6), "xp":100 if kind in ("study","academy","test") else 60,
            "done":False, "target_score":target, "source":source or kind}
        if "topic_index" in w:
            task.update(topic_index=w["topic_index"], block_index=w["block_index"])
        if share < .999: task["detail"] += f" · aproximadamente {max(1,round(fraction*share*100))}% de esta vuelta"
        tasks.append(task); remaining -= allocation

    def pair(w, kind):
        i,b=w["topic_index"],w["block_index"]
        st=_topic_state(progress,i); done=coverage(st,b); tested=test_coverage(st,b); r=int(min(done,tested))
        score=st.get("reviews",{}).get(str(b),{}).get("last_score")
        category=w["pace_category"] or ("study" if r==0 else "review")
        fraction=max(0,1-min(1,done-r))
        base=unit(w["weight"],r,score=score,target=target)*fraction
        # Keep a test slot; a short day earns only its fraction, never a whole block.
        test_cap=min(15,max(1,remaining//5))
        cap=max(1,remaining-test_cap)
        if fraction>0: append(kind,w,base,category,("Academia · " if kind=="academy" else "")+f"Tema {i+1} · "+opposition["topics"][i]["name"],fraction,cap)
        test_fraction=max(0,1-min(1,tested-r))
        if remaining and test_fraction>0:
            append("test",w,unit(w["weight"],r,"test")*test_fraction,"test","Test del bloque",test_fraction,cap=test_cap if fraction else remaining,source=kind)
        used_blocks.add((i,b))

    # Every explicit selection must be represented, even after the daily budget
    # was spent. A completed pair already represents its topic today; don't
    # silently advance that topic to another block on every replan.
    academy_blocks=[]
    for i in selected:
        candidates=[w for w in ws if w["topic_index"]==i]
        if candidates:
            prior=next((t for t in completed_tasks if t.get("topic_index")==i and (t.get("kind")=="academy" or t.get("source")=="academy")),None)
            w=next((w for w in candidates if prior and w["block_index"]==prior.get("block_index")),None)
            w=w or min(candidates,key=lambda w:min(coverage(_topic_state(progress,i),w["block_index"]),test_coverage(_topic_state(progress,i),w["block_index"])))
            key=(i,w["block_index"])
            used_blocks.add(key)
            if ("reading",*key) not in done_keys or ("test",*key) not in done_keys:
                academy_blocks.append(w)
    academy_pool=max(minutes,30*len(academy_blocks))
    academy_spent=0
    for index,w in enumerate(academy_blocks):
        remaining=max(30,(academy_pool-academy_spent)//(len(academy_blocks)-index))
        allowance=remaining
        pair(w,"academy")
        academy_spent+=allowance-remaining
    remaining=max(0,minutes-academy_spent)
    for rev in (due if selected or len(ws)>1 else []):
        key=(rev["topic_index"],rev["block_index"])
        if key in used_blocks: continue  # The paired study/test already revisits it today.
        w=next(w for w in ws if (w["topic_index"],w["block_index"])==key)
        maintenance=rev.get("last_score") is not None and rev["last_score"]>=target
        append("maintenance" if maintenance else "urgent_review",w,
            unit(w["weight"],3,score=rev.get("last_score"),target=target),w["pace_category"] or "review",
            ("Mantenimiento" if maintenance else "Repaso prioritario")+f" · Tema {key[0]+1}",cap=max(1,minutes//5))
        used_blocks.add(key)
        break
    if not selected and ws and remaining:
        candidates=[w for w in ws if (w["topic_index"],w["block_index"]) not in used_blocks] or ws
        w=min(candidates,key=lambda w:(min(coverage(_topic_state(progress,w["topic_index"]),w["block_index"]),test_coverage(_topic_state(progress,w["topic_index"]),w["block_index"])),
            -_topic_priority(opposition["topics"][w["topic_index"]],_topic_state(progress,w["topic_index"]),target)))
        # Reserve practice for the catalogue opposition that includes these exams.
        reserve=min(30,remaining//4) if practice_kinds(opposition) and remaining>=60 else 0
        remaining-=reserve
        pair(w,"study")
        remaining+=reserve
    if practice_kinds(opposition):
        for kind,title in (("english","Inglés"),("psy","Psicotécnicos")):
            if kind in practice_kinds(opposition) and remaining>=1:
                append(kind,{"label":"Práctica + mini test"},15,kind,title,cap=max(1,remaining//2) if kind=="english" else remaining)
    return {"tasks":tasks, "roadmap":roadmap(opposition,progress,exam_date,days_per_week,target_rounds),"due_reviews":len(due)}
