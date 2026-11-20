import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { demoConfig as config } from './config.js';

const $ = s => document.querySelector(s);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viewport = $('#viewport');
let renderer, controls, camera, scene, world, sceneGroup, scanGroup;
let current = config.conditions.find(c=>c.id===new URLSearchParams(location.search).get('condition'))||config.conditions[0], representation = 'spatial', resetTween = null, fitBox = null;
let loadId = 0;
let currentModel=config.models.find(m=>m.id===new URLSearchParams(location.search).get('model'))||config.models[0];
let externalTime=18, renderDirty=true, activeViewport=true, lastRender=0;
let revealData=null;
let compareScan=false, scanSplit=.5, revealRequested=true;
const revealUniforms={uRevealTime:{value:0},uRevealEnabled:{value:1}};
let trajectory=null, trackedCamera=null, cameraMarker=null, trajectoryLine=null, pointsGroup=null;
const video = $("#input-video");
let presentedVideoTime=0;
if(video.requestVideoFrameCallback){const onFrame=(now,meta)=>{presentedVideoTime=meta.mediaTime;video.requestVideoFrameCallback(onFrame);};video.requestVideoFrameCallback(onFrame);}
video.addEventListener("seeked",()=>{presentedVideoTime=video.currentTime;});
const cache = new Map();
const cloneFlat = v => Array.isArray(v?.[0]) ? v.flat() : v;
const loadedScenes = new Map();

$('#capture-label').textContent = `CAPTURE ${config.captureId}`;
$('#input-frame').src = config.inputFrame;
$('#input-frame').addEventListener('error', () => $('#input-error').hidden = false);
if (config.inputVideo) {
  // Parent owns the only video decoder.
  $('#input-video').hidden = false;
  $('#input-frame').hidden = true;
  $('#input-kind').textContent = 'INPUT VIDEO';
  $('#input-media-label').hidden = true;
  $('#input-description').textContent = 'Source video · 30 fps';
}
if (config.scan) {
  $('#scan-toggle').disabled = false;
  $('#scan-control').title = 'Overlay the aligned reference scan';
} else {
  $('#scan-control').title = 'Aligned laser-scan geometry is not yet included in this preview';
}
$('#asset-note').textContent = 'Occlusion-aware reveal · saved scene geometry';

