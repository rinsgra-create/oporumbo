import * as THREE from './vendor/three.module.js';
import {createCompanion} from './companion-model.js';

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
 let pet=createCompanion(),kind='auri',stage=1,animated=!matchMedia('(prefers-reduced-motion:reduce)').matches,visible=true,reactionStart=-1,frame=0,lost=false;
 scene.add(pet.root);
 function draw(now=performance.now()){
  frame=0;if(lost)return;
  const p=reactionStart<0?0:Math.min(1,(now-reactionStart)/850);if(p===1)reactionStart=-1;
  pet.update(now/1000,p,animated);renderer.render(scene,camera);
  if(visible&&!document.hidden&&animated)frame=requestAnimationFrame(draw);
 }
 function schedule(){if(!frame&&!lost)frame=requestAnimationFrame(draw);}
 function resize(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();schedule();}
 new ResizeObserver(resize).observe(document.documentElement);resize();
 addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;
  const d=event.data||{};
  if(d.type==='setPet'){
   const nextKind=['auri','nexo','bruma'].includes(d.pet)?d.pet:'auri',nextStage=Math.max(1,Math.min(5,Number(d.stage)||1));
   if(nextKind!==kind||nextStage!==stage){scene.remove(pet.root);pet.dispose();kind=nextKind;stage=nextStage;pet=createCompanion(kind,stage);scene.add(pet.root);}
   animated=d.animations!==false;if(!animated){cancelAnimationFrame(frame);frame=0;reactionStart=-1;}schedule();
  }
  if(d.type==='react'&&animated){reactionStart=performance.now();schedule();}
  if(d.type==='visibility'){visible=d.visible!==false;if(!visible){cancelAnimationFrame(frame);frame=0;}else schedule();}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;notify('pet3dFailed',{reason:'Contexto WebGL interrumpido'});});
 renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;draw();notify('pet3dReady');});
 addEventListener('pagehide',()=>{cancelAnimationFrame(frame);pet.dispose();renderer.dispose();});
 draw();notify('pet3dReady');
}
