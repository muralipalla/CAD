(function(root){
  'use strict';
  const M=root.AxisRotation, scale=(v,s)=>v.map(x=>x*s);
  const PALETTE={l:'#ff7f66',m:'#20e3b2',n:'#61a8ff',active:'#ffd447',body:'#ff884d',ghost:'#aebed4'};
  function create(canvas,onCamera){
    const ctx=canvas.getContext('2d');
    const theme=getComputedStyle(canvas),fontFamily=theme.fontFamily;
    const sceneTop=theme.getPropertyValue('--rotation-scene-top').trim(),sceneBottom=theme.getPropertyValue('--rotation-scene-bottom').trim();
    let state=null,camera={yaw:-0.9,pitch:0.46,zoom:1},drag=null,pending=false;
    const home=()=>{camera={yaw:-0.9,pitch:0.46,zoom:1};request();onCamera({...camera});};
    function request(){if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;draw();});}}
    function draw(){
      if(!ctx||!state||!canvas.clientWidth)return;
      const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(root.devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const backdrop=ctx.createLinearGradient(0,0,0,h);backdrop.addColorStop(0,sceneTop);backdrop.addColorStop(1,sceneBottom);ctx.fillStyle=backdrop;ctx.fillRect(0,0,w,h);
      const {yaw,pitch,zoom}=camera,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),k=Math.min(w,h)*.215*zoom;
      const project=v=>{const side=-sy*v[0]+cy*v[1],depth=cy*v[0]+sy*v[1];return [w/2+side*k,h*.52-(cp*v[2]-sp*depth)*k,cp*depth+sp*v[2]];};
      function line(points,color,width=1,dashed=false,alpha=1){if(points.length<2)return;ctx.beginPath();points.forEach((v,i)=>{const p=project(v);if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.globalAlpha=alpha;ctx.setLineDash(dashed?[4,5]:[]);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;}
      for(let i=-4;i<=4;i++){const j=i*.5;line([[-2,j,-.92],[2,j,-.92]],'rgba(238,234,248,.12)',1);line([[j,-2,-.92],[j,2,-.92]],'rgba(238,234,248,.12)',1);}
      const labels=[];
      function arrow(v,name,color,width=2,alpha=1,dash=false){
        line([[0,0,0],v],color,width,dash,alpha);const p=project(v),o=project([0,0,0]),dx=p[0]-o[0],dy=p[1]-o[1],length=Math.hypot(dx,dy);
        if(length>9){const ux=dx/length,uy=dy/length;ctx.beginPath();ctx.moveTo(...p.slice(0,2));ctx.lineTo(p[0]-ux*9-uy*4,p[1]-uy*9+ux*4);ctx.lineTo(p[0]-ux*9+uy*4,p[1]-uy*9-ux*4);ctx.closePath();ctx.fillStyle=color;ctx.globalAlpha=alpha;ctx.fill();ctx.globalAlpha=1;}
        if(name)labels.push({p,name,color,alpha});
      }
      function body(matrix){
        const turn=v=>M.apply(matrix,v),sides=12,ring=(z,r)=>Array.from({length:sides},(_,i)=>{const a=2*Math.PI*i/sides;return turn([r*Math.cos(a),r*Math.sin(a),z]);});
        const rings=[ring(-.42,.34),ring(-.28,.58),ring(.22,.62),ring(.48,.38)],polygons=[];
        for(let level=0;level<rings.length-1;level++)for(let i=0;i<sides;i++)polygons.push({points:[rings[level][i],rings[level][(i+1)%sides],rings[level+1][(i+1)%sides],rings[level+1][i]],fill:['#b93f24','#ef6d35','#ff9654'][level]});
        polygons.push({points:rings[0],fill:'#91311f'},{points:rings[3],fill:'#ffc06e'});
        const spout=[[
          [.43,-.22,.02],[.43,.22,.02],[.58,.18,.33],[.58,-.18,.33]
        ],[
          [.58,-.18,.33],[.58,.18,.33],[1.18,.11,.66],[1.18,-.11,.66]
        ],[
          [.43,-.22,.02],[.58,-.18,.33],[1.18,-.11,.66],[1.08,-.13,.51]
        ],[
          [.43,.22,.02],[1.08,.13,.51],[1.18,.11,.66],[.58,.18,.33]
        ]].map(points=>({points:points.map(turn),fill:'#ff9c58'}));
        const handle=[[-.45,0,.15],[-.78,0,.42],[-.92,0,.84],[-.7,0,1.05],[-.4,0,.72]].map(turn);
        line(handle,'#5a251d',13,false,1);line(handle,'#ffd09b',7,false,1);
        [...polygons,...spout].map(shape=>({...shape,z:shape.points.reduce((sum,v)=>sum+project(v)[2],0)/shape.points.length})).sort((a,b)=>a.z-b.z).forEach(shape=>{
          ctx.beginPath();shape.points.forEach((v,i)=>{const p=project(v);if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.closePath();ctx.fillStyle=shape.fill;ctx.fill();ctx.strokeStyle='#4f211d';ctx.lineWidth=1.15;ctx.stroke();
        });
        const lid=ring(.56,.3);ctx.beginPath();lid.forEach((v,i)=>{const p=project(v);if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.closePath();ctx.fillStyle='#ffd27c';ctx.fill();ctx.strokeStyle='#5a251d';ctx.lineWidth=1.3;ctx.stroke();
        const knob=[turn([0,0,.57]),turn([0,0,.76])];line(knob,'#5a251d',11,false,1);line(knob,'#ffe0a8',6,false,1);
      }
      if(state.body)body(state.orientation);
      const all=state.axes||[];
      all.filter(a=>a.ghost&&a.label).forEach(a=>arrow(scale(a.vector,a.length||1.65),a.label,a.color,a.emphasized?3.2:2.4,1));
      if(state.active)line([[0,0,0],scale(state.active,1.65)],PALETTE.active,6,false,.48);
      all.filter(a=>!a.ghost).forEach(a=>arrow(scale(a.vector,a.length||1.65),a.label,a.color,3));
      const o=project([0,0,0]);ctx.beginPath();ctx.arc(o[0],o[1],3,0,2*Math.PI);ctx.fillStyle='#edf2fa';ctx.fill();
      const placed=[];ctx.font='750 14px '+fontFamily;ctx.textBaseline='middle';
      labels.sort((a,b)=>b.alpha-a.alpha).forEach(({p,name,color,alpha})=>{
        const tw=ctx.measureText(name).width+10,th=22,candidates=[[8,-19],[8,4],[-tw-8,-19],[-tw-8,4],[8,-42],[-tw/2,22]];
        let best=null;
        candidates.forEach(([dx,dy])=>{const x=M.clamp(p[0]+dx,5,w-tw-5),y=M.clamp(p[1]+dy,5,h-th-5),overlap=placed.reduce((s,q)=>s+Math.max(0,Math.min(x+tw,q.x+q.w)-Math.max(x,q.x))*Math.max(0,Math.min(y+th,q.y+q.h)-Math.max(y,q.y)),0);if(!best||overlap<best.score)best={x,y,w:tw,h:th,score:overlap};});
        placed.push(best);ctx.globalAlpha=alpha;ctx.fillStyle=sceneTop;ctx.fillRect(best.x,best.y,tw,th);ctx.fillStyle=color;ctx.fillText(name,best.x+5,best.y+th/2);ctx.globalAlpha=1;
      });
      // Small world-coordinate compass, independent of the body axes.
      const corner=[w-40,h-34];['X','Y','Z'].forEach((name,i)=>{const v=[0,0,0];v[i]=.32;const p=project(v),dx=p[0]-o[0],dy=p[1]-o[1];ctx.strokeStyle='#74849e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...corner);ctx.lineTo(corner[0]+dx,corner[1]+dy);ctx.stroke();ctx.fillStyle='#a6b4ca';ctx.font='11px '+fontFamily;ctx.fillText(name,corner[0]+dx,corner[1]+dy-5);});
    }
    canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;camera.yaw-=(e.clientX-drag.x)*.008;camera.pitch=M.clamp(camera.pitch+(e.clientY-drag.y)*.008,-1.35,1.35);drag.x=e.clientX;drag.y=e.clientY;request();onCamera({...camera});});
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>{drag=null;}));
    canvas.addEventListener('keydown',e=>{const key=e.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(key))return;e.preventDefault();if(key==='Home'){home();return;}if(key==='ArrowLeft')camera.yaw-=.12;if(key==='ArrowRight')camera.yaw+=.12;if(key==='ArrowUp')camera.pitch+=.1;if(key==='ArrowDown')camera.pitch-=.1;if(key==='+'||key==='=')camera.zoom*=1.1;if(key==='-')camera.zoom/=1.1;camera.pitch=M.clamp(camera.pitch,-1.35,1.35);camera.zoom=M.clamp(camera.zoom,.65,1.65);request();onCamera({...camera});});
    new ResizeObserver(request).observe(canvas);
    return {set:s=>{state=s;request();},setCamera:c=>{camera={...c};request();},home};
  }
  root.AxisRotationView={create,PALETTE};
})(globalThis);
