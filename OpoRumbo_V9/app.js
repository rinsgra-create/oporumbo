/* Study UI. The companion communicates only through a small, origin-checked bridge. */
'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=['or18','or15','or14','or13','or12','or11','or9'].map(k=>localStorage.getItem(k)).find(Boolean);
let state={},opposition=null,user=null,screen='Today',selectedOpp=null,pendingTest=null,pendingTime=null,configuringOpp=false;
let pending=new Map(),queue=Promise.resolve(),writing=0,petReady=false,audioContext;
let academyDraft=null;
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
function stage(){const r=state.roadmap||{};return r.completed_rounds>=2?5:r.first_round_pct>=100?4:(r.first_round_pct>=50?3:state.xp>=300?2:1);}
function sendPet(type,extra={}){const f=$('pet3dFrame');if(f?.contentWindow)f.contentWindow.postMessage({type,...extra},location.origin);}
function syncPet(){sendPet('setPet',{pet:state.pet.type,stage:stage(),animations:state.prefs.animations!==false&&!matchMedia('(prefers-reduced-motion: reduce)').matches});}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==$('pet3dFrame').contentWindow)return;
 if(event.data?.type==='pet3dReady'){petReady=true;$('petHero').hidden=true;$('pet3dFrame').style.visibility='visible';$('threeStatus').textContent='3D activo';normalize();syncPet();}
 if(event.data?.type==='pet3dFailed'){petReady=false;$('petHero').hidden=false;$('pet3dFrame').style.visibility='hidden';$('threeStatus').textContent='Vista sencilla';console.warn('Compañero 3D:',event.data.reason);}
});
function sound(){
 if(state.prefs?.sound===false)return;
 try{
  audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
  if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
  const now=audioContext.currentTime;
  [523.25,659.25,783.99].forEach((f,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(audioContext.destination);g.gain.setValueAtTime(0,now+i*.045);g.gain.linearRampToValueAtTime(.07,now+i*.045+.008);g.gain.exponentialRampToValueAtTime(.001,now+i*.045+.18);o.start(now+i*.045);o.stop(now+i*.045+.2);o.onended=()=>{o.disconnect();g.disconnect();};});
 }catch(error){console.warn('Audio no disponible',error.name);}
}
function celebrate(rect){
 if(state.prefs?.animations===false||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const target=$('petStage').getBoundingClientRect(),orb=document.createElement('i');orb.className='energyOrb';document.body.append(orb);
 const sx=rect.left+rect.width/2,sy=rect.top+rect.height/2,dx=target.left+target.width/2-sx,dy=target.top+target.height*.6-sy;
 orb.style.left=sx+'px';orb.style.top=sy+'px';
 const animation=orb.animate([{transform:'translate(-50%,-50%) scale(.7)',opacity:1},{transform:`translate(${dx*.55}px,${dy*.55-65}px) scale(1.15)`,opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.2)`,opacity:0}],{duration:650,easing:'ease-in-out'});
 animation.onfinish=()=>{orb.remove();if(petReady)sendPet('react',{reaction:'eat'});};
}
function render(){
 normalize();const xp=state.xp||0;
 $('petName').textContent=names[state.pet.type];$('petHero').src='/static/'+state.pet.type+'.png';$('level').textContent='Nivel '+(Math.floor(xp/300)+1);$('energy').textContent=(state.pet.energy??100)+'%';$('xpFill').style.width=(xp%300)/3+'%';syncPet();
 document.documentElement.classList.toggle('reduce-motion',!state.prefs.animations);
 $('date').textContent=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'short'});
 const tasks=state.tasks,done=tasks.filter(t=>t.done||pending.has(t.id)).length,total=tasks.length;
 const totalMinutes=tasks.reduce((n,t)=>n+(t.done?(t.actual_minutes??t.minutes):t.minutes),0);
 $('dayMeta').textContent=`${done} de ${total} completadas · ${Math.round(totalMinutes)} min en total`;
 $('dayFill').style.width=(total?done/total*100:0)+'%';
 $('todayAcademy').hidden=state.mode!=='academy';
 $('todayAcademy').textContent=state.plan_extra_minutes>0?`Las sesiones de hoy superan en unos ${state.plan_extra_minutes} min tu tiempo diario previsto. Puedes repartirlas o ajustar tu disponibilidad en Perfil.`:'Los temas de academia aplicados están incluidos en Hoy.';
 $('tasks').innerHTML=tasks.map(t=>{
  const intent=pending.get(t.id),complete=t.done||!!intent;
  let tag=t.kind==='urgent_review'?'<span class="tag red">Repaso prioritario</span>':t.kind==='maintenance'?'<span class="tag green">Mantenimiento</span>':t.kind==='test'?`<span class="tag blue">Objetivo ${state.settings.target_score||80}%${t.score!=null?' · Nota '+t.score+'%':''}</span>`:'';
  let status=intent?(intent.failed?'Pendiente de confirmar':'Guardando…'):t.done?'Hecho hoy':'';
  const duration=t.done&&t.actual_minutes!=null?`${t.actual_minutes} min reales`:`${t.minutes} min previstos`;
  return `<article class="task ${complete?'completed':''}"><div class="taskCopy"><b>${esc(t.title)}</b><small>${esc(t.detail)}</small><div class="taskMeta"><span>${duration}</span>${tag}</div>${status?`<small class="saved ${intent?.failed?'pending':''}">${status}</small>`:''}${t.next_review?`<small>Próximo repaso: ${esc(t.next_review)}</small>`:''}</div><button class="check ${complete?'done':''}" data-task="${esc(t.id)}" aria-label="${complete?'Completada: ':'Completar: '}${esc(t.title)}" ${complete?'disabled':''}>${complete?'✓':'<span></span>'}</button></article>`;
 }).join('')||'<div class="empty"><b>Tu siguiente paso empieza aquí</b><p>Configura tu oposición y organiza una sesión a tu medida.</p></div>';
 document.querySelectorAll('[data-task]').forEach(button=>button.onclick=()=>clickTask(button.dataset.task,button));
 $('undoTask').hidden=!state.last_completion||pending.size>0;
 $('retry').hidden=![...pending.values()].some(i=>i.failed);
 const r=state.roadmap||{};
 $('mastery').textContent=(r.mastery_index??'—')+'%';$('avg').textContent=r.average_test_score!=null?r.average_test_score+'%':'—';$('daysLeft').textContent=r.days_left??'—';$('studyDays').textContent=r.study_days_left??'—';
 $('firstPct').textContent=(r.first_round_pct||0)+'%';$('firstBar').style.width=(r.first_round_pct||0)+'%';$('dailyNeed').textContent=(r.required_minutes_per_study_day??'—')+' min/día';$('dueReviews').textContent=state.due_reviews||0;
 $('pace').textContent=r.pace_sufficient?'Tu disponibilidad cubre la estimación actual.':'Revisa las alternativas para ajustar tu plan.';
 $('todayPace').textContent=r.pace_sufficient?'Vas bien según la estimación actual.':r.alternatives?.extra_minutes_daily!=null?`El plan necesita unos ${r.alternatives.extra_minutes_daily} min/día más. Ver Plan.`:'Revisa la fecha del examen en Perfil.';
 const hours=n=>Math.round((n||0)/60);
 $('estimateStatus').textContent=(r.estimation_status==='personalized'?'Estimación personalizada en las categorías con datos':'Estimación inicial')+` · ${r.measured_sessions||0} sesiones medidas`;
 $('workloadTotal').textContent=`Unas ${hours(r.initial_minutes)} h para ${r.target_rounds||3} vueltas desde cero · ${hours(r.estimated_minutes_required)} h pendientes con tus repasos actuales`;
 $('planMargin').textContent=`${(r.margin_minutes||0)>=0?'Margen: +':'Déficit: −'}${hours(Math.abs(r.margin_minutes||0))} h`;
 $('possibleRounds').textContent=`A tu ritmo actual: ${r.possible_rounds??'—'} vueltas completas${r.possible_rounds===5?' o más':''}`;
 $('milestones').innerHTML=Object.entries(r.milestones||{}).slice(0,3).map(([n,d])=>`<div class="topicTop"><span>Fin orientativo · vuelta ${n}</span><b>${esc(d||'Requiere más disponibilidad')}</b></div>`).join('');
 $('simulationBuffer').textContent=`Reserva final: ${r.simulation_buffer_days||0} días de estudio para simulacros (${hours(r.simulation_buffer_minutes)} h), descontada del margen.`;
 $('planAssumptions').textContent=r.uncertainty||'';
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
 sound();if(rect)celebrate(rect);
 pending.set(id,{id,score,actual_minutes});rememberPending();render();submitCompletion(id);
}
function submitCompletion(id){
 enqueue(async()=>{
  const intent=pending.get(id);if(!intent)return;
  intent.failed=false;render();
  try{state=await api('/api/tasks/'+encodeURIComponent(id)+'/complete',{method:'POST',body:{score:intent.score,actual_minutes:intent.actual_minutes}});pending.delete(id);rememberPending();render();notice('Guardado. Un paso más hacia tu objetivo.');}
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
 if(name==='Profile')fillSettings();sendPet('visibility',{visible:name==='Today'});
}
async function plan(replan=false,profile=state){
 const s=profile.settings;
 if(!s.exam_date){showScreen('Profile');notice('Indica la fecha del examen para preparar tu plan.');return;}
 if(profile.mode==='academy'&&!profile.academy_selected?.length){showScreen('Profile');notice('Marca los temas de academia que tocan hoy.');return;}
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
  render();fillSettings();
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
 try{
  const result=await api('/api/research/select',{method:'POST',body:{kind:choice.kind,catalog_id:choice.id,boe_id:choice.boe_id}});selectedOpp=result.opposition;
  $('selectedName').textContent=selectedOpp.name;
  $('sourceStatus').textContent=result.status==='automatic_extraction'?'Extracción preliminar: revisa el programa oficial antes de confirmar.':'Programa de referencia del catálogo. Su vigencia para tu convocatoria no está verificada.';
  const link=$('sourceLink');link.hidden=!selectedOpp.source_url;link.href=selectedOpp.source_url?.startsWith('https://www.boe.es/')?selectedOpp.source_url:'https://www.boe.es/';
  $('selectedTopics').textContent=selectedOpp.topics.map(t=>`${t.n}. ${t.name}`).join('\n');$('confirmOpp').checked=false;$('setupDetails').hidden=false;
 }catch(error){notice(error.message,true);}
}
document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
$('authForm').onsubmit=e=>{e.preventDefault();auth('/api/login');};$('signup').onclick=()=>auth('/api/register');
$('regen').onclick=()=>enqueue(()=>plan(true));
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
$('academyTopics').onchange=()=>{academyDraft=[...document.querySelectorAll('#academyTopics input:checked')].map(x=>+x.value);$('academySelectionStatus').textContent=`${academyDraft.length} temas seleccionados · cambios sin aplicar. Pulsa «Aplicar temas a Hoy».`;};
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
$('changeOpp').onclick=()=>{configuringOpp=true;$('onboarding').hidden=false;showScreen('Today');$('searchOpp').focus();};
$('logout').onclick=()=>{if(writing){notice('Espera a que terminen los guardados.');return;}for(const k of ['or18','or15','or14','or13','or12','or11','or9'])localStorage.removeItem(k);location.reload();};
window.addEventListener('online',()=>{for(const [id,i] of pending)if(i.failed)submitCompletion(id);});
window.addEventListener('focus',()=>{if(user&&!writing&&!pending.size)enqueue(async()=>{await refreshProgress();await plan(false);});});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(error=>console.warn('PWA:',error.name));
setTimeout(()=>{if(!petReady)$('threeStatus').textContent='Vista sencilla';},8000);
boot();
