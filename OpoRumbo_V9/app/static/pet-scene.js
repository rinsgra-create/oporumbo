import * as THREE from './vendor/three.module.js';
import {createCompanion} from './companion-model.js?v=20.1';

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
 let pet=createCompanion('auri',0),kind='auri',stage=0,eggStage=0,allowAnimation=true,animated=!motion.matches,visible=true,reactionStart=-1,reactionKind='happy',frame=0,lost=false,disposed=false,initialized=false,hatch=null;
 scene.add(pet.root);
 const particles=new THREE.Group(),sparkGeometry=new THREE.SphereGeometry(.035,6,4),sparkMaterial=new THREE.MeshBasicMaterial({color:0xffe8af,transparent:true});
 for(let i=0;i<12;i++)particles.add(new THREE.Mesh(sparkGeometry,sparkMaterial));
 particles.visible=false;scene.add(particles);
 function finishHatch(){if(!hatch)return;scene.remove(hatch.egg.root);hatch.egg.dispose();hatch=null;pet.root.visible=true;particles.visible=false;pet.root.scale.setScalar(.91+stage*.018);}
 function draw(now=performance.now()){
  frame=0;if(lost||disposed||!visible||document.hidden)return;
  const p=reactionStart<0?0:Math.min(1,(now-reactionStart)/1000);if(p===1)reactionStart=-1;
  pet.update(now/1000,p,animated,reactionKind);
  if(hatch){
   if(!animated)finishHatch();else{
    const h=Math.min(1,(now-hatch.start)/2100);hatch.egg.hatch(h);pet.root.visible=h>.58;
    if(pet.root.visible)pet.root.scale.setScalar((.91+stage*.018)*Math.min(1,(h-.58)/.22));
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
 function resize(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();schedule();}
 const observer=new ResizeObserver(resize);observer.observe(document.documentElement);resize();
 function updateMotion(){animated=allowAnimation&&!motion.matches;if(!animated){cancelAnimationFrame(frame);frame=0;reactionStart=-1;finishHatch();}schedule();}
 motion.addEventListener('change',updateMotion);
 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin||disposed)return;
  const d=event.data||{};
  if(d.type==='setPet'){
   allowAnimation=d.animations!==false;updateMotion();
   const nextKind=['auri','nexo','bruma'].includes(d.pet)?d.pet:'auri',nextStage=Math.max(0,Math.min(5,Number(d.stage)||0)),nextEgg=Math.max(0,Math.min(2,Number(d.eggStage)||0));
   if(nextKind!==kind||nextStage!==stage||nextEgg!==eggStage){
    finishHatch();const old=pet,shouldHatch=initialized&&stage===0&&nextStage>0&&animated&&visible&&!document.hidden;
    kind=nextKind;stage=nextStage;eggStage=nextEgg;pet=createCompanion(kind,stage,eggStage);scene.add(pet.root);
    if(shouldHatch){hatch={egg:old,start:performance.now()};pet.root.visible=false;}else{scene.remove(old.root);old.dispose();}
   }
   initialized=true;schedule();
  }
  if(d.type==='react'&&animated&&!hatch){reactionKind=['happy','eat','stroke','curious','milestone'].includes(d.reaction)?d.reaction:'happy';reactionStart=performance.now();schedule();}
  if(d.type==='visibility'){visible=d.visible!==false;if(!visible){cancelAnimationFrame(frame);frame=0;finishHatch();}else schedule();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;finishHatch();}else schedule();});
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;finishHatch();notify('pet3dFailed',{reason:'Contexto WebGL interrumpido'});});
 renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;schedule();notify('pet3dReady');});
 addEventListener('pagehide',event=>{cancelAnimationFrame(frame);frame=0;if(event.persisted)return;disposed=true;observer.disconnect();motion.removeEventListener('change',updateMotion);finishHatch();pet.dispose();sparkGeometry.dispose();sparkMaterial.dispose();platform.geometry.dispose();platform.material.dispose();shadow.geometry.dispose();shadow.material.map.dispose();shadow.material.dispose();renderer.dispose();});
 addEventListener('pageshow',()=>schedule());
 draw();notify('pet3dReady');
}
