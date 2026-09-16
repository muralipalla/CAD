(function () {
  "use strict";
  window.CoonsThree = function (canvas, fallback, onSelect = () => {}) {
    const THREE = window.THREE;
    let renderer;
    try { if (!THREE) throw new Error(); renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); }
    catch { fallback.hidden = false; canvas.hidden = true; return { available:false, update(){}, reset(){}, zoom(){}, dispose(){}, pngBlob(){ return Promise.reject(new Error("PNG export requires WebGL.")); } }; }
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x171541);
    const camera = new THREE.PerspectiveCamera(40,1,.1,200); camera.up.set(0,0,1);
    const target = new THREE.Vector3(5,5,0); let azimuth=-.9,elevation=.62,radius=23,content=new THREE.Group(),handles=[];
    const raycaster = new THREE.Raycaster(); scene.add(content);
    scene.add(new THREE.AmbientLight(0xffffff,1.25));
    const light = new THREE.DirectionalLight(0xffffff,2.2); light.position.set(2,-5,14); scene.add(light);
    const grid = new THREE.GridHelper(10,10,0x767098,0x39345b); grid.rotation.x=Math.PI/2; grid.position.set(5,5,-.01); scene.add(grid);
    function cameraPosition(){ camera.position.set(target.x+radius*Math.cos(elevation)*Math.cos(azimuth),target.y+radius*Math.cos(elevation)*Math.sin(azimuth),target.z+radius*Math.sin(elevation)); camera.lookAt(target); }
    function render(){ cameraPosition(); renderer.render(scene,camera); }
    function release(group){ group.traverse((o)=>{ o.geometry?.dispose(); if(o.material){ const list=Array.isArray(o.material)?o.material:[o.material]; list.forEach((m)=>m.dispose()); } }); }
    function line(points,color,width=1){ const geometry=new THREE.BufferGeometry().setFromPoints(points.map((p)=>new THREE.Vector3(p.x,p.y,p.z))); return new THREE.Line(geometry,new THREE.LineBasicMaterial({color,linewidth:width})); }
    function update(points,selected,options={}){
      scene.remove(content); release(content); content=new THREE.Group(); handles=[]; scene.add(content); grid.visible=options.grid!==false;
      const sampled=CoonsMath.sample(points,48), geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.Float32BufferAttribute(sampled.positions,3)); geometry.setIndex(sampled.indices); geometry.computeVertexNormals();
      content.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x75c4ec,side:THREE.DoubleSide,roughness:.55,metalness:.08,wireframe:!!options.wireframe,transparent:true,opacity:.9})));
      if(options.boundaries!==false){ const colors={C0:0xff9986,C1:0x76dcc1,D0:0xb8a7f5,D1:0xffd166}; const curves=CoonsMath.boundarySamples(points); Object.keys(curves).forEach((name)=>content.add(line(curves[name],colors[name]))); }
      if(options.controls!==false){
        for(const [a,b] of CoonsMath.controlEdges()) content.add(line([points[a],points[b]],0xd8b647));
        points.forEach((p,index)=>{ const sphere=new THREE.Mesh(new THREE.SphereGeometry(index===selected?.18:.12,14,9),new THREE.MeshBasicMaterial({color:index===selected?0xffffff:0xffb26b})); sphere.position.set(p.x,p.y,p.z); sphere.userData.pointIndex=index; handles.push(sphere); content.add(sphere); });
      }
      render();
    }
    function resize(){ const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render(); }
    const observer=new ResizeObserver(resize); observer.observe(canvas); let drag=null,moved=false;
    function pointer(event){ const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)/r.width*2-1,y:-(event.clientY-r.top)/r.height*2+1}; }
    canvas.addEventListener("pointerdown",(e)=>{ if(e.button!==0)return; drag={id:e.pointerId,x:e.clientX,y:e.clientY,azimuth,elevation};moved=false;canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove",(e)=>{ if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>3)moved=true;azimuth=drag.azimuth-dx*.008;elevation=CoonsMath.clamp(drag.elevation+dy*.008,-1.35,1.35);render(); });
    canvas.addEventListener("pointerup",(e)=>{ if(!drag||drag.id!==e.pointerId)return;if(!moved){raycaster.setFromCamera(pointer(e),camera);const hit=raycaster.intersectObjects(handles,false)[0];if(hit)onSelect(hit.object.userData.pointIndex);}drag=null; });
    canvas.addEventListener("wheel",(e)=>{e.preventDefault();radius=CoonsMath.clamp(radius*Math.exp(e.deltaY*.001),10,45);render();},{passive:false});
    canvas.addEventListener("keydown",(e)=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-","Home"].includes(e.key))return;e.preventDefault();if(e.key==="Home"){azimuth=-.9;elevation=.62;radius=23;}else if(e.key==="ArrowLeft")azimuth-=.1;else if(e.key==="ArrowRight")azimuth+=.1;else if(e.key==="ArrowUp")elevation=Math.min(1.35,elevation+.1);else if(e.key==="ArrowDown")elevation=Math.max(-1.35,elevation-.1);else radius=CoonsMath.clamp(radius*(e.key==="-"?1.15:.87),10,45);render();});
    resize();
    return { available:true,update,reset(){azimuth=-.9;elevation=.62;radius=23;render();},zoom(f){radius=CoonsMath.clamp(radius*f,10,45);render();},dispose(){observer.disconnect();release(content);renderer.dispose();},pngBlob(){return new Promise((resolve,reject)=>canvas.toBlob((blob)=>blob?resolve(blob):reject(new Error("The PNG could not be created.")),"image/png"));} };
  };
})();
