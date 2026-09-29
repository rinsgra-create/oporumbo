"""Deterministic, approximate workload model. See MODEL_V19.md for assumptions.

All time constants live here. Official text is evidence, never an official time
estimate. No remote requests, wall clock, or mutations in estimate().
"""
import math
import re
from datetime import date, timedelta
from statistics import median

SCHEMA = 1
CONFIG = {
    "study_minutes": 60, "test_minutes": 15,
    "round_factors": (1.0, .50, .30, .20, .16),
    "test_factors": (1.0, .90, 1.10, .80, .70),
    "prior_sessions": 5, "personalized_sessions": 5,
    "buffer_fraction": .10, "practice_minutes_per_block": 10,
}
CATEGORIES = ("study", "review", "test", "english", "psy")


def practice_kinds(opposition):
    """Only supported practices declared by the program; preserve legacy Cabo."""
    requested=opposition.get("practice_kinds", ["english","psy"] if opposition.get("id")=="cabo_gc" else [])
    return tuple(k for k in ("english","psy") if k in requested)


def blocks(topic):
    return topic.get("blocks") or [topic.get("name", "Bloque")]


def coverage(state, b):
    value = float(state.get("block_coverage", {}).get(str(b),
        state.get("block_passes", {}).get(str(b), 1 if b < int(state.get("block", 0)) else 0)))
    return float(round(value)) if abs(value-round(value)) < .00001 else value


def test_coverage(state, b):
    recorded=sum(1 for t in state.get("tests",[]) if t.get("block")==b)
    return float(state.get("test_coverage",{}).get(str(b),max(recorded,int(coverage(state,b)))))


def weights(opposition):
    result = []
    for i, topic in enumerate(opposition.get("topics", [])):
        for b, value in enumerate(blocks(topic)):
            text = str(value)
            meta = (topic.get("block_metadata") or {}).get(str(b), {})
            source = meta.get("source_url") or opposition.get("source_url")
            evidence = "official" if source and source.startswith("https://www.boe.es/") else "inferred"
            ranges = re.findall(r"art[íi]culos?\s+(\d+)\s*(?:a|al|[-–])\s*(\d+)", text, re.I)
            count = sum(int(z)-int(a)+1 for a,z in ranges if 0 < int(a) <= int(z) <= 10000)
            weight, method = 1.0, "Volumen desconocido: bloque medio provisional"
            if meta.get("weight") is not None:
                weight = max(.25, min(12, float(meta["weight"])))
                method, evidence = "Peso manual declarado", "manual"
            elif meta.get("pages") and float(meta["pages"]) > 0:
                weight = max(.5, min(12, float(meta["pages"])/15))
                method = "Páginas declaradas / 15; densidad desconocida"
                evidence = "manual"
            elif count:
                weight = max(.5, min(12, count/20))
                method = f"Rangos explícitos: {count} artículos; longitud individual desconocida"
            elif re.search(r"cap[íi]tulo", text, re.I):
                weight, method = .75, "Capítulo citado: extensión aproximada"
            elif re.search(r"t[íi]tulo", text, re.I):
                weight, method = 1.5, "Título citado: extensión aproximada"
            elif re.search(r"\b(ley|LO|RD|Real Decreto)\s+\d", text, re.I):
                weight, method = 2.5, "Norma citada sin alcance delimitado: volumen aproximado, pendiente de revisar"
            elif len(re.split(r"[;•]", text)) > 1:
                weight = min(4, len(re.split(r"[;•]", text))*.6)
                method = "Subapartados explícitos del programa; extensión aproximada"
            result.append({"topic_index": i, "block_index": b, "label": text,
                "weight": round(weight, 3), "size": "corto" if weight < 1 else "medio" if weight < 1.6 else "largo" if weight < 3 else "muy largo",
                "pace_category": "english" if re.search(r"\bingl[eé]s\b|\benglish\b",topic.get("name","")+" "+text,re.I) else "psy" if re.search(r"psicot[eé]cnic",topic.get("name","")+" "+text,re.I) else None,
                "method": method, "evidence_source": evidence, "source_url": source,
                "estimate_source": "manual" if evidence == "manual" else "inferred", "approximate": True})
    return result


def pace(progress):
    sessions = progress.get("pacing", {}).get("sessions", [])
    result = {}
    for kind in CATEGORIES:
        ratios = [s["actual_minutes"]/s["baseline_minutes"] for s in sessions
            if s.get("category") == kind and (s.get("baseline_minutes") or 0) > 0 and s.get("actual_minutes", 0) > 0][-60:]
        n = len(ratios)
        robust = max(.25, min(4, median(ratios))) if n else 1
        blend = n/(n+CONFIG["prior_sessions"])
        result[kind] = {"factor": round(1 + blend*(robust-1), 4), "sessions": n,
            "personalized": n >= CONFIG["personalized_sessions"]}
    return result


