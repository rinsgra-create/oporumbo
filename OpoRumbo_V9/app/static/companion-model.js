import * as THREE from './vendor/three.module.js';

// Adapter boundary for future GLB assets: return {root, update, dispose}.
// All current characters are actual lit meshes, never animated photographs.
export function createCompanion(type='auri',stage=1){
 const palettes={auri:[0xf0c478,0xfaf0d8,0x779f73],nexo:[0x50738c,0xc6e4d9,0x83c9bd],bruma:[0xb6aad2,0xeee7f4,0x9d94c1]};
 const [main,cream,accent]=palettes[type]||palettes.auri;
 const root=new THREE.Group(),body=new THREE.Group(),head=new THREE.Group();root.add(body);body.add(head);head.position.y=.65;
 const materials=new Map();
 function material(color,roughness=.64){const key=color+':'+roughness;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));return materials.get(key);}
 function ellipsoid(parent,color,position,scale){const m=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),material(color));m.position.set(...position);m.scale.set(...scale);parent.add(m);return m;}
 ellipsoid(body,main,[0,-.2,0],[.59,.68,.45]);
 ellipsoid(body,cream,[0,-.19,.35],[.4,.49,.19]);
 ellipsoid(head,main,[0,0,0],[.72,.63,.56]);
 ellipsoid(head,cream,[0,-.22,.48],[.38,.23,.13]);
 const eyes=[];
 for(const side of [-1,1]){
  const eye=new THREE.Group();eye.position.set(side*.255,.025,.51);head.add(eye);
  ellipsoid(eye,0x233a35,[0,0,0],[.098,.139,.065]);
  ellipsoid(eye,0xffffff,[-.025,.048,.053],[.032,.039,.016]);
  ellipsoid(eye,0xffffff,[.027,-.043,.056],[.013,.016,.009]);eyes.push(eye);
  ellipsoid(head,type==='auri'?0xe9a68a:accent,[side*.43,-.15,.45],[.105,.049,.035]);
  ellipsoid(body,main,[side*.48,-.2,.08],[.19,.32,.2]).rotation.z=side*.2;
  ellipsoid(body,cream,[side*.3,-.78,.17],[.25,.16,.31]);
 }
 ellipsoid(head,0x475448,[0,-.16,.618],[.066,.046,.035]);
 const smileCurve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.095,-.27,.599),new THREE.Vector3(0,-.33,.619),new THREE.Vector3(.095,-.27,.599));
 head.add(new THREE.Mesh(new THREE.TubeGeometry(smileCurve,16,.012,8,false),material(0x475448)));
 const ears=[];
 for(const side of [-1,1]){
  const ear=new THREE.Group();ear.position.set(side*.43,.43,-.01);ear.rotation.z=-side*(type==='bruma'?.48:.2);head.add(ear);
  const height=type==='nexo'?.27:type==='bruma'?.56:.44;
  ellipsoid(ear,main,[0,height*.55,0],[type==='nexo'?.24:.19,height,.15]);
  ellipsoid(ear,accent,[0,height*.7,.105],[.105,height*.65,.06]);ears.push(ear);
 }
 const tail=new THREE.Group();tail.position.set(.48,-.5,-.15);body.add(tail);
 ellipsoid(tail,accent,[.22,.04,0],[.38,.2,.23]).rotation.z=.4;
 ellipsoid(tail,cream,[.46,.16,0],[.2,.15,.17]);
 if(type==='nexo'){
  ellipsoid(body,accent,[0,.02,.49],[.16,.17,.07]).rotation.z=Math.PI/4;
  for(const side of [-1,1])ellipsoid(head,accent,[side*.23,.36,.4],[.13,.045,.08]).rotation.z=-side*.15;
 }
 if(type==='bruma')for(const side of [-1,1])ellipsoid(body,accent,[side*.49,-.03,-.18],[.28,.4,.16]).rotation.z=-side*.55;
 if(stage>=2)ellipsoid(body,accent,[0,.16,.46],[.09,.12,.055]);
 if(stage>=3){const sprout=ellipsoid(head,accent,[0,.64,-.06],[.1,.24,.085]);sprout.rotation.z=-.3;}
 if(stage>=4)for(const side of [-1,1])ellipsoid(body,accent,[side*.66,.04,-.22],[.17,.42,.12]).rotation.z=-side*.65;
 let halo;
 if(stage>=5){halo=new THREE.Mesh(new THREE.TorusGeometry(.33,.022,12,48),material(0xe8cb75));halo.position.set(0,1.7,0);halo.rotation.x=Math.PI/2;root.add(halo);}
 const size=.91+Math.min(5,stage)*.018;root.scale.setScalar(size);root.position.y=-.13;
 let nextBlink=2.4,blinkEnd=0;
 return {root,update(t,reaction=0,animate=true){
  body.scale.y=animate?1+Math.sin(t*2)*.016:1;
  head.rotation.y=animate?Math.sin(t*.6)*.075:0;
  head.rotation.z=animate?Math.sin(t*.8)*.025:0;
  ears.forEach((ear,i)=>ear.rotation.z=(i? -1:1)*(type==='bruma'?.48:.2)+(animate?Math.sin(t*1.8+i)*.035:0));
  tail.rotation.y=animate?Math.sin(t*2)*.22:0;
  if(animate&&t>nextBlink){blinkEnd=t+.14;nextBlink=t+3+Math.random()*3;}
  eyes.forEach(eye=>eye.scale.y=animate&&t<blinkEnd?.09:1);
  const bounce=reaction>0?Math.sin(reaction*Math.PI):0;
  root.position.y=-.13+bounce*.22;root.rotation.z=reaction>0?Math.sin(reaction*Math.PI*2)*.065:0;
  if(halo)halo.rotation.z=t*.25;
 },dispose(){root.traverse(o=>o.geometry?.dispose());materials.forEach(m=>m.dispose());}};
}
