"""Server-owned cosmetic rewards. Prices and rewards never come from the client."""
from fastapi import HTTPException

CATALOG = [
    dict(id='scarf_sun', name='Pañuelo de sol', slot='neck', price=12, icon='🧣'),
    dict(id='cap_leaf', name='Gorra bosque', slot='head', price=18, icon='🧢'),
    dict(id='beanie_sky', name='Gorro de lana', slot='head', price=24, icon='❄️'),
    dict(id='cap_coral', name='Gorra coral', slot='head', price=30, icon='🧢'),
    dict(id='bow_violet', name='Pajarita violeta', slot='neck', price=36, icon='🎀'),
]


def wallet(p):
    return p.setdefault('wardrobe', dict(schema=1, coins=0, earned=0, spent=0,
        owned=[], equipped={}, days={}, awards={}))


def reward(p, task):
    w=wallet(p)
    if task['id'] in w['awards']:
        return
    day=task['completed_on']
    prior=w['days'].get(day,0)
    minutes=max(0,min(120,float(task.get('baseline_minutes') or task.get('minutes',0))))
    credited=min(minutes,max(0,300-prior))
    coins=int((prior+credited)//10)-int(prior//10)
    w['days'][day]=prior+credited
    w['coins']+=coins;w['earned']+=coins
    w['awards'][task['id']]=dict(day=day,minutes=credited,coins=coins)


def check_undo(p, task_id):
    w=wallet(p);a=w['awards'].get(task_id)
    if a and w['coins']<a['coins']:
        raise HTTPException(409,'Has utilizado las monedas de esta tarea en ropa. No se puede deshacer.')


def undo_reward(p, task_id):
    w=wallet(p);a=w['awards'].pop(task_id,None)
    if a:
        w['coins']-=a['coins'];w['earned']-=a['coins']
        w['days'][a['day']]=max(0,w['days'][a['day']]-a['minutes'])


def project(p):
    w=wallet(p)
    p['wardrobe_catalog']=CATALOG
    for pet in p.get('companion_collection',{}).get('pets',[]):
        pet['outfit']=dict(w['equipped'].get(str(pet['round']),{}))


def change(p, action, item_id=None, round_number=None, slot=None):
    w=wallet(p)
    item=next((x for x in CATALOG if x['id']==item_id),None)
    if action=='buy':
        if item is None:raise HTTPException(422,'Esa prenda no está en la tienda.')
        if item_id in w['owned']:return
        if w['coins']<item['price']:raise HTTPException(422,'Necesitas más monedas de estudio.')
        w['coins']-=item['price'];w['spent']+=item['price'];w['owned'].append(item_id)
    else:
        if round_number not in (1,2,3):raise HTTPException(422,'Elige un compañero.')
        pet=p['companion_collection']['pets'][round_number-1]
        if not pet['unlocked'] or not pet['hatched']:
            raise HTTPException(422,'Podrás vestir a este compañero cuando nazca.')
        outfit=w['equipped'].setdefault(str(round_number),{})
        if action=='equip':
            if item is None or item_id not in w['owned']:raise HTTPException(422,'Primero consigue esta prenda.')
            outfit[item['slot']]=item_id
        elif action=='unequip':
            if slot not in ('head','neck'):raise HTTPException(422,'Elige la prenda que quieres quitar.')
            outfit.pop(slot,None)
    project(p)
