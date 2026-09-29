"""Persistent companion care, independent from graphics and study planning."""
from fastapi import HTTPException
from datetime import datetime, timezone

STUDY_KINDS = {'study', 'academy', 'test', 'maintenance', 'urgent_review', 'english', 'psy'}


def update_rhythm(p, opposition, today):
    """Compare earned study work, not XP or speed of clicking, with availability.

    No specific weekdays are stored: allow all configured weekly rest days first.
    Start a fresh comparison after availability/opposition changes, without
    changing any earned care rewards. The derived result is recomputed server-side.
    """
    from .workload import earned_minutes
    settings=p.get('settings',{})
    daily=max(1,int(settings.get('minutes_default',180)))
    week=max(1,min(7,int(settings.get('days_per_week',6))))
    rounds=settings.get('target_rounds',3)
    signature=[opposition.get('id'),daily,week,rounds,settings.get('exam_date')]
    earned=earned_minutes(opposition,p,rounds)
    anchor=p.get('rhythm_anchor')
    if not anchor or anchor.get('signature')!=signature:
        anchor={'signature':signature,'date':today.isoformat(),'earned_minutes':earned}
        p['rhythm_anchor']=anchor
    from datetime import date
    elapsed=max(0,(today-date.fromisoformat(anchor['date'])).days)
    weeks,remainder=divmod(elapsed,7)
    expected_days=weeks*week+max(0,remainder-(7-week))
    expected=expected_days*daily
    gained=max(0,earned-anchor['earned_minutes'])
    delta=gained-expected
    if not companion(p)['hatched']:
        mood='neutral';message='Tu compañero te espera dentro del huevo.'
    elif p.get('roadmap',{}).get('completed_rounds',0)>=rounds:
        mood='happy';message='¡Objetivo de vueltas completado! Mantén los repasos que correspondan.'
    elif delta>=daily*.5:
        mood='happy';message='¡Va contento! Llevas avance por delante de tu ritmo previsto.'
    elif elapsed>=7 and delta<=-daily:
        mood='sad';message='Está algo decaído: queda avance pendiente respecto al plan. Retoma una tarea o ajusta tu disponibilidad.'
    else:
        mood='neutral';message='Te acompaña con calma. Los descansos previstos también forman parte del plan.'
    p['companion_rhythm']={'mood':mood,'message':message,'as_of':today.isoformat(),
        'earned_minutes':round(gained),'expected_minutes':expected,'difference_minutes':round(delta),
        'weekly_rest_days':7-week,'initial_week':elapsed<7}


def companion(p):
    pet = p.setdefault('pet', {})
    pet.setdefault('type', 'auri')
    pet.setdefault('energy', 100)
    # Existing companions keep their identity and earned development.
    pet.setdefault('adopted', bool(p.get('xp', 0) or pet.get('totalCompleted', 0)))
    pet.setdefault('hatched', bool(p.get('xp', 0) or pet.get('totalCompleted', 0)))
    pet.setdefault('growth', int(pet.get('totalCompleted', 0)))
    pet.setdefault('egg_started', False)
    pet.setdefault('egg_tasks', 0)
    pet.setdefault('food', 0)
    pet.setdefault('food_earned', 0)
    pet.setdefault('food_spent', 0)
    pet.setdefault('happiness', 50)
    pet.setdefault('play_tokens', 0)
    pet.setdefault('play_earned', 0)
    pet.setdefault('play_spent', 0)
    pet.setdefault('care_completed', 0)
    pet.setdefault('egg_stage', 2 if pet['hatched'] else min(2, int(pet['egg_tasks'])))
    pet.setdefault('first_study_date', None)
    pet.setdefault('hatched_at', None)
    pet.setdefault('first_day_goal', None)
    pet.setdefault('birth_completed', [])
    return pet


def study_birth(p, task):
    """Called only after a validated, persisted-in-the-same-transaction completion.

    Extras crack the shell but never increase or replace the base objective.
    An unfinished first objective can be completed on later study days.
    """
    pet = companion(p)
    from .collection import activity
    if task.get('kind') in STUDY_KINDS: activity(p)
    if pet['hatched'] or task.get('kind') not in STUDY_KINDS:
        return
    day = task['completed_on']
    pet['egg_started'] = pet['adopted'] = True
    if not pet['first_study_date']:
        pet['first_study_date'] = day
    c=p.get('companion_collection')
    prior=c['pets'][c['active_round']-1].get('prior_task_ids',[]) if c else []
    base = [t for t in p.get('tasks', []) if t.get('id') not in prior and not t.get('extra') and t.get('kind') in STUDY_KINDS]
    if pet['first_day_goal'] is None or day == pet['first_study_date']:
        pet['first_day_goal'] = max(1, len(base))
    if day == pet['first_study_date']:
        pet['birth_completed'] = list(dict.fromkeys(t['id'] for t in base if t.get('done')))
    elif not task.get('extra') and task['id'] not in pet['birth_completed']:
        pet['birth_completed'].append(task['id'])
    pet['egg_stage'] = max(pet['egg_stage'], 1 if pet['egg_tasks'] <= 1 else 2)
    if len(pet['birth_completed']) >= pet['first_day_goal']:
        pet.update(hatched=True, egg_stage=2, hatched_at=datetime.now(timezone.utc).isoformat())


def care(p, action, kind=None):
    pet = companion(p)
    if action == 'adopt':
        if pet['egg_started'] or pet['hatched']:
            raise HTTPException(409, 'Ya tienes un compañero; su progreso se conserva.')
        pet.update(type=kind or 'auri', adopted=True, egg_started=True)
    elif action == 'hatch':
        if not pet['hatched']:
            raise HTTPException(422, 'El compañero nace al completar el objetivo de tu primer día de estudio.')
    elif action == 'feed':
        if not pet['hatched'] or pet['food'] < 1:
            raise HTTPException(422, 'Necesitas un compañero nacido y una ración de comida.')
        pet['food'] -= 1
        pet['food_spent'] += 1
        pet['growth'] += 2
        pet['happiness'] = min(100, pet['happiness'] + 10)
        pet['energy'] = min(100, pet['energy'] + 10)
    elif action == 'stroke':
        pet['happiness'] = min(100, pet['happiness'] + 1)
    elif action in ('play_ball','play_bubbles'):
        if not pet['hatched'] or pet['play_tokens'] < 1:
            raise HTTPException(422,'Completa tres tareas para ganar una sesión de juego y espera a que nazca tu compañero.')
        pet['play_tokens'] -= 1
        pet['play_spent'] += 1
        pet['happiness'] = min(100,pet['happiness']+8)


def upgrade_birth(p):
    """Add birth metadata once; retain every existing task and care reward."""
    pet = companion(p)
    if pet.get('birth_schema') == 201:
        return
    completed = [t for t in p.get('tasks', []) if t.get('done')
                 and t.get('completed_on') and t.get('kind') in STUDY_KINDS]
    if not pet['hatched'] and not pet['first_study_date'] and completed:
        first = min(t['completed_on'] for t in completed)
        pet['first_study_date'] = first
        # Current V20 plan includes its completed rows; use them once to
        # reconcile an egg whose first day was already finished before update.
        study_birth(p, next(t for t in completed if t['completed_on'] == first))
    pet['birth_schema'] = 201
