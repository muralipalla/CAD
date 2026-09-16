(function(){
  "use strict";
  const M=window.CoonsMath,state=new M.Patch(),$=(name)=>document.querySelector(`[data-${name}]`);
  const canvas=$("editor"),ctx=canvas.getContext("2d");
  const view=new window.CoonsThree($("three"),$("three-fallback"),(index)=>{if(state.select(index))update();});
  let language="python",drag=null,frame=0;
  const colors={C0:"#ff9986",C1:"#76dcc1",D0:"#b8a7f5",D1:"#ffd166"};
  function bounds(){const w=canvas.clientWidth,h=canvas.clientHeight;return {w,h,left:42,right:w-22,top:24,bottom:h-36};}
  function screen(p,b){return{x:b.left+p.x/10*(b.right-b.left),y:b.bottom-p.y/10*(b.bottom-b.top)};}
  function world(p,b){return{x:M.clamp((p.x-b.left)/(b.right-b.left)*10,0,10),y:M.clamp((b.bottom-p.y)/(b.bottom-b.top)*10,0,10)};}
  function draw(){
    const b=bounds();if(!b.w||!b.h)return;const ratio=Math.min(devicePixelRatio||1,2),w=Math.round(b.w*ratio),h=Math.round(b.h*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle="#171541";ctx.fillRect(0,0,b.w,b.h);ctx.font="12px sans-serif";
    for(let n=0;n<=10;n++){const a=screen({x:n,y:0},b),q=screen({x:0,y:n},b);ctx.strokeStyle=n===0?"#9790b7":"#39345b";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,b.top);ctx.lineTo(a.x,b.bottom);ctx.moveTo(b.left,q.y);ctx.lineTo(b.right,q.y);ctx.stroke();if(n%2===0){ctx.fillStyle="#c8c1e3";ctx.textAlign="center";ctx.fillText(n,a.x,b.bottom+19);ctx.textAlign="right";ctx.fillText(n,b.left-10,q.y+4);}}
    const curves=M.boundarySamples(state.points,40);for(const name of Object.keys(curves)){ctx.strokeStyle=colors[name];ctx.lineWidth=3;ctx.beginPath();curves[name].forEach((p,i)=>{const q=screen(p,b);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.stroke();}
    ctx.strokeStyle="#d8b647";ctx.lineWidth=1.2;ctx.setLineDash([5,4]);for(const[a,z]of M.controlEdges()){const p=screen(state.points[a],b),q=screen(state.points[z],b);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}ctx.setLineDash([]);
    state.points.forEach((point,index)=>{const p=screen(point,b);ctx.beginPath();ctx.arc(p.x,p.y,index===state.selected?8:6,0,Math.PI*2);ctx.fillStyle=index<4?"#fff":"#ffb26b";ctx.fill();ctx.lineWidth=index===state.selected?3:1.5;ctx.strokeStyle=index===state.selected?"#ffbe69":"#171541";ctx.stroke();ctx.font="bold 12px sans-serif";ctx.textAlign=p.x>b.right-55?"right":"left";const dx=ctx.textAlign==="right"?-10:10;ctx.strokeStyle="#171541";ctx.lineWidth=4;ctx.strokeText(M.LABELS[index],p.x+dx,p.y-9);ctx.fillStyle="#fff";ctx.fillText(M.LABELS[index],p.x+dx,p.y-9);});
  }
  function graphics(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;draw();view.update(state.points,state.selected,{boundaries:$("boundaries").checked,controls:$("controls").checked,grid:$("grid").checked,wireframe:$("wireframe").checked});});}
  function updateCode(){$("code").textContent=window.CoonsCode[language](state.points);$("filename").textContent=language==="python"?"coons_patch.py":"coons_patch.m";document.querySelectorAll("[data-language]").forEach((b)=>b.setAttribute("aria-pressed",String(b.dataset.language===language)));}
  function update(){const p=state.points[state.selected],label=M.LABELS[state.selected];$("prompt").textContent=`Selected ${label} · drag in x–y, then adjust z.`;$("x").value=p.x.toFixed(2);$("y").value=p.y.toFixed(2);$("z-coordinate").value=p.z.toFixed(2);$("z").value=p.z;$("height-output").textContent=p.z.toFixed(2);$("height-label").textContent=`Height z · ${label}`;updateCode();graphics();}
  for(const axis of["x","y","z"]){const input=$(axis==="z"?"z-coordinate":axis);input.addEventListener("change",()=>{if(Number.isFinite(input.valueAsNumber))state.edit(axis,input.valueAsNumber);update();});}
  $("z").addEventListener("input",()=>{state.edit("z",Number($("z").value));update();});
  $("reset-patch").addEventListener("click",()=>{state.reset();update();canvas.focus({preventScroll:true});});
  function eventPoint(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  canvas.addEventListener("pointerdown",(e)=>{if(e.button!==0)return;const b=bounds(),p=eventPoint(e);let hit=-1,distance=14;state.points.forEach((point,i)=>{const q=screen(point,b),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<distance){hit=i;distance=d;}});if(hit<0)return;state.select(hit);const q=screen(state.points[hit],b);drag={id:e.pointerId,dx:p.x-q.x,dy:p.y-q.y};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});update();});
  canvas.addEventListener("pointermove",(e)=>{if(!drag||drag.id!==e.pointerId)return;const p=eventPoint(e),q=world({x:p.x-drag.dx,y:p.y-drag.dy},bounds());state.edit("x",q.x);state.edit("y",q.y);update();});
  function stop(e){if(drag?.id===e.pointerId)drag=null;}canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",stop);
  canvas.addEventListener("keydown",(e)=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","[","]","Enter"].includes(e.key))return;e.preventDefault();if(e.key==="["){state.select((state.selected+11)%12);}else if(e.key==="]"){state.select((state.selected+1)%12);}else if(e.key==="Enter"){$("z").focus({preventScroll:true});return;}else{const axis=["ArrowLeft","ArrowRight"].includes(e.key)?"x":"y",change=(["ArrowLeft","ArrowDown"].includes(e.key)?-1:1)*(e.shiftKey?.5:.1);state.edit(axis,state.points[state.selected][axis]+change);}update();});
  for(const name of["boundaries","controls","grid","wireframe"])$(name).addEventListener("change",graphics);
  $("reset-view").addEventListener("click",()=>view.reset());$("zoom-in").addEventListener("click",()=>view.zoom(.85));$("zoom-out").addEventListener("click",()=>view.zoom(1.18));
  $("download-png").disabled=!view.available;$("download-png").addEventListener("click",async()=>{try{const blob=await view.pngBlob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="coons-patch.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$("download-status").textContent="PNG download started.";}catch(error){$("download-status").textContent=error.message;}});
  document.querySelectorAll("[data-language]").forEach((b)=>b.addEventListener("click",()=>{language=b.dataset.language;updateCode();}));
  $("copy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("code").textContent);$("copy-status").textContent="Code copied.";}catch{$("copy-status").textContent="Select the code and use your device's Copy command.";}});
  const observer=new ResizeObserver(draw);observer.observe(canvas);window.addEventListener("pagehide",()=>{observer.disconnect();view.dispose();});update();
})();
