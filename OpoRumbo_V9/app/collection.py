"""Three permanent companions, derived from academic coverage, never care XP."""
from datetime import date
from .workload import weights, coverage, test_coverage

PHASES = ['Huevo intacto', 'Huevo con grietas', 'Recién nacido', 'Bebé',
          'Infantil', 'Infantil avanzado', 'Juvenil', 'Juvenil avanzado',
          'Adulto joven', 'Forma final']
MIN_STUDY_DAYS = {3:1,4:3,5:6,6:10,7:15,8:22,9:30}

BIRTH = ('hatched', 'egg_started', 'egg_tasks', 'egg_stage', 'first_study_date',
         'hatched_at', 'first_day_goal', 'birth_completed')


def activity(p, today=None):
    c = p.get('companion_collection')
    if not c:
        return
    day = (today or date.today()).isoformat()
    active = c['pets'][c['active_round']-1]
    active['study_days']=sorted(set(active.get('study_days',[]))|{day})
    active['last_activity'] = day
    active['joy'] = max(75, p['pet'].get('happiness', 50))


def sync(p, opposition, today=None):
    from .pet import companion
    today = today or date.today()
    day = today.isoformat()
    pet = companion(p)
    ws = weights(opposition) if opposition else []
    values = []
    for w in ws:
        st = p.get('topics', {}).get(str(w['topic_index']), {})
        values.append((w['weight'], min(coverage(st,w['block_index']), test_coverage(st,w['block_index']))))
    completed = min(3, int(min((v for _,v in values), default=0)))
    target = min(3, completed+1)
    c = p.get('companion_collection')
    if not c:
        species = [s for s in ('auri','bruma','nexo') if s != pet['type']]
        species.insert(target-1,pet['type'])
        c = {'schema':1, 'active_round':target, 'pets':[], 'final_celebration_seen':False}
        for r in range(1,4):
            entry = dict(round=r, species=species[r-1], unlocked=r<=target, hatched=False,
                         phase=1, joy=pet['happiness'], last_activity=day, food_bonus=0,
                         born_at=None, completed_at=None)
            if r == target:
                entry.update({k:pet[k] for k in BIRTH})
                if pet['hatched']:
                    entry['phase']=3
                    entry['born_at']=pet['hatched_at'] or day
            c['pets'].append(entry)
        p['companion_collection']=c
    recalibrate=c.get('growth_schema') != 2
    current=c['pets'][c['active_round']-1]
    current.update({k:pet[k] for k in BIRTH})
    current['species']=pet['type']
    if c['active_round']==1 and not current['hatched']:
        available=[s for s in ('auri','bruma','nexo') if s!=current['species']]
        for e,s in zip(c['pets'][1:],available):
            if not e['unlocked']:e['species']=s
    for entry in c['pets']:
        r=entry['round']
        if recalibrate:
            entry['phase_before_recalibration']=entry['phase']
            dates=set(entry.get('study_days',[]))
            # Only actual dated study evidence; never XP, feeding or elapsed idle days.
            if r==c['active_round']:
                dates.update(t['completed_on'] for t in p.get('tasks',[]) if t.get('done') and t.get('completed_on') and t.get('companion_round',r)==r)
                dates.update(x['date'] for x in p.get('pacing',{}).get('sessions',[]) if x.get('date') and x.get('companion_round',r)==r)
                if entry.get('first_study_date'):dates.add(entry['first_study_date'])
            entry['study_days']=sorted(dates)
        entry.setdefault('study_days',[])

        if r<=completed:
            entry.update(unlocked=True, hatched=True, phase=10)
            entry['completed_at']=entry['completed_at'] or day
            entry['born_at']=entry['born_at'] or day
        fraction=sum(w*min(1,max(0,v-(r-1))) for w,v in values)/max(.001,sum(w for w,_ in values))
        entry['progress']=round(fraction,6)
        if entry['unlocked'] and fraction>=.03:
            entry['hatched']=True
        if entry['hatched']:
            entry['born_at']=entry['born_at'] or day
            # Food advances at most three percentage points, at most 10% of earned work.
            effective=min(.999,fraction+min(.03,fraction*.1,entry.get('food_bonus',0)))
            phase=3+sum(effective>=n for n in (.12,.25,.38,.52,.67,.82))
            day_phase=max((ph for ph,minimum in MIN_STUDY_DAYS.items() if len(entry['study_days'])>=minimum),default=3)
            phase=min(phase,day_phase)
            if recalibrate and not entry['completed_at']:
                entry['phase']=phase
            else:
                entry['phase']=max(entry['phase'],phase)
            entry['next_phase_days']=MIN_STUDY_DAYS.get(min(9,entry['phase']+1),30)

        elif entry.get('egg_tasks',0) or fraction>0:
            entry['phase']=2
        else:
            entry['phase']=1
        elapsed=max(0,(today-date.fromisoformat(entry['last_activity'])).days)
        entry['happiness']=max(10,entry['joy']-max(0,elapsed-1)*12)
        entry['mood']='very_happy' if entry['happiness']>=85 else 'happy' if entry['happiness']>=65 else 'neutral' if entry['happiness']>=35 else 'sad'
        entry['phase_name']=PHASES[entry['phase']-1]
    # Earned companions never disappear if study is undone or a plan is changed.
    if target>c['active_round']:
        c['active_round']=target
        current=c['pets'][target-1]
        current['unlocked']=True
        current['prior_task_ids']=[t['id'] for t in p.get('tasks',[]) if t.get('done')]
        for k in BIRTH:
            current.setdefault(k, [] if k=='birth_completed' else None if k in ('first_study_date','hatched_at','first_day_goal') else False if k in ('hatched','egg_started') else 0)
    current=c['pets'][c['active_round']-1]
    pet.update({k:current[k] for k in BIRTH if k in current})
    pet.update(type=current['species'],hatched=current['hatched'],phase=current['phase'])
    pet['egg_stage']=max(1,min(2,current.get('egg_tasks',0))) if current['phase']==2 else 0 if current['phase']==1 else 2
    c['growth_schema']=2
    c['as_of']=day
    c['complete']=all(x['phase']==10 for x in c['pets'])
    messages={'sad':'Hoy te he echado de menos. ¿Compartimos un ratito?', 'neutral':'Te acompaño a tu ritmo.', 'happy':'¡Qué alegría compartir este camino!', 'very_happy':'¡Me encanta avanzar contigo!'}
    p['companion_rhythm']={'mood':current['mood'],'message':messages[current['mood']]}


def care_bonus(p, action, round_number=None):
    c=p['companion_collection']
    entry=c['pets'][(round_number or c['active_round'])-1]
    entry['last_activity']=date.today().isoformat()
    entry['joy']=min(100,max(65,entry['happiness'])+({'feed':10,'stroke':5}.get(action,8)))
    if action=='feed':entry['food_bonus']=min(.03,entry.get('food_bonus',0)+.005)
