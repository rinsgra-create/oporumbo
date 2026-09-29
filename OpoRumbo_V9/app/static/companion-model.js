import * as THREE from './vendor/three.module.js';

export const PHASE_VARIANTS = [null,null,{size:.58,head:1.20,ears:.4,tail:.3},{size:.67,head:1.12,ears:.65,tail:.5},{size:.76,head:1.03,ears:.85,tail:.7},{size:.85,head:.97,ears:1.05,tail:.9},{size:.92,head:.9,ears:1.2,tail:1.1},{size:1,head:.85,ears:1.35,tail:1.2},{size:1.08,head:.8,ears:1.5,tail:1.35},{size:1.16,head:.76,ears:1.65,tail:1.5}];
export const phaseSize=stage=>stage===0?1:(PHASE_VARIANTS[stage+1]?.size||.58);
// Adapter boundary for future GLB assets: return {root, update, dispose}.
// All current characters are actual lit meshes, never animated photographs.
export function createCompanion(type='auri',stage=1,eggStage=0){
 const palettes={auri:[0xf0c478,0xfaf0d8,0x779f73],nexo:[0x50738c,0xc6e4d9,0x83c9bd],bruma:[0xb6aad2,0xeee7f4,0x9d94c1]};
 const [main,cream,accent]=palettes[type]||palettes.auri;
 const root=new THREE.Group(),body=new THREE.Group(),head=new THREE.Group();root.add(body);body.add(head);head.position.y=.65;
 const materials=new Map();
 function material(color,roughness=.64){const key=color+':'+roughness;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));return materials.get(key);}
 function ellipsoid(parent,color,position,scale){const m=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),material(color));m.position.set(...position);m.scale.set(...scale);parent.add(m);return m;}
 if(stage===0){
  const shell=new THREE.Group(),upper=new THREE.Group(),lower=new THREE.Group();root.add(shell);shell.add(upper,lower);
  for(const [group,start] of [[upper,0],[lower,Math.PI/2]]){
   const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,32,20,0,Math.PI*2,start,Math.PI/2),material(cream));
   mesh.scale.set(.65,.86,.61);group.add(mesh);
  }
  for(let i=0;i<7;i++){const a=i*2.4,y=(i%3-1)*.35;ellipsoid(y>0?upper:lower,accent,[Math.sin(a)*.46,y,.50],[.08,.10,.04]);}
  const cracks=new THREE.Group();shell.add(cracks);
  for(let branch=0;branch<3;branch++){
   const points=[];
   for(let i=0;i<7;i++){
    const y=.48-i*.14,x=(i%2?.065:-.035)+(branch-1)*.24;
    const z=.61*Math.sqrt(Math.max(.01,1-x*x/(.65*.65)-y*y/(.86*.86)))+.014;
    points.push(new THREE.Vector3(x,y,z));
   }
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x665342}));
   line.visible=branch===1?eggStage>=1:eggStage>=2;cracks.add(line);
  }
  return {root,update(t,reaction=0,animate=true){root.rotation.z=animate?Math.sin(t*1.5)*.025+Math.sin(reaction*Math.PI*2)*.08:0;shell.scale.y=1+(animate?Math.sin(t*2)*.013:0);},
   hatch(p){cracks.children.forEach(c=>c.visible=true);root.rotation.z=Math.sin(p*95)*.10*Math.min(1,p*3);const open=Math.max(0,(p-.48)/.52);upper.position.set(open*.6,open*1.45,0);upper.rotation.z=-open*1.3;lower.position.y=-open*.4;root.scale.setScalar(1-open*.2);},
   dispose(){root.traverse(o=>{o.geometry?.dispose();if(o.isLine)o.material.dispose();});materials.forEach(m=>m.dispose());}};
 }
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
 const mouth=new THREE.Mesh(new THREE.TubeGeometry(smileCurve,16,.012,8,false),material(0x475448));head.add(mouth);
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
 const variant=PHASE_VARIANTS[stage+1]||PHASE_VARIANTS[2];
 head.scale.setScalar(variant.head);head.position.y=.5+(stage*.025);ears.forEach(e=>e.scale.y=variant.ears);tail.scale.setScalar(variant.tail);
 if(stage===1)ellipsoid(body,cream,[0,-.62,.18],[.65,.20,.5]);
 if(stage>=2)ellipsoid(body,accent,[0,.16,.46],[.09,.12,.055]);
 if(stage>=3){const sprout=ellipsoid(head,accent,[0,.64,-.06],[.1,.24,.085]);sprout.rotation.z=-.3;}
 if(stage>=5)for(const side of [-1,1])ellipsoid(body,accent,[side*.66,.04,-.22],[.17,.42,.12]).rotation.z=-side*.65;
 let halo;
 if(stage>=8){halo=new THREE.Mesh(new THREE.TorusGeometry(.33,.022,12,48),material(0xe8cb75));halo.position.set(0,1.7,0);halo.rotation.x=Math.PI/2;root.add(halo);}
 if(stage>=4){const scarf=new THREE.Mesh(new THREE.TorusGeometry(.34,.075,8,24),material(accent));scarf.rotation.x=Math.PI/2;scarf.position.y=.36;body.add(scarf);}
 if(stage>=6)for(const side of [-1,1])ellipsoid(head,cream,[side*.48,.2,.45],[.1,.16,.04]);
 if(stage>=7)for(let i=0;i<3;i++)ellipsoid(head,0xe8cb75,[(i-1)*.16,.7,.04],[.07,.19+(i===1?.1:0),.06]);
 const size=variant.size;root.scale.setScalar(size);root.position.y=-.13;
 const bowl=new THREE.Group();root.add(bowl);
 ellipsoid(bowl,accent,[0,-.78,.77],[.3,.09,.2]);
 for(let i=0;i<3;i++)ellipsoid(bowl,0xd69055,[(i-1)*.12,-.68,.78],[.07,.06,.07]);
 const ball=ellipsoid(root,0xe8ad63,[.5,-.7,.5],[.18,.18,.18]);
 const bubbles=new THREE.Group();root.add(bubbles);
 for(let i=0;i<3;i++)ellipsoid(bubbles,0xc5e9e4,[0,0,0],[.09+i*.025,.09+i*.025,.09+i*.025]);
 bowl.visible=ball.visible=bubbles.visible=false;
 let nextBlink=2.4,blinkEnd=0;
 return {root,update(t,reaction=0,animate=true,reactionKind='happy',mood='neutral'){
  const sad=mood==='sad',happy=mood==='happy'||mood==='very_happy';mouth.rotation.z=sad?Math.PI:0;mouth.position.y=sad?-.6:0;
  if(sad)t*=.55;reaction=animate?reaction:0;const wave=Math.sin(reaction*Math.PI),eat=reactionKind==='eat',stroke=reactionKind==='stroke',curious=reactionKind==='curious',playing=reactionKind==='ball'||reactionKind==='bubbles';
  bowl.visible=eat&&reaction>0;ball.visible=reactionKind==='ball'&&reaction>0;bubbles.visible=reactionKind==='bubbles'&&reaction>0;
  ball.position.set(Math.sin(reaction*Math.PI*4)*.68,-.72+Math.abs(Math.sin(reaction*Math.PI*4))*.32,.62);
  bubbles.children.forEach((b,i)=>{b.position.set(Math.sin(reaction*6+i)*.65,-.5+((reaction+i/3)%1)*2,.7);});
  mouth.scale.y=1+(eat?wave*Math.abs(Math.sin(reaction*Math.PI*10))*.3:0);
  body.scale.y=animate?1+Math.sin(t*2)*.024:1;
  head.rotation.y=animate?Math.sin(t*.6)*.13:0;
  head.rotation.z=(animate?Math.sin(t*.8)*.035:0)+(stroke?wave*.18:curious?wave*-.22:0);
  head.rotation.x=(sad?.12:happy?-.04:0)+(eat?Math.sin(reaction*Math.PI*6)*wave*.13:0);
  head.rotation.y+=curious?Math.sin(reaction*Math.PI*2)*.3:playing?Math.sin(reaction*Math.PI*4)*.25:0;
  ears.forEach((ear,i)=>ear.rotation.z=(i? -1:1)*((type==='bruma'?.48:.2)+(sad?.22:happy?-.06:0))+(animate?Math.sin(t*1.8+i)*.035:0));
  tail.rotation.y=animate?Math.sin(t*2)*(sad?.07:happy?.4:.28)+wave*Math.sin(t*12)*.3:0;
  if(animate&&t>nextBlink){blinkEnd=t+.14;nextBlink=t+1.8+Math.random()*4.8;}
  eyes.forEach(eye=>eye.scale.y=animate&&t<blinkEnd?.09:reaction>0?.55:sad?.7:happy?.85:1);
  const bounce=reaction>0?(playing?Math.abs(Math.sin(reaction*Math.PI*3))*wave:Math.sin(reaction*Math.PI)):0;
  root.position.y=-.13+(animate&&mood==='very_happy'?Math.max(0,Math.sin(t*.8)-.94)*2:0)+bounce*(eat?.06:stroke?.035:curious?.015:reactionKind==='milestone'?.32:.22);root.rotation.z=reaction>0?Math.sin(reaction*Math.PI*2)*.065:0;
  if(halo)halo.rotation.z=animate?t*.25:0;
 },dispose(){root.traverse(o=>o.geometry?.dispose());materials.forEach(m=>m.dispose());}};
}