def mastery_factor(score, target=80):
    if score is None: return 1.0
    if score < 50: return 1.5
    if score < target: return 1.2
    return .65 if score >= 90 else .85


def unit(weight, round_index, category="study", score=None, target=80):
    r = min(4, max(0, round_index))
    if category in ("english", "psy"):
        return CONFIG["practice_minutes_per_block"] * weight
    if category == "test":
        return CONFIG["test_minutes"] * weight * CONFIG["test_factors"][r]
    return CONFIG["study_minutes"] * weight * CONFIG["round_factors"][r] * (mastery_factor(score, target) if r else 1)


def record_session(progress, task, actual_minutes, today):
    if actual_minutes is None: return
    baseline = task.get("baseline_minutes")
    p = progress.setdefault("pacing", {"schema": SCHEMA, "sessions": []})
    p["sessions"].append({"task_id": task["id"], "date": today.isoformat(),
        "topic_index": task.get("topic_index"), "block_index": task.get("block_index"),
        "kind": task["kind"], "category": task.get("pace_category", task["kind"]),
        "actual_minutes": actual_minutes, "baseline_minutes": baseline,
        "planned_minutes": task["minutes"], "coverage": task.get("coverage", 1)})
    task["actual_minutes"] = actual_minutes


def earned_minutes(opposition, progress, rounds):
    """Baseline work credited; unaffected by later scores or pace estimates."""
    earned=0
    for w in weights(opposition):
        st=progress.get("topics",{}).get(str(w["topic_index"]),{})
        done=coverage(st,w["block_index"]); tested=test_coverage(st,w["block_index"])
        for r in range(rounds):
            earned+=min(1,max(0,done-r))*unit(w["weight"],r)
            earned+=min(1,max(0,tested-r))*unit(w["weight"],r,"test")
    return earned+sum(progress.get("practice_credit",{}).values())+sum(st.get("review_work_minutes",0) for st in progress.get("topics",{}).values())


