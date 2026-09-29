"""Study mutations, independent of rendering and pet animation."""
from datetime import date, timedelta
from hashlib import sha256
from copy import deepcopy
from fastapi import HTTPException
from .planner import record_test, roadmap, _due_reviews, _today


def identify_tasks(progress):
    day = progress.get("plan_date", "legacy")
    for i, task in enumerate(progress.get("tasks", [])):
        task.setdefault("id", sha256(f"{day}:{i}:{task.get('kind')}:{task.get('topic_index')}:{task.get('block_index')}".encode()).hexdigest()[:24])


def complete_task(progress, opposition, task_id, score=None):
    identify_tasks(progress)
    task = next((t for t in progress.get("tasks", []) if t["id"] == task_id), None)
    if task is None:
        raise HTTPException(409, "El plan ha cambiado. Actualiza y selecciona la tarea de nuevo.")
    if task.get("done"):
        return  # Retrying after a lost response cannot double XP or test results.
    topic_key=str(task.get("topic_index"))
    undo={"id":task_id,"topic_key":topic_key,"topic_before":deepcopy(progress.get("topics",{}).get(topic_key)),
          "task_before":deepcopy(task),"energy_before":progress.get("pet",{}).get("energy",100)}
    kind = task.get("kind")
    target = int(progress.get("settings", {}).get("target_score", 80))
    if kind == "test":
        if score is None or not 0 <= score <= 100:
            raise HTTPException(422, "Introduce una nota entre 0 y 100")
        rec = record_test(progress, task["topic_index"], task.get("block_index", 0), score, target)
        task.update(score=score, last_score=score, next_review=rec["next_review"])
    elif kind in ("study", "academy"):
        topic = progress.setdefault("topics", {}).setdefault(str(task["topic_index"]), {})
        block = task.get("block_index", 0)
        counts = topic.setdefault("block_passes", {})
        # Migrate the already studied portion without resetting historical progress.
        for b in range(int(topic.get("block", 0))):
            counts.setdefault(str(b), 1)
        counts[str(block)] = int(counts.get(str(block), 0)) + 1
        topic["block"] = max(topic.get("block", 0), block + 1)
    elif kind in ("maintenance", "urgent_review"):
        topic = progress.setdefault("topics", {}).setdefault(str(task["topic_index"]), {})
        review = topic.setdefault("reviews", {}).get(str(task.get("block_index", 0)))
        if review:
            # Reading a review is not a successful recall test. Recheck soon.
            review["last_reviewed"] = _today().isoformat()
            review["next_review"] = (_today() + timedelta(days=1)).isoformat()
    task["done"] = True
    task["completed_on"] = _today().isoformat()
    progress["xp"] = int(progress.get("xp", 0)) + int(task.get("xp", 0))
    pet = progress.setdefault("pet", {"type": "auri", "name": "Auri"})
    pet["energy"] = min(100, int(pet.get("energy", 100)) + 6)
    pet["totalCompleted"] = int(pet.get("totalCompleted", 0)) + 1
    settings = progress.get("settings", {})
    progress["roadmap"] = roadmap(opposition, progress, settings.get("exam_date"), settings.get("days_per_week", 6), settings.get("target_rounds", 3))
    progress["due_reviews"] = len(_due_reviews(opposition, progress))
    undo["topic_after"]=deepcopy(progress.get("topics",{}).get(topic_key))
    undo["energy_gain"]=pet["energy"]-undo["energy_before"]
    progress["last_completion"]=undo


def undo_last_task(progress, opposition, task_id):
    """Undo only the most recent completion, without erasing subsequent study."""
    undo=progress.get("last_completion")
    if not undo or undo["id"]!=task_id:
        raise HTTPException(409,"Solo puedes deshacer la última tarea completada")
    task=next((t for t in progress.get("tasks",[]) if t.get("id")==task_id),None)
    key=undo["topic_key"]
    if not task or progress.get("topics",{}).get(key)!=undo["topic_after"]:
        raise HTTPException(409,"El progreso de este tema ha cambiado. No se puede deshacer automáticamente.")
    progress["xp"]=max(0,progress.get("xp",0)-task.get("xp",0))
    if undo["topic_before"] is None:progress.get("topics",{}).pop(key,None)
    else:progress.setdefault("topics",{})[key]=undo["topic_before"]
    task.clear();task.update(undo["task_before"])
    pet=progress.setdefault("pet",{})
    pet["energy"]=max(0,pet.get("energy",100)-undo["energy_gain"])
    pet["totalCompleted"]=max(0,pet.get("totalCompleted",0)-1)
    progress.pop("last_completion",None)
    s=progress.get("settings",{})
    progress["roadmap"]=roadmap(opposition,progress,s.get("exam_date"),s.get("days_per_week",6),s.get("target_rounds",3))
    progress["due_reviews"]=len(_due_reviews(opposition,progress))