async function packedBuffer(url) {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Asset unavailable (${response.status}): ${url}`);
  const bytes=await response.arrayBuffer(),magic=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
  // Some hosts decode Content-Encoding automatically; only decompress gzip bytes.
  return magic[0]===31&&magic[1]===139
    ?new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    :bytes;
}
async function getData(url) {
  if(!cache.has(url))cache.set(url,(async()=>{
    const packed=['assets/scan.json','assets/points.json'].includes(url);
    let data;
    if(packed)data=JSON.parse(new TextDecoder().decode(await packedBuffer('assets/packed/'+url.split('/').pop()+'.gz')));
    else {const response=await fetch(url);if(!response.ok)throw new Error(`Asset unavailable (${response.status}): ${url}`);data=await response.json();}
    if(data.revealBuffers){
      const [pos,times]=await Promise.all(data.revealBuffers.map(path=>packedBuffer('assets/packed/'+path.split('/').pop()+'.gz')));
      const positions=new Float32Array(pos),birth=new Float32Array(times);
      for(const mesh of data.meshes){mesh.vertices=positions.subarray(mesh.start*3,(mesh.start+mesh.count)*3);mesh.revealTimes=birth.subarray(mesh.start,mesh.start+mesh.count);}
    }
    return data;
  })().catch(error=>{cache.delete(url);throw error;}));
  return cache.get(url);
}

function parseColor(value, fallback = '#d6d0bd') {
  if (Array.isArray(value)) return new THREE.Color().setRGB(...value.slice(0,3).map(x => x > 1 ? x / 255 : x));
  return new THREE.Color(value ?? fallback);
}
function geometryGroup(data, isScan = false) {
  const group = new THREE.Group();
  group.name = isScan ? 'Reference scan' : 'Saved reconstruction';
  if (data.points) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(cloneFlat(data.points), 3));
    const vertices=geo.getAttribute('position'),shades=new Float32Array(vertices.count*3);
    for(let i=0;i<vertices.count;i++){const h=THREE.MathUtils.clamp((vertices.getZ(i)+1.3)/.65,0,1);const c=new THREE.Color('#c6d4c6').lerp(new THREE.Color('#134d50'),h);shades.set([c.r,c.g,c.b],i*3);}
    geo.setAttribute('color',new THREE.BufferAttribute(shades,3));
    const material = new THREE.PointsMaterial({ vertexColors:true, size: .028, transparent: false, opacity: 1, sizeAttenuation: true, depthWrite:true });
    group.add(new THREE.Points(geo, material));
  }
  for (const m of data.meshes ?? []) {
    if (m.hidden || m.role === 'ceiling') continue;
    const vertices = cloneFlat(m.vertices ?? m.positions);
    if (!vertices?.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', (vertices instanceof Float32Array ? new THREE.BufferAttribute(vertices,3) : new THREE.Float32BufferAttribute(vertices,3)));
    const indices = cloneFlat(m.triangles ?? m.indices ?? []);
    if (indices.length) geo.setIndex(indices);
    if(m.revealTimes)geo.setAttribute('revealBirth',new THREE.BufferAttribute(m.revealTimes,1));
    if (m.normals) geo.setAttribute('normal', new THREE.Float32BufferAttribute(cloneFlat(m.normals),3));
    else geo.computeVertexNormals();
    if (m.colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(cloneFlat(m.colors), 3));
    const material = isScan ? new THREE.MeshBasicMaterial({ color:'#a6462e', wireframe:true, transparent:true, opacity:.32, depthWrite:false }) : new THREE.MeshStandardMaterial({ color:parseColor(m.color), vertexColors:!!m.colors, roughness:.86, metalness:0, side:THREE.DoubleSide, transparent: m.opacity < 1, opacity: m.opacity ?? 1 });
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = m.name ?? 'Scene object';
    mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
  }
  if ((data.upAxis ?? 'Z').toUpperCase() === 'Z') group.rotation.x = -Math.PI/2;
  return group;
}

function initialize3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8e8e1');
  camera = new THREE.PerspectiveCamera(34, 1, .01, 2000);
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  viewport.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D scene: drag to orbit, scroll to zoom. Reset view restores a 55-degree elevation.');
  renderer.domElement.setAttribute('role','img');
  const hemi = new THREE.HemisphereLight('#fffdf6','#8a8b76',2.8);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff3df',3);
  key.position.set(-5,8,6);scene.add(key);
  const fill = new THREE.DirectionalLight('#f0f6ff',1.7);fill.position.set(6,4,-3);scene.add(fill);
  world = new THREE.Group();scene.add(world);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor=.09;
  controls.minPolarAngle=.08;controls.maxPolarAngle=Math.PI*.49;
  controls.enablePan=true;controls.screenSpacePanning=true;
  controls.addEventListener('start',()=>{resetTween=null;});
  controls.addEventListener('change',()=>{renderDirty=true;
    const elevation = 90-THREE.MathUtils.radToDeg(controls.getPolarAngle());
    $('#view-tag').textContent = `OBLIQUE VIEW · ${Math.round(elevation)}°`;
  });
  new ResizeObserver(resize).observe(viewport);
  resize();
  renderer.setAnimationLoop(animate);
}
function resize() {
 renderDirty=true;
  if (!renderer) return;
  const width = viewport.clientWidth, height=viewport.clientHeight;
  if (!width || !height) return;
  const aspectChanged=Math.abs(camera.aspect-width/height)>.01;
  camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);
  if(aspectChanged && fitBox)resetView(false);
}
function cameraTarget() {
  const center=fitBox.getCenter(new THREE.Vector3());
  const size=fitBox.getSize(new THREE.Vector3());
  const radius=size.length()/2;
  const fov=THREE.MathUtils.degToRad(camera.fov);
  const distance=radius/Math.sin(fov/2)*.90 / Math.min(1,camera.aspect);
  const elevation=THREE.MathUtils.degToRad(55), azimuth=THREE.MathUtils.degToRad(135);
  const position=new THREE.Vector3(Math.cos(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.sin(azimuth)*Math.cos(elevation)).multiplyScalar(distance).add(center);
  controls.minDistance=Math.max(.05,radius*.3);controls.maxDistance=Math.max(10,radius*12);
  camera.near=Math.max(.005,radius/1000);camera.far=Math.max(100,radius*100);camera.updateProjectionMatrix();
  return { center,position };
}
function resetView(animated=true) {
  if (!fitBox) return;
  const {center,position}=cameraTarget();
  if (animated && !reducedMotion) resetTween={from:camera.position.clone(),targetFrom:controls.target.clone(),to:position,targetTo:center,start:performance.now()};
  else {camera.position.copy(position);controls.target.copy(center);controls.update();}
}
function animate(now) {
 if(!activeViewport || document.hidden || now-lastRender<33)return;
 controls.update();if(!renderDirty && !resetTween)return;renderDirty=false;lastRender=now;
  if (resetTween) {
    const t=Math.min(1,(now-resetTween.start)/650),s=1-Math.pow(1-t,3);
    camera.position.lerpVectors(resetTween.from,resetTween.to,s);controls.target.lerpVectors(resetTween.targetFrom,resetTween.targetTo,s);
    if(t===1) resetTween=null;
  }
  controls.update();updatePlayback();
  const w=viewport.clientWidth,h=viewport.clientHeight;
  renderer.setViewport(0,0,w,h);renderer.setScissorTest(false);
  if(compareScan && scanGroup && sceneGroup){
    // Two scissored passes share one camera and the original world coordinates.
    // Complete surfaces are shown so camera-reveal masking cannot resemble missing geometry.
    revealUniforms.uRevealEnabled.value=0;
    renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,-1,0),-.01)];
    const split=Math.round(w*scanSplit), wasMarker=cameraMarker?.visible, wasPath=trajectoryLine?.visible;
    if(cameraMarker)cameraMarker.visible=false;if(trajectoryLine)trajectoryLine.visible=false;
    renderer.setScissorTest(true);
    sceneGroup.visible=true;scanGroup.visible=false;renderer.setScissor(0,0,split,h);renderer.render(scene,camera);
    sceneGroup.visible=false;scanGroup.visible=true;renderer.setScissor(split,0,w-split,h);renderer.render(scene,camera);
    sceneGroup.visible=true;scanGroup.visible=false;renderer.setScissorTest(false);renderer.clippingPlanes=[];
    if(cameraMarker)cameraMarker.visible=wasMarker;if(trajectoryLine)trajectoryLine.visible=wasPath;
  }else if(representation==='camera' && trackedCamera){
    renderer.clear();const ratio=4/3,rw=Math.min(w,h*ratio),rh=rw/ratio;
    renderer.setViewport((w-rw)/2,(h-rh)/2,rw,rh);renderer.setScissor((w-rw)/2,(h-rh)/2,rw,rh);renderer.setScissorTest(true);renderer.render(scene,trackedCamera);renderer.setScissorTest(false);
  }else renderer.render(scene,camera);
}
async function selectCondition(id) {
  current=config.conditions.find(c=>c.id===id) ?? current;
  const ticket=++loadId;
  document.querySelectorAll('[data-condition]').forEach(b=>{const active=b.dataset.condition===current.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  const model=currentModel;
  const sceneKey=`${model.id}_${current.id}`;
  const sceneUrl=model.id==='terra'?current.scene:`assets/scene_${sceneKey}_occluded.json`;
  document.querySelectorAll('[data-model]').forEach(b=>{const active=b.dataset.model===model.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  $('#condition-caption').textContent=`${model.label} · ${current.subtitle}`;
  $('#model-kind').textContent=model.fullName;
  video.pause();
  // No hidden render-image downloads in embedded mode.
  $('#loading').hidden=false;$('#loading').classList.remove('error');$('#load-message').textContent='Opening saved reconstruction…';
  try {
    const data=await getData(sceneUrl);
    if(ticket!==loadId) return;
    let group=loadedScenes.get(sceneKey);
    if(!group){group=geometryGroup(data);group.userData.sourceUrl=sceneUrl;loadedScenes.set(sceneKey,group);}
    // Keep two comparisons warm without retaining six large surface buffers.
    loadedScenes.delete(sceneKey);loadedScenes.set(sceneKey,group);
    while(loadedScenes.size>1){const oldest=loadedScenes.keys().next().value,stale=loadedScenes.get(oldest);world.remove(stale);stale.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});cache.delete(stale.userData.sourceUrl);loadedScenes.delete(oldest);}
    if(sceneGroup)world.remove(sceneGroup);
    sceneGroup=group;world.add(group);world.updateMatrixWorld(true);attachReveal(group);
    // Retain original coordinates for reference overlays; only the camera is re-framed.
    let box;
    if(data.referenceBounds){
      const [lo,hi]=data.referenceBounds;box=new THREE.Box3();
      for(const x of [lo[0],hi[0]]) for(const y of [lo[1],hi[1]]) for(const z of [lo[2],hi[2]]) {
        const p=new THREE.Vector3(x,y,z);if((data.upAxis??'Z').toUpperCase()==='Z')p.applyAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);box.expandByPoint(p);
      }
    }else box=new THREE.Box3().setFromObject(group);
    if(box.isEmpty())throw new Error('The saved scene contains no visible geometry.');
    const firstScene=!fitBox;
    fitBox=box;
    if(firstScene)resetView(false);
    $('#loading').hidden=true;renderDirty=true;parent.postMessage({type:'scene-loaded',model:currentModel.id,condition:current.id},location.origin);
  } catch(error) {
    if(ticket!==loadId)return;
    console.error(error);$('#loading').classList.add('error');$('#load-message').textContent='Scene could not load. Reload to retry.';parent.postMessage({type:'scene-failed',model:currentModel.id},location.origin);
  }
}
function selectView(view) {
  representation=view;
  document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  $('#viewport').hidden=view==='appearance';$('#appearance').hidden=view!=='appearance';
  $('#reset-view').hidden=view!=='spatial';$('#scan-control').hidden=view==='appearance';$('#points-control').hidden=view==='appearance';
  $('#view-tag').hidden=view!=='spatial';
  $('#scene-instructions').textContent=view==='spatial'?'Drag to orbit · Scroll to zoom':view==='camera'?'Recorded camera · synchronized':'Saved render · frame 327'; controls.enabled=view==='spatial'; if(cameraMarker)cameraMarker.visible=view==='spatial'; if(trajectoryLine)trajectoryLine.visible=view==='spatial'; if(view==='camera')updatePlayback();
  if(view==='appearance')$('#loading').hidden=true;
  else resize();
}
$('#appearance').addEventListener('error',()=>{if(representation==='appearance'){$('#loading').hidden=false;$('#load-message').textContent='Saved render unavailable.';$('#loading').classList.add('error');}});
$('#appearance').addEventListener('load',()=>{if(representation==='appearance')$('#loading').hidden=true;});
$('#reset-view').addEventListener('click',()=>resetView());
document.querySelectorAll('[data-model]').forEach(b=>b.addEventListener('click',()=>{currentModel=config.models.find(m=>m.id===b.dataset.model);selectCondition(current.id);}));
document.querySelectorAll('[data-condition]').forEach(b=>b.addEventListener('click',()=>selectCondition(b.dataset.condition)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
$('#scan-toggle').addEventListener('change',async e=>{
  if(!config.scan)return;
  const desired=e.target.checked;
  if(!scanGroup && desired){try {scanGroup=geometryGroup(await getData(config.scan),true);scanGroup.visible=false;world.add(scanGroup);}catch(error){console.error(error);e.target.checked=false;$('#asset-note').textContent='The reference scan could not be loaded.';parent.postMessage({type:'scan-failed'},location.origin);return;}}
  compareScan=e.target.checked;camera.zoom=compareScan?1.15:1;camera.updateProjectionMatrix();revealUniforms.uRevealEnabled.value=compareScan?0:(revealRequested?1:0);
  $('#scan-wipe').hidden=!compareScan;
  if(scanGroup)scanGroup.visible=false;renderDirty=true;
});

try {initialize3D();selectCondition(current.id);initializePlayback().catch(err=>{console.error(err);$('#asset-note').textContent='Camera trajectory could not load.';});} catch(error){console.error(error);$('#loading').classList.add('error');$('#load-message').textContent='3D rendering is unavailable in this browser. You can still inspect the saved render.';}


// The input clock drives a measured camera, never a fabricated build timeline.
async function initializePlayback(){
 const data=await getData(config.cameraTrajectory);
 const basis=new THREE.Matrix4().makeRotationX(-Math.PI/2);
 trajectory=data.frames.map(f=>{
  const m=new THREE.Matrix4().fromArray(f.matrix_world.flat()).transpose().premultiply(basis);
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();m.decompose(position,quaternion,scale);
  return {time:f.time_s,position,quaternion};
 });
 trackedCamera=new THREE.PerspectiveCamera();trackedCamera.near=.03;trackedCamera.far=100;
 // Off-centre calibrated pinhole projection. Letterboxing is handled in renderCamera.
 const k=data.intrinsics;trackedCamera.userData.intrinsics=k;
 const dot=new THREE.Mesh(new THREE.SphereGeometry(.075,16,12),new THREE.MeshBasicMaterial({color:'#b84c2e',depthTest:false}));
 cameraMarker=new THREE.Group();cameraMarker.add(dot);
 const corners=[[-.24,-.18,-.5],[.24,-.18,-.5],[.24,.18,-.5],[-.24,.18,-.5]],v=[];
 for(let i=0;i<4;i++){v.push(0,0,0,...corners[i],...corners[i],...corners[(i+1)%4]);}
 const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(v,3)),new THREE.LineBasicMaterial({color:'#b84c2e',depthTest:false,transparent:true,opacity:.9}));cameraMarker.add(lines);cameraMarker.renderOrder=100;scene.add(cameraMarker);
 const path=new THREE.BufferGeometry().setFromPoints(trajectory.map(f=>f.position));trajectoryLine=new THREE.Line(path,new THREE.LineBasicMaterial({color:'#b84c2e',transparent:true,opacity:.3,depthTest:false}));scene.add(trajectoryLine);
 updatePlayback();
}
function updatePlayback(){
 if(!trajectory || !trackedCamera)return;
 const t=externalTime;revealUniforms.uRevealTime.value=t;
 $('#video-seek').value=t;$('#video-time').textContent=`${clock(t)} / ${clock(video.duration || 54.87)}`;
 const valid=t>=trajectory[0].time && t<=trajectory.at(-1).time;
 cameraMarker.visible=valid && representation==='spatial';
 let i=trajectory.findIndex(f=>f.time>=t);if(i<0)i=trajectory.length-1;
 if(trajectoryLine)trajectoryLine.geometry.setDrawRange(0,i+1);
 const b=trajectory[i],a=trajectory[Math.max(0,i-1)],alpha=b.time===a.time?0:THREE.MathUtils.clamp((t-a.time)/(b.time-a.time),0,1);
 trackedCamera.position.lerpVectors(a.position,b.position,alpha);trackedCamera.quaternion.slerpQuaternions(a.quaternion,b.quaternion,alpha);trackedCamera.updateMatrixWorld();
 cameraMarker.position.copy(trackedCamera.position);cameraMarker.quaternion.copy(trackedCamera.quaternion);
 const k=trackedCamera.userData.intrinsics,n=trackedCamera.near;
 // Preserve calibrated image framing; wide viewports reveal additional horizontal space.
 const aspect=k.width/k.height, original=k.width/k.height;
 let left=-k.cx*n/k.fx,right=(k.width-k.cx)*n/k.fx,top=k.cy*n/k.fy,bottom=-(k.height-k.cy)*n/k.fy;
 if(aspect>original){const mid=(left+right)/2,half=(right-left)/2*aspect/original;left=mid-half;right=mid+half;}else{const mid=(top+bottom)/2,half=(top-bottom)/2*original/aspect;top=mid+half;bottom=mid-half;}
 trackedCamera.projectionMatrix.makePerspective(left,right,top,bottom,n,trackedCamera.far);trackedCamera.projectionMatrixInverse.copy(trackedCamera.projectionMatrix).invert();
 if(representation==='camera')$('#scene-instructions').textContent=valid?'Recorded camera · synchronized':'Camera tracking unavailable at this time';
}
function clock(s){if(!Number.isFinite(s))return '00:00';return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;}
function startAtExample(){ $('#video-seek').max=video.duration; video.currentTime=0; }
video.addEventListener('loadedmetadata',startAtExample);
if(video.readyState>=1)startAtExample();
video.addEventListener('play',()=>{$('#play-video').textContent='Ⅱ Pause';$('#play-video').setAttribute('aria-label','Pause video');});
video.addEventListener('pause',()=>{$('#play-video').textContent='▶ Play';$('#play-video').setAttribute('aria-label','Play video');});
$('#play-video').addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{$('#asset-note').textContent='Playback could not start. Try again.';});else video.pause();});
$('#video-seek').addEventListener('input',e=>{video.currentTime=Number(e.target.value);updatePlayback();});
$('#playback-rate').addEventListener('change',e=>video.playbackRate=Number(e.target.value));
$('#points-toggle').addEventListener('change',async e=>{
 if(!pointsGroup){try{const data=await getData(config.points);pointsGroup=geometryGroup(data,true);pointsGroup.children.forEach(o=>o.material.color.set('#397b80'));world.add(pointsGroup);}catch(err){e.target.checked=false;return;}}
 pointsGroup.visible=e.target.checked;
});

export {geometryGroup};


// Surface-patch first visibility is precomputed with camera calibration and occlusion rays.
function attachReveal(group){group.traverse(o=>{
 if(!o.isMesh||o.userData.hasReveal||!o.geometry.getAttribute('revealBirth'))return;o.userData.hasReveal=true;
 o.material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,revealUniforms);
  shader.vertexShader='attribute float revealBirth; varying float vBirth;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBirth=revealBirth;');
  shader.fragmentShader='uniform float uRevealTime; uniform float uRevealEnabled; varying float vBirth;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(uRevealEnabled>0.5 && vBirth>uRevealTime) discard;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
   if(uRevealEnabled>0.5){float edge=1.0-smoothstep(0.0,0.35,uRevealTime-vBirth);gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(0.84,0.47,0.23),edge*0.25);}
  `);
 };o.material.customProgramCacheKey=()=> 'occlusion-reveal-v2';o.material.needsUpdate=true;
});}
$('#live-reveal').addEventListener('change',e=>{revealUniforms.uRevealEnabled.value=e.target.checked?1:0;});
$('#restart-build').addEventListener('click',()=>{video.currentTime=0;$('#live-reveal').checked=true;revealUniforms.uRevealEnabled.value=1;selectView('spatial');resetView(false);video.play().catch(()=>{});});

window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent)return;const d=e.data;renderDirty=true;if(d.type==='visibility'){activeViewport=d.value;}if(d.type==='clock'){externalTime=d.time;updatePlayback();}if(d.type==='condition')selectCondition(d.value);if(d.type==='reveal'){revealRequested=d.value;revealUniforms.uRevealEnabled.value=compareScan?0:(d.value?1:0);}if(d.type==='scan-split'){scanSplit=Math.max(0,Math.min(1,d.value));$('#scan-wipe').style.setProperty('--split',scanSplit*100+'%');$('#scan-wipe').classList.toggle('all-scan',scanSplit===0);$('#scan-wipe').classList.toggle('all-scene',scanSplit===1);}if(d.type==='scan'){const c=$('#scan-toggle');c.checked=d.value;c.dispatchEvent(new Event('change'));}if(d.type==='reset')resetView(false);});
parent.postMessage({type:'viewer-ready',model:currentModel.id},location.origin);