def estimate(opposition, progress, exam_date, days_per_week, target_rounds, today):
    from .planner import review_interval, mastery_from_score
    try: exam = date.fromisoformat(str(exam_date))
    except (ValueError, TypeError): exam = None
    days = max(0, (exam-today).days) if exam else 0
    week = max(1, min(7, int(days_per_week)))
    rounds = max(1, min(5, int(target_rounds)))
    # Without selected weekdays, evenly distribute capacity; never imply a real calendar.
    study_days = math.floor(days*week/7)
    settings = progress.get("settings", {})
    daily = max(1, int(settings.get("minutes_default", 180)))
    target = settings.get("target_score", 80)
    personal = pace(progress)
    ws = weights(opposition)
    buffer_days = min(7, math.floor(study_days*CONFIG["buffer_fraction"]))
    buffer = buffer_days*daily
    capacity = max(0, study_days*daily-buffer)
    requirements, details, cores, extras = {}, [], {}, {}
    complete = []
    for w in ws:
        st = progress.get("topics", {}).get(str(w["topic_index"]), {})
        b = w["block_index"]
        done = coverage(st, b)
        complete.append(min(done,test_coverage(st,b)))
        rev = st.get("reviews", {}).get(str(b), {})
        score = rev.get("last_score")
        tests = test_coverage(st,b)
        future_reviews = 0
        if rev.get("next_review") and days:
            try: offset = max(0, (date.fromisoformat(rev["next_review"])-today).days)
            except ValueError: offset = days
            interval = max(1, int(rev.get("interval_days") or review_interval(score or 0, target)))
            future_reviews = max(0, math.ceil((days-offset)/interval))
        review_budget = future_reviews * unit(w["weight"], 3, score=score, target=target) * personal[w["pace_category"] or "review"]["factor"]
        per_round = {}
        for goal in range(1, 6):
            new, revisits, testing = 0, 0, 0
            for r in range(goal):
                fraction = 1-min(1, max(0, done-r))
                cost = fraction*unit(w["weight"], r, score=score, target=target)*personal[w["pace_category"] or ("study" if r == 0 else "review")]["factor"]
                if r == 0: new += cost
                else: revisits += cost
                testing += (1-min(1, max(0, tests-r)))*unit(w["weight"], r, "test")*personal["test"]["factor"]
            # Round revisits fulfil scheduled recalls; reserve only the uncovered remainder.
            per_round[goal] = new + max(revisits, review_budget) + testing
            requirements[goal] = requirements.get(goal, 0) + per_round[goal]
            cores[goal] = cores.get(goal,0)+new+revisits+testing
            extras[goal] = extras.get(goal,0)+max(0,review_budget-revisits)
        details.append({**w, "completed_rounds": round(done, 3), "remaining_minutes": round(per_round[rounds]),
            "future_review_count": future_reviews, "review_reserve_minutes": round(review_budget), "last_score": score})
    practice = {}
    if practice_kinds(opposition):
        for goal in range(1, 6):
            cost = 0
            for kind in practice_kinds(opposition):
                planned = len(ws)*goal*CONFIG["practice_minutes_per_block"]
                credit = progress.get("practice_credit", {}).get(kind, 0)
                cost += max(0, planned-credit)*personal[kind]["factor"]
            requirements[goal] = requirements.get(goal, 0)+cost
            practice[goal] = cost
            cores[goal] = cores.get(goal,0)+cost
    required = requirements.get(rounds, 0)
    def need(minutes, available=study_days):
        usable=available-min(7,math.floor(available*CONFIG["buffer_fraction"]))
        return math.ceil(minutes/usable) if usable else (0 if minutes == 0 else None)
    def finish(minutes, reserve):
        if minutes <= 0: return today.isoformat()
        effective_daily=daily*week/7-reserve/max(1,days)
        if effective_daily <= 0: return None
        elapsed = math.ceil(minutes/effective_daily)
        return (today+timedelta(days=min(elapsed, 365000))).isoformat()
    milestones = {str(r): finish(cores.get(r,0),extras.get(r,0)) for r in (1,2,3,4)}
    possible = max((r for r in range(1,6) if requirements.get(r, 0) <= capacity), default=0)
    two, three = requirements.get(2, 0), requirements.get(3, 0)
    selective = max(0, min(1, (capacity-two)/max(1, three-two))) if capacity >= two else 0
    more_days = math.floor(days*min(7,week+1)/7)
    measured = sum(p["sessions"] for p in personal.values())
    scores = [t["score"] for st in progress.get("topics", {}).values() for t in st.get("tests", []) if t.get("score") is not None]
    first = sum(min(1, n) for n in complete)
    # Compare actual coverage with the saved baseline, independently of changing availability.
    anchor = progress.get("workload_anchor")
    drift = None
    if anchor:
        elapsed = max(0, (today-date.fromisoformat(anchor["date"])).days)
        expected = min(anchor["required_minutes"],elapsed*anchor["daily_minutes"]*anchor["days_per_week"]/7)
        drift = round(earned_minutes(opposition,progress,anchor.get("target_rounds",rounds))-anchor.get("earned_minutes",0)-expected)
    return {"schema": SCHEMA, "days_left": days if exam else None, "study_days_left": study_days,
        "total_blocks": len(ws), "completed_first_blocks": round(first, 2),
        "first_round_pct": round(first/max(1,len(ws))*100), "completed_rounds": math.floor(min(complete, default=0)),
        "target_rounds": rounds, "initial_minutes": round(sum(unit(w["weight"],r)+unit(w["weight"],r,"test") for w in ws for r in range(rounds)) + (len(ws)*rounds*CONFIG["practice_minutes_per_block"]*len(practice_kinds(opposition)))), "estimated_minutes_required": math.ceil(required),
        "required_minutes_per_study_day": need(required),
        "round_options": {str(r): need(requirements.get(r,0)) for r in (2,3,4)},
        "pace_sufficient": bool(exam and required <= capacity), "possible_rounds": possible,
        "margin_minutes": round(capacity-required), "milestones": milestones,
        "simulation_buffer_days": buffer_days, "simulation_buffer_minutes": buffer,
        "study_capacity_minutes": round(capacity), "practice_minutes": round(practice.get(rounds,0)),
        "alternatives": {"extra_minutes_daily": max(0,need(required)-daily) if study_days else None,
            "with_extra_day_minutes_daily": need(required,more_days) if week < 7 else None,
            "with_extra_day_sufficient": week < 7 and required <= (more_days-min(7,math.floor(more_days*CONFIG["buffer_fraction"])))*daily,
            "third_selective_pct": round(selective*100)},
        "pace": personal, "measured_sessions": measured,
        "estimation_status": "personalized" if any(v["personalized"] for v in personal.values()) else "initial",
        "blocks": details, "schedule_margin_minutes": drift,
        "academy": {"active": progress.get("mode") == "academy", "selected_topics": progress.get("academy_selected", [])},
        "target_score": target, "average_test_score": round(sum(scores)/len(scores),1) if scores else None,
        "mastery_index": round(sum(mastery_from_score(progress.get("topics",{}).get(str(i),{}).get("score"),target) for i in range(len(opposition.get("topics",[]))))/max(1,len(opposition.get("topics",[]))),1),
        "tests_recorded": len(scores), "as_of": today.isoformat(),
        "uncertainty": "Orientativa; volumen y dominio pueden cambiar. Las fechas suponen disponibilidad uniforme. Los repasos proyectan tus notas actuales; no predicen una mejora ni un aprobado."}
