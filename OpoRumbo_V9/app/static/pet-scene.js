import * as THREE from './vendor/three.module.js';
import {createCompanion,phaseSize} from './companion-model.js?v=21.5-wardrobe';

export function start(){
 const notify=(type,extra={})=>parent.postMessage({type,...extra},location.origin);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 document.body.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,30);
 camera.position.set(.3,.8,6.1);camera.lookAt(0,.27,0);
 scene.add(new THREE.HemisphereLight(0xffffff,0xabbda1,2.6));
 const key=new THREE.DirectionalLight(0xfff4df,3.2);key.position.set(-3,5,5);scene.add(key);
 const fill=new THREE.DirectionalLight(0xd9e9ff,1.5);fill.position.set(4,2,-2);scene.add(fill);
 const platform=new THREE.Mesh(new THREE.CylinderGeometry(.91,.95,.08,64),new THREE.MeshStandardMaterial({color:0xcbd9b9,roughness:.95}));platform.position.y=-1.01;scene.add(platform);
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
 const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(64,64,3,64,64,64);gradient.addColorStop(0,'rgba(37,61,42,.28)');gradient.addColorStop(1,'rgba(37,61,42,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.962;scene.add(shadow);
 const motion=matchMedia('(prefers-reduced-motion:reduce)');
 let pet=createCompanion('auri',0),kind='auri',outfitKey='{}',mood='neutral',stage=0,eggStage=0,allowAnimation=true,animated=!motion.matches,visible=true,reactionStart=-1,reactionDuration=1000,reactionKind='happy',frame=0,lost=false,disposed=false,initialized=false,hatch=null,pendingReaction=null;
 scene.add(pet.root);
 let guests=[],guestUntil=0,guestTimer;
 function clearGuests(){clearTimeout(guestTimer);guests.forEach(g=>{scene.remove(g.container);g.model.dispose();});guests=[];camera.position.set(.3,.8,6.1);camera.lookAt(0,.27,0);pet.root.visible=true;}
 const particles=new THREE.Group(),sparkGeometry=new THREE.SphereGeometry(.035,6,4),sparkMaterial=new THREE.MeshBasicMaterial({color:0xffe8af,transparent:true});
 for(let i=0;i<12;i++)particles.add(new THREE.Mesh(sparkGeometry,sparkMaterial));
 particles.visible=false;scene.add(particles);
 const glowGeometry=new THREE.SphereGeometry(.85,16,12),glowMaterial=new THREE.MeshBasicMaterial({color:0xffedbb,transparent:true,opacity:0,depthWrite:false});
 const glow=new THREE.Mesh(glowGeometry,glowMaterial);glow.position.y=.25;glow.visible=false;scene.add(glow);
 function fitTeam(){if(!guests.length)return;const box=new THREE.Box3();guests.forEach(g=>box.expandByObject(g.container));const size=box.getSize(new THREE.Vector3());const distance=Math.max(6.1,Math.max(size.x/camera.aspect,size.y)/2/Math.tan(THREE.MathUtils.degToRad(16))*1.18);camera.position.set(0,.8,distance);camera.lookAt(0,.35,0);}
 function beginReaction(nextReaction){reactionKind=['happy','eat','stroke','curious','milestone','ball','bubbles'].includes(nextReaction)?nextReaction:'happy';reactionDuration=['ball','bubbles'].includes(reactionKind)?3200:reactionKind==='eat'?2600:reactionKind==='stroke'?1400:1000;document.documentElement.dataset.reaction=reactionKind;reactionStart=performance.now();schedule();}
 function finishHatch(){if(!hatch)return;scene.remove(hatch.egg.root);hatch.egg.dispose();hatch=null;delete document.documentElement.dataset.transition;pet.root.visible=true;particles.visible=false;glow.visible=false;pet.root.scale.setScalar(phaseSize(stage));if(pendingReaction&&visible&&!document.hidden&&animated)beginReaction(pendingReaction);pendingReaction=null;}
 function draw(now=performance.now()){
  frame=0;if(lost||disposed||!visible||document.hidden)return;
  const p=reactionStart<0?0:Math.min(1,(now-reactionStart)/reactionDuration);if(p===1){reactionStart=-1;delete document.documentElement.dataset.reaction;}
  pet.update(now/1000,p,animated,reactionKind,mood);
  if(guestUntil && now>guestUntil){clearGuests();guestUntil=0;}
  guests.forEach(g=>g.model.update(now/1000,p,animated,reactionKind,g.mood));
  if(hatch){
   if(!animated)finishHatch();else{
    const h=Math.min(1,(now-hatch.start)/hatch.duration);
    if(hatch.type==='birth')hatch.egg.hatch(h);
    else{hatch.egg.update(now/1000,0,true,'happy',mood);hatch.egg.root.rotation.y=h*Math.PI*2;hatch.egg.root.scale.setScalar((phaseSize(hatch.previousStage))*Math.max(.05,1-Math.max(0,h-.18)*2.5));hatch.egg.root.visible=h<.6;}
    glow.visible=true;glowMaterial.opacity=Math.sin(h*Math.PI)*.32;glow.scale.setScalar(.75+Math.sin(h*Math.PI)*.6);
    pet.root.visible=h>.58;
    if(pet.root.visible)pet.root.scale.setScalar((phaseSize(stage))*Math.min(1,(h-.58)/.22));
    particles.visible=h>.42;sparkMaterial.opacity=Math.max(0,1-(h-.42)/.58)*.8;
    particles.children.forEach((spark,i)=>{const a=i*Math.PI*2/12,r=Math.max(0,h-.4)*2.6;spark.position.set(Math.cos(a)*r,Math.sin(a)*r*.7+.3,.5);});
    if(h===1)finishHatch();
   }
  }
  shadow.scale.setScalar(animated?1+Math.sin(now/500)*.025:1);key.intensity=3.2+(animated?Math.sin(now/1300)*.10:0);
  renderer.render(scene,camera);
  if(animated)frame=requestAnimationFrame(draw);
 }
 function schedule(){if(!frame&&!lost&&!disposed&&visible&&!document.hidden)frame=requestAnimationFrame(draw);}
 function resize(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();fitTeam();schedule();}
 const observer=new ResizeObserver(resize);observer.observe(document.documentElement);resize();
 function updateMotion(){animated=allowAnimation&&!motion.matches;if(!animated){cancelAnimationFrame(frame);frame=0;reactionStart=-1;finishHatch();}schedule();}
 motion.addEventListener('change',updateMotion);
 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin||disposed)return;
  const d=event.data||{};
  if(d.type==='setTeam'){
   clearGuests();finishHatch();allowAnimation=d.animations!==false;updateMotion();
   const members=(Array.isArray(d.pets)?d.pets:[]).slice(0,3);
   members.forEach((e,i)=>{const model=createCompanion(e.species, e.hatched?Math.max(1,Math.min(8,e.phase-2)):0,e.phase===2?1:0,e.outfit||{}),container=new THREE.Group();container.position.x=(i-(members.length-1)/2)*1.8;container.add(model.root);scene.add(container);guests.push({model,container,mood:e.mood});});
   pet.root.visible=false;fitTeam();guestUntil=d.temporary?performance.now()+15000:0;if(d.temporary)guestTimer=setTimeout(()=>{clearGuests();schedule();},15000);schedule();
  }
  if(d.type==='setPet'){
   if(guests.length)clearGuests();
   mood=['very_happy','happy','sad','neutral'].includes(d.mood)?d.mood:'neutral';document.documentElement.dataset.mood=mood;
   allowAnimation=d.animations!==false;updateMotion();
   const nextKind=['auri','nexo','bruma'].includes(d.pet)?d.pet:'auri',nextStage=Math.max(0,Math.min(8,Number(d.stage)||0)),nextEgg=Math.max(0,Math.min(2,Number(d.eggStage)||0));
   const outfit=d.outfit&&typeof d.outfit==='object'?d.outfit:{},nextOutfit=JSON.stringify(outfit);document.documentElement.dataset.outfit=nextOutfit;
   if(nextOutfit!==outfitKey||nextKind!==kind||nextStage!==stage||nextEgg!==eggStage){
    finishHatch();const old=pet,previousStage=stage,transitionType=stage===0?'birth':'evolution',shouldHatch=initialized&&nextKind===kind&&nextStage>stage&&animated&&visible&&!document.hidden;
    kind=nextKind;stage=nextStage;eggStage=nextEgg;outfitKey=nextOutfit;pet=createCompanion(kind,stage,eggStage,outfit);scene.add(pet.root);
    if(shouldHatch){hatch={egg:old,start:performance.now(),type:transitionType,previousStage,duration:transitionType==='birth'?4600:3600};document.documentElement.dataset.transition=transitionType;pet.root.visible=false;}else{scene.remove(old.root);old.dispose();}
   }
   initialized=true;schedule();
  }
  if(d.type==='react'&&animated){if(hatch)pendingReaction=d.reaction;else beginReaction(d.reaction);}
  if(d.type==='visibility'){visible=d.visible!==false;if(!visible){cancelAnimationFrame(frame);frame=0;finishHatch();}else schedule();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;finishHatch();}else schedule();});
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;finishHatch();notify('pet3dFailed',{reason:'Contexto WebGL interrumpido'});});
 renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;schedule();notify('pet3dReady');});
 addEventListener('pagehide',event=>{cancelAnimationFrame(frame);frame=0;if(event.persisted)return;disposed=true;observer.disconnect();motion.removeEventListener('change',updateMotion);finishHatch();pet.dispose();clearGuests();sparkGeometry.dispose();sparkMaterial.dispose();glowGeometry.dispose();glowMaterial.dispose();platform.geometry.dispose();platform.material.dispose();shadow.geometry.dispose();shadow.material.map.dispose();shadow.material.dispose();renderer.dispose();});
 addEventListener('pageshow',()=>schedule());
 draw();notify('pet3dReady');
}
