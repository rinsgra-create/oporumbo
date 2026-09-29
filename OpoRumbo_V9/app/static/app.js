/* Study UI. The companion communicates only through a small, origin-checked bridge. */
'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=['or18','or15','or14','or13','or12','or11','or9'].map(k=>localStorage.getItem(k)).find(Boolean);
let state={},opposition=null,user=null,screen='Today',selectedOpp=null,pendingTest=null,pendingTime=null,configuringOpp=false;
let pending=new Map(),queue=Promise.resolve(),writing=0,petReady=false,audioContext;
let academyDraft=null;
let selectionRequest=0;
let academyEdit=0;
const names={auri:'Auri',nexo:'Nexo',bruma:'Bruma'};
const today=()=>new Date().toLocaleDateString('en-CA');
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);$('notice').hidden=!message;}
async function api(path,{method='GET',body}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const error=new Error(typeof data.detail==='string'?data.detail:response.status===422?'Revisa los datos introducidos.':'No se ha podido completar la petición.');error.status=response.status;
   if(response.status===401){$('authCard').hidden=false;$('app').hidden=true;$('nav').hidden=true;}
   throw error;
  }
  return data;
 }catch(error){if(!error.status)error.message='No se ha podido confirmar el guardado. Comprueba la conexión y pulsa Reintentar.';throw error;}
 finally{clearTimeout(timer);}
}
function normalize(){
 state.pet={type:'auri',energy:100,...state.pet};if(!names[state.pet.type])state.pet.type='auri';
 state.prefs={sound:true,animations:true,...state.prefs};state.settings=state.settings||{};state.tasks=state.tasks||[];
}
async function refreshProgress(){
 state=await api('/api/progress');normalize();
 if(state.selected&&(opposition?.id!==state.selected||(state.selected==='custom_researched'&&opposition?.boe_id!==state.custom_opposition?.boe_id)))opposition=await api('/api/oppositions/'+encodeURIComponent(state.selected));
 render();
}
function enqueue(job){
 writing++;updateBusy();
 const run=queue.then(job);queue=run.catch(()=>{});
 return run.catch(async error=>{
  if(error.status===409){try{await refreshProgress();}catch{}}
  notice(error.message,true);
 }).finally(()=>{writing--;updateBusy();});
}
function updateBusy(){document.querySelectorAll('[data-write]').forEach(b=>b.disabled=writing>0);}
function rememberPending(){if(user)localStorage.setItem('or-pending-'+user.id,JSON.stringify([...pending.values()].map(({id,score,actual_minutes})=>({id,score,actual_minutes}))));}
function stage(){if(!state.pet?.hatched)return 0;const r=state.roadmap||{},g=state.pet.growth||0;return Math.max(g>=100?5:g>=50?4:g>=20?3:g>=8?2:1,r.completed_rounds>=2?5:r.first_round_pct>=100?4:(r.first_round_pct>=50?3:state.xp>=300?2:1));}
function sendPet(type,extra={}){try{const f=$('pet3dFrame');if(f?.contentWindow)f.contentWindow.postMessage({type,...extra},location.origin);}catch(error){console.warn('Vista del compañero no disponible',error.name);}}
function syncPet(){if(typeof state.pet?.hatched!=='boolean')return;if(petReady)$('pet3dFrame').style.visibility='visible';sendPet('setPet',{pet:state.pet.type,stage:stage(),eggStage:state.pet.egg_stage||0,mood:state.companion_rhythm?.mood||'neutral',animations:state.prefs.animations!==false&&!matchMedia('(prefers-reduced-motion: reduce)').matches});}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==$('pet3dFrame').contentWindow)return;
 if(event.data?.type==='pet3dReady'){petReady=true;$('petHero').hidden=true;$('eggFallback').hidden=true;$('threeStatus').textContent='3D activo';normalize();syncPet();sendPet('visibility',{visible:screen==='Today'&&!document.hidden});}
 if(event.data?.type==='pet3dFailed'){petReady=false;renderCare();$('pet3dFrame').style.visibility='hidden';$('threeStatus').textContent='Vista sencilla';console.warn('Compañero 3D:',event.data.reason);}
});
let lastSoundAt=-Infinity;
const soundNotes={reward:[523.25,659.25,783.99],feed:[220,277.18,329.63],play:[392,493.88,587.33],pet:[240,310,260],birth:[392,523.25,659.25,783.99],milestone:[523.25,783.99,1046.5]};
function sound(kind='reward'){
 if(state.prefs?.sound===false||document.hidden||performance.now()-lastSoundAt<160)return;
 try{
  audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
  lastSoundAt=performance.now();
  // Short synthesis only: no downloads, continuous loops or awaited audio on saves.
  const play=()=>{
   if(state.prefs?.sound===false||document.hidden||audioContext.state!=='running')return;
   const now=audioContext.currentTime,voice={auri:1,nexo:.78,bruma:1.18}[state.pet?.type]||1,notes=(soundNotes[kind]||soundNotes.reward).map(f=>f*(kind==='pet'?voice:1));
   notes.forEach((f,i)=>{
    const o=audioContext.createOscillator(),g=audioContext.createGain(),start=now+i*(kind==='pet'?.14:.075);
    o.type='sine';o.frequency.setValueAtTime(f,start);
    if(kind==='pet'){o.frequency.exponentialRampToValueAtTime(f*1.38,start+.075);o.frequency.exponentialRampToValueAtTime(f*.86,start+.22);}
    o.connect(g);g.connect(audioContext.destination);
    g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(kind==='pet'?.018:.028,start+.025);
    g.gain.exponentialRampToValueAtTime(.0001,start+.3);
    o.onended=()=>{o.disconnect();g.disconnect();};o.start(start);o.stop(start+.32);
   });
  };
  if(audioContext.state==='suspended')audioContext.resume().then(play).catch(()=>{});else play();
 }catch(error){console.warn('Audio no disponible',error.name);}
}

