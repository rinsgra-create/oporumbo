"""Persistent companion care, independent from graphics and study planning."""
from fastapi import HTTPException


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
    return pet


def care(p, action, kind=None):
    pet = companion(p)
    if action == 'adopt':
        if pet['egg_started']:
            raise HTTPException(409, 'Ya tienes un compañero; su progreso se conserva.')
        pet.update(type=kind or 'auri', adopted=True, hatched=False, egg_started=True, egg_tasks=0)
    elif action == 'hatch':
        if not pet['egg_started'] or pet['egg_tasks'] < 3:
            raise HTTPException(422, 'Completa tres tareas para abrir el huevo.')
        pet['hatched'] = True
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