function celebrate(rect){
 if(state.prefs?.animations===false||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const target=$('petStage').getBoundingClientRect(),orb=document.createElement('i');orb.className='energyOrb';document.body.append(orb);
 const sx=rect.left+rect.width/2,sy=rect.top+rect.height/2,dx=target.left+target.width/2-sx,dy=target.top+target.height*.6-sy;
 orb.style.left=sx+'px';orb.style.top=sy+'px';
 const animation=orb.animate([{transform:'translate(-50%,-50%) scale(.7)',opacity:1},{transform:`translate(${dx*.55}px,${dy*.55-65}px) scale(1.15)`,opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.2)`,opacity:0}],{duration:650,easing:'ease-in-out'});
 animation.onfinish=()=>{orb.remove();if(petReady)sendPet('react',{reaction:'happy'});};
}
let lastVisualStage=null;
function render(){
 normalize();const xp=state.xp||0;
 $('petName').textContent=names[state.pet.type];$('petHero').src='/static/'+state.pet.type+'.png';$('level').textContent='Nivel '+(Math.floor(xp/300)+1);$('energy').textContent=(state.pet.energy??100)+'%';$('xpFill').style.width=(xp%300)/3+'%';syncPet();
 renderCare();
 const visualStage=stage();
 if(lastVisualStage!==null&&visualStage>lastVisualStage&&!petReady){
  $('careStatus').textContent=lastVisualStage===0?'¡Tu compañero ha nacido!':'¡Tu compañero ha evolucionado!';
  if(state.prefs.animations!==false&&!matchMedia('(prefers-reduced-motion: reduce)').matches){try{$('petHero').animate([{transform:'scale(.75)',opacity:.3},{transform:'scale(1.08)',opacity:1},{transform:'scale(1)',opacity:1}],{duration:2600,easing:'ease-in-out'});}catch{}}
 }
 lastVisualStage=visualStage;
 document.documentElement.classList.toggle('reduce-motion',!state.prefs.animations);
 $('date').textContent=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'short'});
 const tasks=state.tasks,done=tasks.filter(t=>t.done||pending.has(t.id)).length,total=tasks.length;
 const totalMinutes=tasks.reduce((n,t)=>n+(t.done?(t.actual_minutes??t.minutes):t.minutes),0);
 $('dayMeta').textContent=`${done} de ${total} completadas · ${Math.round(totalMinutes)} min en total`;
 $('dayFill').style.width=(total?done/total*100:0)+'%';
 $('todayAcademy').hidden=state.mode!=='academy';
 $('todayAcademy').textContent=state.plan_extra_minutes>0?`Las sesiones de hoy superan en unos ${state.plan_extra_minutes} min tu tiempo diario previsto. Puedes repartirlas o ajustar tu disponibilidad en Perfil.`:state.academy_selected?.length?'Los temas de academia elegidos están incluidos en Hoy.':'Elige los temas que estudiarás hoy con la academia.';
 $('tasks').innerHTML=tasks.map(t=>{
  const intent=pending.get(t.id),complete=t.done||!!intent;
  let tag=t.kind==='urgent_review'?'<span class="tag red">Repaso prioritario</span>':t.kind==='maintenance'?'<span class="tag green">Mantenimiento</span>':t.kind==='test'?`<span class="tag blue">Objetivo ${state.settings.target_score||80}%${t.score!=null?' · Nota '+t.score+'%':''}</span>`:'';
  let status=intent?(intent.failed?'Pendiente de confirmar':'Guardando…'):t.done?'Hecho hoy':'';
  if(t.extra)tag+='<span class="tag green">Extra · '+(t.done?'Comida ganada':' +1 comida al completar')+'</span>';
  const duration=t.done&&t.actual_minutes!=null?`${t.actual_minutes} min reales`:`${t.minutes} min previstos`;
  return `<article class="task ${complete?'completed':''}"><div class="taskCopy"><b>${esc(t.title)}</b><small>${esc(t.detail)}</small><div class="taskMeta"><span>${duration}</span>${tag}</div>${status?`<small class="saved ${intent?.failed?'pending':''}">${status}</small>`:''}${t.next_review?`<small>Próximo repaso: ${esc(t.next_review)}</small>`:''}</div><button class="check ${complete?'done':''}" data-task="${esc(t.id)}" aria-label="${complete?'Completada: ':'Completar: '}${esc(t.title)}" ${complete?'disabled':''}>${complete?'✓':'<span></span>'}</button></article>`;
 }).join('')||'<div class="empty"><b>Tu siguiente paso empieza aquí</b><p>Configura tu oposición y organiza una sesión a tu medida.</p></div>';
 document.querySelectorAll('[data-task]').forEach(button=>button.onclick=()=>clickTask(button.dataset.task,button));
 $('undoTask').hidden=!state.last_completion||pending.size>0;
 $('retry').hidden=![...pending.values()].some(i=>i.failed);
 const r=state.roadmap||{};
 $('mastery').textContent=(r.mastery_index??'—')+'%';$('avg').textContent=r.average_test_score!=null?r.average_test_score+'%':'—';$('daysLeft').textContent=r.days_left??'—';$('studyDays').textContent=r.study_days_left??'—';
 $('firstPct').textContent=(r.first_round_pct||0)+'%';$('firstBar').style.width=(r.first_round_pct||0)+'%';$('dailyNeed').textContent=(r.required_minutes_per_study_day??'—')+' min/día';$('dueReviews').textContent=state.due_reviews||0;
 $('pace').textContent=r.pace_sufficient?'Tu disponibilidad cubre el cálculo provisional; falta contrastarlo con tu material y tus tiempos.':'Revisa las alternativas para ajustar tu plan.';
 $('todayPace').textContent=r.pace_sufficient?'El cálculo provisional encaja. Comprueba el tiempo real en Plan.':r.alternatives?.extra_minutes_daily!=null?`El plan necesita unos ${r.alternatives.extra_minutes_daily} min/día más. Ver Plan.`:'Revisa la fecha del examen en Perfil.';
 const hours=n=>Math.round((n||0)/60);
 $('estimateStatus').textContent=(r.estimation_status==='personalized'?'Estimación personalizada en las categorías con datos':'Estimación inicial')+` · ${r.measured_sessions||0} sesiones medidas`;
 $('workloadTotal').textContent=`Unas ${hours(r.initial_minutes)} h para ${r.target_rounds||3} vueltas desde cero · ${hours(r.estimated_minutes_required)} h pendientes con tus repasos actuales`;
 $('planMargin').textContent=`${(r.margin_minutes||0)>=0?'Margen: +':'Déficit: −'}${hours(Math.abs(r.margin_minutes||0))} h`;
 $('possibleRounds').textContent=`Según el modelo provisional: ${r.possible_rounds??'—'} vueltas${r.possible_rounds===5?' (límite del cálculo)':''}`;
 $('milestones').innerHTML=Object.entries(r.milestones||{}).slice(0,3).map(([n,d])=>`<div class="topicTop"><span>Fin orientativo · vuelta ${n}</span><b>${esc(d||'Requiere más disponibilidad')}</b></div>`).join('');
 $('simulationBuffer').textContent=`Reserva final: ${r.simulation_buffer_days||0} días de estudio para simulacros (${hours(r.simulation_buffer_minutes)} h), descontada del margen.`;
 $('planAssumptions').textContent=r.uncertainty||'';
 const audit=r.time_audit;
 $('timeAudit').textContent=audit?`${audit.volume_unmeasured_blocks} apartados sin volumen real declarado. Tiempos medidos: ${audit.study_sessions} sesiones de estudio y ${audit.review_sessions} de repaso. El modelo reduce la lectura en las vueltas: ${audit.round_reading_percentages.join(' / ')} % de la primera; los tests se calculan aparte. No confirma que puedas dominar el temario en ese tiempo.`:'';
 $('timeScenario').textContent=audit?`Si el trabajo pendiente necesitara un 50 % más de tiempo: unas ${hours(audit.scenario_required_minutes)} h y ${audit.scenario_minutes_per_study_day??'—'} min por día de estudio. ${r.days_left==null?'Indica la fecha para compararlo con tu disponibilidad.':audit.scenario_fits?'Tu disponibilidad también cubriría ese escenario.':audit.scenario_extra_minutes_daily!=null?'Necesitarías unos '+audit.scenario_extra_minutes_daily+' min diarios adicionales.':'No quedan días de estudio suficientes.'} Es una comparación, no una garantía ni un cambio en tus tareas.`:'';

 const a=r.alternatives||{};
 $('planAlternatives').innerHTML=r.pace_sufficient?'':`<h3>Opciones calculadas</h3><p>${a.extra_minutes_daily!=null?`Añadir unos ${a.extra_minutes_daily} min cada día de estudio.`:'No quedan días de estudio estimados antes del examen.'}</p>${a.with_extra_day_minutes_daily!=null?`<p>Con un día más por semana: ${a.with_extra_day_minutes_daily} min/día necesarios. ${a.with_extra_day_sufficient?'Tu tiempo diario actual bastaría.':'También necesitarías ajustar el tiempo diario.'}</p>`:''}${a.third_selective_pct>0?`<p>Dos vueltas completas y aproximadamente ${a.third_selective_pct}% de la tercera, priorizando bloques débiles.</p>`:'<p>Empieza por los bloques débiles; revisa la disponibilidad y el objetivo de vueltas.</p>'}`;
 const drift=r.schedule_margin_minutes;
 $('planDrift').textContent=drift==null?'':`Respecto al plan inicial: ${drift>=0?'+':'−'}${hours(Math.abs(drift))} h ${drift>=0?'por delante':'por detrás'} en carga de estudio prevista.`;
 $('academyImpact').textContent=r.academy?.active?'Academia tiene prioridad hoy. Su avance se descuenta del mismo temario; el margen y los hitos siguen incluyendo todas las vueltas.':'';
 const labels={study:'Estudio nuevo',review:'Repaso',test:'Test',english:'Inglés',psy:'Psicotécnicos'};
 $('paceDetails').innerHTML=Object.entries(r.pace||{}).map(([k,v])=>`<p>${labels[k]}: ${v.sessions} sesiones · ${v.personalized?'personalizado':'inicial'} · tiempo relativo ×${v.factor.toFixed(2)}</p>`).join('');
 $('weightDetails').innerHTML=(r.blocks||[]).map(w=>`<article class="topic"><b>T${w.topic_index+1} · ${esc(w.label)}</b><small>${w.size} · peso ${w.weight} · unas ${hours(w.remaining_minutes)} h pendientes</small><small>${esc(w.method)}. Estimación ${w.estimate_source==='manual'?'manual':'inferida'}; evidencia ${w.evidence_source==='official'?'BOE':w.evidence_source==='manual'?'manual':'de referencia'}.</small></article>`).join('');
 $('roundOptions').innerHTML=Object.entries(r.round_options||{}).map(([round,min])=>`<div class="topicTop"><span>${round} vueltas</span><b>${min??'—'} min/día</b></div>`).join('');
 if(opposition){
  $('oppositionName').textContent=opposition.name;
  $('topicList').innerHTML=opposition.topics.map((t,i)=>{const s=state.topics?.[i]||{},count=(t.blocks||[t.name]).length;const dates=Object.values(s.reviews||{}).map(r=>r.next_review).filter(Boolean).sort();return `<article class="topic"><b>${t.n||i+1}. ${esc(t.name)}</b><small>${Math.min(s.block||0,count)}/${count} bloques · ${s.score!=null?'Última nota: '+s.score+'%':'Sin test todavía'}${dates.length?' · Repaso '+esc(dates[0]):''}</small><div class="smallbar"><div style="width:${Math.min(100,(s.block||0)/count*100)}%"></div></div></article>`;}).join('');
  $('academyTopics').innerHTML=opposition.topics.map((t,i)=>`<label class="academyTopic"><input type="checkbox" value="${i}" ${(academyDraft??state.academy_selected??[]).includes(i)?'checked':''}><span>${t.n||i+1}. ${esc(t.name)}</span></label>`).join('');
 }
 for(const button of document.querySelectorAll('[data-pet]')){button.classList.toggle('selected',button.dataset.pet===state.pet.type);button.setAttribute('aria-pressed',button.dataset.pet===state.pet.type);}
 $('soundSwitch').checked=state.prefs.sound;$('animSwitch').checked=state.prefs.animations;
 $('onboarding').hidden=!configuringOpp&&(state.setup_complete||!!state.tasks.length||Object.keys(state.topics||{}).length>0);
 $('regen').textContent=state.tasks.length?'Reorganizar lo pendiente':'Organizar mi día';
 updateBusy();
}
function clickTask(id,button){
 const task=state.tasks.find(t=>t.id===id);if(!task||task.done||pending.has(id))return;
 if(task.kind==='test'){
  pendingTest={id,rect:button.getBoundingClientRect()};$('testMinutes').value='';$('scoreInput').value=state.settings.target_score||80;$('scoreTarget').textContent=state.settings.target_score||80;$('scoreOverlay').showModal();$('scoreInput').focus();return;
 }
 pendingTime={id,rect:button.getBoundingClientRect()};$('actualMinutes').value='';$('timeOverlay').showModal();$('actualMinutes').focus();
}
function complete(id,score,rect,actual_minutes){
 try{if(state.prefs?.sound!==false){audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}}catch{}
 try{if(rect)celebrate(rect);}catch(error){console.warn('Animación no disponible',error.name);}
 pending.set(id,{id,score,actual_minutes});rememberPending();render();submitCompletion(id);
}
function submitCompletion(id){
 enqueue(async()=>{
  const intent=pending.get(id);if(!intent)return;
  intent.failed=false;render();
  try{const wasHatched=!!state.pet.hatched,previousStage=stage();state=await api('/api/tasks/'+encodeURIComponent(id)+'/complete',{method:'POST',body:{score:intent.score,actual_minutes:intent.actual_minutes}});pending.delete(id);rememberPending();render();sound(!wasHatched&&state.pet.hatched?'birth':stage()>previousStage?'milestone':'reward');if(!wasHatched&&state.pet.hatched){$('careStatus').textContent='¡Ha nacido '+names[state.pet.type]+'! Objetivo completado.';}else if(stage()>previousStage)sendPet('react',{reaction:'milestone'});notice('Guardado. Un paso más hacia tu objetivo.');}
  catch(error){
   if(error.status&&error.status!==401)pending.delete(id);else intent.failed=true;
   rememberPending();render();throw error;
  }
 });
}
function fillSettings(){
 const s=state.settings||{};
 $('exam').value=s.exam_date||'';$('minutes').value=s.minutes_default||180;$('daysWeek').value=s.days_per_week||6;$('rounds').value=s.target_rounds||3;$('targetInput').value=s.target_score||80;$('studyMode').value=state.mode||'free';$('academyCard').hidden=$('studyMode').value!=='academy';
}
function showScreen(name){
 screen=name;for(const n of ['Today','Progress','Syllabus','Companion','Profile'])$('screen'+n).hidden=n!==name;
 for(const b of document.querySelectorAll('[data-screen]')){b.classList.toggle('active',b.dataset.screen===name);if(b.dataset.screen===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
 if(name==='Profile')fillSettings();sendPet('visibility',{visible:name==='Today'&&!document.hidden});if(name==='Today')sendPet('react',{reaction:'curious'});
}
async function plan(replan=false,profile=state){
 const s=profile.settings;
 if(!s.exam_date){showScreen('Profile');notice('Indica la fecha del examen para preparar tu plan.');return;}
 state=await api('/api/plan/today',{method:'POST',body:{opposition_id:state.selected,minutes:s.minutes_default||180,mode:profile.mode||'free',academy_topic_indexes:profile.academy_selected||[],exam_date:s.exam_date,days_per_week:s.days_per_week||6,target_rounds:s.target_rounds||3,target_score:s.target_score||80,revision:state._revision??0,replan}});render();return true;
}
async function saveSnapshot(patch){
 const payload={...state,...patch};const result=await api('/api/progress',{method:'PUT',body:{data:payload}});state=result.progress;render();notice('Cambios guardados.');
}
async function boot(){
 if(!token)return;
 try{
  user=await api('/api/me');state=await api('/api/progress');normalize();
  opposition=state.selected?await api('/api/oppositions/'+encodeURIComponent(state.selected)):null;
  $('authCard').hidden=true;$('app').hidden=false;$('nav').hidden=false;$('accountEmail').textContent=user.email;
  try{pending=new Map(JSON.parse(localStorage.getItem('or-pending-'+user.id)||'[]').map(i=>[i.id,{...i,failed:true}]));}catch{pending=new Map();}
  render();fillSettings();loadCatalog();
  // Do not replace an unconfirmed task list before retrying its durable intents.
  for(const id of pending.keys())submitCompletion(id);
  if(state.settings.exam_date)await enqueue(()=>plan(false));
 }catch(error){notice(error.message,true);}
}
async function auth(path){
 if(!$('authForm').reportValidity())return;
 $('signin').disabled=$('signup').disabled=true;
 try{const result=await api(path,{method:'POST',body:{email:$('email').value.trim(),password:$('pass').value}});token=result.token;localStorage.setItem('or18',token);$('pass').value='';await boot();notice('');}
 catch(error){notice(error.message,true);}
 finally{$('signin').disabled=$('signup').disabled=false;}
}
async function loadCatalog(){
 const select=$('catalogOpp');select.disabled=true;$('retryCatalog').hidden=true;
 try{
  const catalog=await api('/api/oppositions');
  select.innerHTML='<option value="">Selecciona una oposición</option>'+catalog.map(o=>`<option value="${esc(o.id)}">${esc(o.name)} · ${o.topics} temas</option>`).join('');
  select.disabled=!catalog.length;
  $('catalogStatus').textContent=catalog.length?'Elige un programa cargado y revisa su temario antes de configurar el plan.':'Todavía no hay programas disponibles en el catálogo.';
 }catch(error){select.innerHTML='<option value="">Catálogo no disponible</option>';$('catalogStatus').textContent='No se ha podido cargar el catálogo. Puedes reintentarlo.';$('retryCatalog').hidden=false;}
}
$('retryCatalog').onclick=loadCatalog;
$('catalogOpp').onchange=()=>{if($('catalogOpp').value)choose({kind:'catalog',id:$('catalogOpp').value});else{selectionRequest++;selectedOpp=null;$('setupDetails').hidden=true;}};
async function search(){
 const q=$('searchOpp').value.trim();if(q.length<3){notice('Escribe al menos tres caracteres.',true);return;}
 $('searchButton').disabled=true;$('searchResults').textContent='Buscando en fuentes oficiales…';
 try{
  const result=await api('/api/research/opposition?q='+encodeURIComponent(q));
  if(result.warning)notice(result.warning,true);
  const choices=[...(result.boe||[]),...(result.catalog||[])];
  $('searchResults').innerHTML=choices.map((o,i)=>`<button class="searchResult" data-choice="${i}"><b>${esc(o.name)}</b><small>${o.kind==='boe'?'BOE · pendiente de revisar':'Catálogo de referencia · comprobar vigencia'} · ${esc(o.subtitle)}</small></button>`).join('')||'<p>No se han encontrado resultados. Prueba el nombre oficial o un identificador BOE.</p>';
  document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>choose(choices[+b.dataset.choice]));
 }catch(error){$('searchResults').textContent='La búsqueda no está disponible ahora.';notice(error.message,true);}
 finally{$('searchButton').disabled=false;}
}
async function choose(choice){
 const request=++selectionRequest;selectedOpp=null;$('setupDetails').hidden=true;
 try{
  const result=await api('/api/research/select',{method:'POST',body:{kind:choice.kind,catalog_id:choice.id,boe_id:choice.boe_id}});if(request!==selectionRequest)return;selectedOpp=result.opposition;
  $('selectedName').textContent=selectedOpp.name;
  $('sourceStatus').textContent=result.status==='automatic_extraction'?'Extracción preliminar: revisa el programa oficial antes de confirmar.':result.status==='official_program'?`${selectedOpp.year} · ${selectedOpp.source_name}. Programa revisado el ${selectedOpp.reviewed_at}. No indica que el plazo de inscripción esté abierto. ${selectedOpp.program_note||''} Se carga el índice para planificar; utiliza tu material de estudio.`:result.status==='official_reference'?`${selectedOpp.year}. Referencia histórica revisada el ${selectedOpp.reviewed_at}. ${selectedOpp.program_note||''}`:'Programa de referencia del catálogo. Su vigencia para tu convocatoria no está verificada.';
  const link=$('sourceLink');link.hidden=!selectedOpp.source_url;link.href=['https://www.boe.es/','https://www.correos.com/'].some(prefix=>selectedOpp.source_url?.startsWith(prefix))?selectedOpp.source_url:'https://www.boe.es/';
  const syllabus=$('syllabusLink');syllabus.hidden=!selectedOpp.syllabus_url;syllabus.href=['https://web.guardiacivil.es/','https://cswetwebcorsta01.blob.core.windows.net/uploads/'].some(prefix=>selectedOpp.syllabus_url?.startsWith(prefix))?selectedOpp.syllabus_url:'https://www.boe.es/';
  $('selectedTopics').textContent=selectedOpp.topics.map(t=>`${t.n}. ${t.name}${t.section?' ['+t.section+' · '+t.official_n+']':''}`).join('\n');$('confirmOpp').checked=false;$('setupDetails').hidden=false;
 }catch(error){notice(error.message,true);}
}
document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
$('authForm').onsubmit=e=>{e.preventDefault();auth('/api/login');};$('signup').onclick=()=>auth('/api/register');

function renderCare(){
 const p=state.pet||{},hatched=!!p.hatched;
 const mood=state.companion_rhythm?.mood||'neutral';$('petMood').textContent=state.companion_rhythm?.message||'Tu compañero te acompaña a tu ritmo.';$('petMood').dataset.mood=mood;$('petHero').style.filter=mood==='sad'?'saturate(.7)':'';
 $('petName').textContent=hatched?names[p.type]:'Huevo de '+names[p.type||'auri'];
 $('petHero').hidden=petReady||!hatched;$('eggFallback').hidden=petReady||hatched;
 $('adoptEgg').hidden=!!p.egg_started||hatched;$('hatchEgg').hidden=true;
 $('eggFallback').dataset.cracks=p.egg_stage||0;
 $('hatchEgg').textContent=(p.egg_tasks||0)>=3?'Abrir el huevo':'Huevo · '+Math.min(3,p.egg_tasks||0)+'/3 tareas';
 $('feedPet').hidden=!hatched;$('feedPet').textContent='Darle de comer · '+(p.food||0)+(p.food===1?' ración':' raciones');
 $('playControls').hidden=!hatched;$('playStock').textContent=`${p.play_tokens||0} sesiones de juego · ganas una cada 3 tareas`;$('rewardProgress').textContent=`Cada tarea da una ración. Próximo juego: ${3-((p.care_completed||0)%3)} tareas.`;
 $('petStats').textContent=hatched?`Etapa ${stage()}/5 · Crecimiento ${p.growth||0} · Alegría ${p.happiness??50}/100`:(p.egg_stage?'La cáscara se está abriendo. Completa tu objetivo de estudio para conocer a tu compañero.':'Tu primera tarea agrietará el huevo. Al completar el objetivo del primer día, nacerá.');
 $('strokePet').setAttribute('aria-label',hatched?'Acariciar a '+names[p.type]:'Acariciar el huevo');
}
async function careAction(action,kind){
 state=await api('/api/pet/care',{method:'POST',body:{action,kind:kind||state.pet.type,revision:state._revision??0}});render();
 $('careStatus').textContent=action.startsWith('play_')?'¡Se lo está pasando genial! +8 de alegría.':action==='feed'?'¡Qué rico! +2 de crecimiento y +10 de alegría.':action==='hatch'?'¡Ha nacido '+names[state.pet.type]+'!':action==='adopt'?'Tu huevo te acompaña. Nacerá al completar el objetivo de tu primer día.':'Le encanta que lo acaricies. ♥';
 const reaction=action==='feed'?'eat':action==='play_ball'?'ball':action==='play_bubbles'?'bubbles':'stroke';
 if(action==='feed'||action.startsWith('play_')){sound(action==='feed'?'feed':'play');$('careVisual').textContent=action==='feed'?'🍎':action==='play_ball'?'🎾':'🫧';if(!petReady&&state.prefs.animations!==false&&!matchMedia('(prefers-reduced-motion: reduce)').matches){try{$('careVisual').animate([{transform:'translateY(0) scale(.8)'},{transform:'translateY(-18px) scale(1.15)'},{transform:'translateY(0) scale(1)'}],{duration:1600,iterations:2});}catch{}}}
 sendPet('react',{reaction});
}
$('adoptEgg').onclick=()=>$('eggDialog').showModal();
$('cancelEgg').onclick=()=>$('eggDialog').close();
document.querySelectorAll('[data-egg]').forEach(b=>b.onclick=()=>enqueue(async()=>{await careAction('adopt',b.dataset.egg);$('eggDialog').close();}));
$('hatchEgg').onclick=()=>{sound();enqueue(()=>careAction('hatch'));};
$('feedPet').onclick=()=>{if(!(state.pet.food>0)){$('careStatus').textContent='Completa una tarea para ganar comida.';return;}unlockCareAudio();enqueue(()=>careAction('feed'));};
function unlockCareAudio(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}}
for(const [id,action] of [['playBall','play_ball'],['playBubbles','play_bubbles']])$(id).onclick=()=>{if(!(state.pet.play_tokens>0)){$('careStatus').textContent='Completa tres tareas para ganar una sesión de juego.';return;}unlockCareAudio();enqueue(()=>careAction(action));};
let lastStroke=0,strokeStart=null;
function stroke(){
 const now=Date.now();if(now-lastStroke<700)return;lastStroke=now;
 sound('pet');sendPet('react',{reaction:'stroke'});$('careStatus').textContent=state.pet.hatched?'♥ Le encanta que lo acaricies.':'Tu huevo se siente acompañado. ♥';
 if(!writing)enqueue(()=>careAction('stroke'));
}
$('strokePet').onclick=stroke;
$('strokePet').onpointerdown=e=>{strokeStart={x:e.clientX,y:e.clientY};};
$('strokePet').onpointermove=e=>{if(strokeStart&&Math.hypot(e.clientX-strokeStart.x,e.clientY-strokeStart.y)>15){stroke();strokeStart={x:e.clientX,y:e.clientY};}};
$('strokePet').onpointerup=$('strokePet').onpointercancel=$('strokePet').onpointerleave=()=>{strokeStart=null;};
let extraRequestId;
$('addExtra').onclick=()=>{
 if(!opposition){notice('Configura primero tu oposición.',true);return;}
 $('extraTopic').innerHTML=opposition.topics.map((t,i)=>`<option value="${i}">${i+1}. ${esc(t.name)}</option>`).join('');
 extraRequestId=crypto.randomUUID();$('extraError').textContent='';$('extraDialog').showModal();
};
$('cancelExtra').onclick=()=>$('extraDialog').close();
$('extraForm').onsubmit=e=>{e.preventDefault();const topic=+$('extraTopic').value,minutes=+$('extraMinutes').value,request_id=extraRequestId;enqueue(async()=>{
 try{state=await api('/api/tasks/extra',{method:'POST',body:{topic_index:topic,minutes,request_id,revision:state._revision??0}});render();$('extraDialog').close();$('todayPlanStatus').textContent='Sesión extra añadida. Cada tarea extra completada da una ración de comida.';}
 catch(error){$('extraError').textContent=error.message;throw error;}
});};
$('chooseAcademy').onclick=()=>{
 if(!opposition){notice('Configura primero tu oposición.',true);return;}
 $('dayAcademyTopics').innerHTML=opposition.topics.map((t,i)=>`<label class="academyTopic"><input type="checkbox" value="${i}" ${(state.academy_selected||[]).includes(i)?'checked':''}><span>${i+1}. ${esc(t.name)}</span></label>`).join('');
 $('dayAcademyError').textContent='';$('academyDialog').showModal();
};
$('cancelAcademy').onclick=()=>$('academyDialog').close();
$('dayAcademyForm').onsubmit=e=>{e.preventDefault();const topics=[...$('dayAcademyTopics').querySelectorAll('input:checked')].map(x=>+x.value);enqueue(async()=>{
 try{if(await plan(true,{...state,mode:'academy',academy_selected:topics})){academyDraft=null;$('academyDialog').close();$('todayPlanStatus').textContent='Temas de academia preparados para hoy. Puedes añadir sesiones extra cuando quieras.';}}
 catch(error){$('dayAcademyError').textContent=error.message;throw error;}
});};

$('regen').onclick=()=>enqueue(async()=>{
 $('todayPlanStatus').textContent='Reorganizando tu plan…';$('regen').textContent='Reorganizando…';
 try{
  const profile=academyDraft===null?state:{...state,mode:'academy',academy_selected:[...academyDraft]};
  if(await plan(true,profile)){
   const count=state.tasks.filter(t=>!t.done).length;
   $('todayPlanStatus').textContent=count?`Plan actualizado: ${count} tareas pendientes.`:'No quedan tareas pendientes. Marca otro tema en Perfil para añadirlo a Hoy.';
  }else $('todayPlanStatus').textContent='Revisa la configuración indicada en Perfil.';
 }catch(error){$('todayPlanStatus').textContent='No se pudo reorganizar. '+error.message;throw error;}
 finally{$('regen').textContent='Reorganizar lo pendiente';}
});
$('undoTask').onclick=()=>enqueue(async()=>{const id=state.last_completion?.id;if(!id)return;state=await api('/api/tasks/'+encodeURIComponent(id)+'/undo',{method:'POST',body:{revision:state._revision??0}});render();notice('Se ha deshecho la última tarea y su recompensa.');});
$('retry').onclick=()=>{for(const [id,i] of pending)if(i.failed)submitCompletion(id);};
$('scoreForm').onsubmit=e=>{e.preventDefault();if(!pendingTest||!$('scoreForm').reportValidity())return;const score=Number($('scoreInput').value),p=pendingTest;pendingTest=null;$('scoreOverlay').close();complete(p.id,score,p.rect, $('testMinutes').value?Number($('testMinutes').value):undefined);};
$('timeForm').onsubmit=e=>{e.preventDefault();if(!pendingTime||!$('timeForm').reportValidity())return;const p=pendingTime,actual=$('actualMinutes').value?Number($('actualMinutes').value):undefined;pendingTime=null;$('timeOverlay').close();complete(p.id,undefined,p.rect,actual);};
$('cancelTime').onclick=()=>{$('timeOverlay').close();pendingTime=null;};
$('timeOverlay').onclose=()=>{pendingTime=null;};
$('cancelScore').onclick=()=>{$('scoreOverlay').close();pendingTest=null;};$('scoreOverlay').onclose=()=>{pendingTest=null;};
$('settingsForm').onsubmit=e=>{
 e.preventDefault();if(!$('settingsForm').reportValidity())return;
 const patch={settings:{...state.settings,exam_date:$('exam').value,minutes_default:+$('minutes').value,minutes_today:+$('minutes').value,days_per_week:+$('daysWeek').value,target_rounds:+$('rounds').value,target_score:+$('targetInput').value},mode:$('studyMode').value,academy_selected:[...document.querySelectorAll('#academyTopics input:checked')].map(x=>+x.value)};
 enqueue(async()=>{if(await plan(true,patch)){academyDraft=null;$('academySelectionStatus').textContent='Selección guardada.';showScreen('Today');notice('Todos los temas seleccionados están aplicados a Hoy. Lo completado se conserva.');}});
};
$('academyTopics').onchange=()=>{
 academyDraft=[...document.querySelectorAll('#academyTopics input:checked')].map(x=>+x.value);
 const edit=++academyEdit,topics=[...academyDraft];
 $('academySelectionStatus').textContent='Guardando selección y actualizando Hoy…';
 $('todayPlanStatus').textContent='Actualizando los temas seleccionados…';
 enqueue(async()=>{
  if(edit!==academyEdit)return; // Coalesce clicks waiting behind an in-flight save.
  try{
   const applied=await plan(true,{...state,mode:'academy',academy_selected:topics});
   if(edit!==academyEdit)return;
   if(applied){
    academyDraft=null;
    const message=topics.length?`${topics.length} temas guardados. Ya están en Hoy.`:'Selección guardada. No hay temas de academia pendientes; lo completado se conserva.';
    $('academySelectionStatus').textContent=message;$('todayPlanStatus').textContent=message;
   }else{
    $('academySelectionStatus').textContent='No se ha guardado: completa la configuración de estudio.';
    $('todayPlanStatus').textContent=$('academySelectionStatus').textContent;
   }
  }catch(error){
   if(edit===academyEdit){$('academySelectionStatus').textContent='No se ha podido guardar. '+error.message;$('todayPlanStatus').textContent=$('academySelectionStatus').textContent;}
   throw error;
  }
 });
};
$('studyMode').onchange=()=>{$('academyCard').hidden=$('studyMode').value!=='academy';};
for(const [id,key] of [['soundSwitch','sound'],['animSwitch','animations']])$(id).onchange=()=>{const value=$(id).checked;state.prefs[key]=value;syncPet();enqueue(()=>saveSnapshot({prefs:{...state.prefs,[key]:value}}));};
document.querySelectorAll('[data-pet]').forEach(b=>b.onclick=()=>enqueue(()=>saveSnapshot({pet:{...state.pet,type:b.dataset.pet,name:names[b.dataset.pet]}})));
$('searchForm').onsubmit=e=>{e.preventDefault();search();};
$('setupForm').onsubmit=e=>{
 e.preventDefault();if(!selectedOpp||!$('setupForm').reportValidity())return;
 enqueue(async()=>{
  state=await api('/api/setup',{method:'POST',body:{opposition:selectedOpp,exam_date:$('setupExam').value,days_per_week:+$('setupDays').value,minutes_per_day:+$('setupMinutes').value,target_rounds:+$('setupRounds').value,target_score:+$('setupTarget').value,mode:$('setupMode').value,revision:state._revision??0}});
  opposition=selectedOpp;configuringOpp=false;render();fillSettings();notice('Oposición configurada.');await plan(false);if(state.mode!=='academy')showScreen('Today');
 });
};
$('changeOpp').onclick=()=>{configuringOpp=true;$('onboarding').hidden=false;showScreen('Today');$('catalogOpp').focus();};
$('logout').onclick=()=>{if(writing){notice('Espera a que terminen los guardados.');return;}for(const k of ['or18','or15','or14','or13','or12','or11','or9'])localStorage.removeItem(k);location.reload();};
window.addEventListener('online',()=>{for(const [id,i] of pending)if(i.failed)submitCompletion(id);});
window.addEventListener('focus',()=>{if(user&&!writing&&!pending.size)enqueue(async()=>{await refreshProgress();await plan(false);});});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(error=>console.warn('PWA:',error.name));
setTimeout(()=>{if(!petReady)$('threeStatus').textContent='Vista sencilla';},8000);
boot();

matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>syncPet());
document.addEventListener('visibilitychange',()=>sendPet('visibility',{visible:screen==='Today'&&!document.hidden}));
