(function(){
  'use strict';
  const M=window.AxisRotation,V=window.AxisRotationView,C=V.PALETTE,$=id=>document.getElementById(id);
  const defaults=[{axes:[[2,-1,1],[1,2,3]],angles:[70,50]},{axes:[[1,.3,.2],[.2,1,.4],[.4,-.2,1]],angles:[55,40,65]},{axes:[[1,0,0],[0,1,0],[0,0,1]],angles:[60,45,30]}];
  const fresh=i=>({axes:defaults[i].axes.map(v=>v.slice()),angles:defaults[i].angles.slice(),progress:3,preset:'arbitrary',order:'XYZ',mode:'reverse'});
  const data=[fresh(0),fresh(1),fresh(2)];let chapter=0,playing=false,frame=0,last=0;
  const basis={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]},titles=['Rotate the axis, keep the angle','Each attached direction moves with the body','Reverse the order. Keep each angle with its axis.'];
  let left,right;
  left=V.create($('left-view'),c=>right?.setCamera(c));right=V.create($('right-view'),c=>left?.setCamera(c));
  const labels=()=>chapter===0?['m','n']:chapter===1?['ℓ','m','n']:data[2].order.split('');
  const axisColors=()=>chapter===0?[C.m,C.n]:chapter===1?[C.l,C.m,C.n]:data[2].order.split('').map(a=>({X:C.l,Y:C.m,Z:C.n})[a]);
  const format=x=>Math.abs(x)<.0005?'0.000':x.toFixed(3),vec=v=>'('+v.map(format).join(', ')+')';
  const errorText=v=>v<1e-12?'< 10⁻¹²':v.toExponential(3);
  function stop(){playing=false;cancelAnimationFrame(frame);$('result').setAttribute('aria-live','polite');$('play').textContent=chapter===0?'▶ Compare the paths':'▶ Play rotations';}
  function getAxes(){return chapter===2?data[2].order.split('').map(a=>basis[a]):data[chapter].axes.map(M.unit);}
  function renderControls(){
    const d=data[chapter],names=labels(),colors=axisColors();
    $('axis-controls').innerHTML=names.map((name,i)=>`<section class="axis-control"><div class="axis-top"><i class="axis-dot" style="background:${colors[i]}"></i><span>${chapter===0?'Axis':'Direction'} ${name}</span></div>${chapter!==2?`<div class="components">${['x','y','z'].map((a,j)=>`<label>${a}<input type="number" step="any" value="${d.axes[i][j]}" data-component="${i},${j}" aria-label="${name} direction ${a} component"></label>`).join('')}</div><output class="normalized" data-unit="${i}"></output>`:''}<div class="angle-control"><label class="angle-label" for="angle-${i}"><span>θ${name} (degrees)</span><input id="angle-${i}" type="number" min="-180" max="180" step="any" value="${d.angles[i]}" data-angle="${i}"></label><input type="range" min="-180" max="180" step="1" value="${d.angles[i]}" data-slider="${i}" aria-label="Angle about ${name} in degrees"></div></section>`).join('');
    function updateInputs(){
      let error='',nextAxes=d.axes.map(v=>v.slice());
      if(chapter!==2)names.forEach((name,i)=>{const inputs=[...$('axis-controls').querySelectorAll(`[data-component^="${i},"]`)];const v=inputs.map(el=>el.value.trim()===''?NaN:el.valueAsNumber);let message='';try{M.unit(v);nextAxes[i]=v;}catch(e){message=`Axis ${name}: ${e.message}`;error ||= message;}inputs.forEach(el=>el.setCustomValidity(message));});
      const nextAngles=names.map((_,i)=>{const input=$('axis-controls').querySelector(`[data-angle="${i}"]`),v=input.valueAsNumber;const message=!Number.isFinite(v)||v < -180||v > 180?'Enter an angle between −180° and 180°.':'';input.setCustomValidity(message);error ||= message;return v;});
      $('input-error').hidden=!error;$('input-error').textContent=error?error+' The scenes retain the last valid settings.':'';
      if(!error){d.axes=nextAxes;d.angles=nextAngles;names.forEach((_,i)=>$('axis-controls').querySelector(`[data-slider="${i}"]`).value=d.angles[i]);render();}
    }
    $('axis-controls').querySelectorAll('[data-component]').forEach(input=>input.addEventListener('input',()=>{stop();d.preset='custom';$('axis-preset').value='custom';updateInputs();}));
    $('axis-controls').querySelectorAll('[data-angle],[data-slider]').forEach(input=>input.addEventListener('input',()=>{stop();if(input.dataset.slider!==undefined)$('axis-controls').querySelector(`[data-angle="${input.dataset.slider}"]`).value=input.value;updateInputs();}));
    $('preset-label').hidden=chapter===2;$('order-label').hidden=chapter!==2;$('axis-order').value=d.order;$('axis-preset').value=d.preset;
    $('comparison-control').hidden=chapter!==2;$('normalize-note').hidden=chapter===2;
    document.querySelectorAll('[name=comparison]').forEach(el=>el.checked=el.value===d.mode);
    $('input-error').hidden=true;
  }
  function matrixHTML(a){return '<div class="matrix" role="table" aria-label="Three by three rotation matrix">'+a.map((x,i)=>`<span role="cell" aria-label="Row ${Math.floor(i/3)+1}, column ${i%3+1}: ${format(x)}">${format(x)}</span>`).join('')+'</div>';}
  function setChapter(index,scroll=false){
    stop();chapter=M.clamp(index,0,2);renderControls();
    document.querySelectorAll('[data-chapter]').forEach(el=>{if(+el.dataset.chapter===chapter)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
    $('chapter-title').textContent=titles[chapter];$('chapter-number').textContent=['PART 01 / THE BUILDING BLOCK','PART 02 / CONCATENATE THE ROTATIONS','PART 03 / COORDINATE AXES'][chapter];
    $('chapter-description').textContent=['Choose any nonzero m and n. Rotating m about n gives m′. A rotation through θₘ about m′ is the conjugate of the original rotation about m.','Attach three directions ℓ, m, n to one rigid body. Follow the moved axes ℓ → m′ → n″, then compare with rotations about the fixed directions in reverse order.','With the body axes initially aligned with X, Y, Z, intrinsic X → Y′ → Z″ reaches the same final orientation as extrinsic Z → Y → X.'][chapter];
    $('hero-equation').innerHTML=chapter===0?'R<sub>m′</sub> = R<sub>n</sub> R<sub>m</sub> R<sub>n</sub><sup>T</sup>':'A<sub>3</sub> = R<sub>ℓ</sub> R<sub>m</sub> R<sub>n</sub>';
    $('try-note').innerHTML=['<strong>Try this</strong><p>Choose perpendicular directions and set θₙ = 90°. The axis m = X becomes m′ = Y.</p>','<strong>Watch the next axis</strong><p>At each step, the gold line is the rotation axis. The other attached directions move with the body.</p>','<strong>Try the same order</strong><p>Keep the angles and switch to “Same axis–angle order.” The final orientations generally stop matching.</p>'][chapter];
    $('left-title').textContent=chapter===0?'Direct rotation':'Intrinsic';$('right-title').textContent=chapter===0?'Undo → rotate → restore':'Extrinsic';
    $('left-subtitle').textContent=chapter===0?'About the moved axis m′':'Moving body directions';$('right-subtitle').textContent=chapter===0?'The same map in three operations':'Original fixed directions';
    const cameraHelp=' in three dimensions. Drag to orbit. Arrow keys rotate the view. Plus and minus zoom; Home resets the camera.';
    $('left-view').setAttribute('aria-label',(chapter===0?'Direct rotation about the moved axis':'Intrinsic rotation about moving body directions')+cameraHelp);
    $('right-view').setAttribute('aria-label',(chapter===0?'Conjugated rotation through undo, rotate, restore':'Extrinsic rotation about fixed original directions')+cameraHelp);
    for(let i=0;i<3;i++)$('proof-'+i).hidden=i!==chapter;
    $('previous-chapter').disabled=chapter===0;$('next-chapter').hidden=chapter===2;$('next-chapter').textContent=chapter===0?'Three attached directions →':'The X, Y, Z case →';$('lesson-position').textContent=`Part ${chapter+1} of 3`;
    $('play').textContent=chapter===0?'▶ Compare the paths':'▶ Play rotations';
    const steps=chapter===0?['Start','B1 · Undo Rₙ','B2 · Rotate Rₘ','B3 · Restore Rₙ']:['Start',...labels().map((n,i)=>`${i+1} · ${n}${i===1?'′':i===2?'″':''}`)];
    $('step-buttons').innerHTML=steps.map((s,i)=>`<button type="button" class="mini-button" data-step="${i}" aria-pressed="false">${s}</button>`).join('');
    $('step-buttons').querySelectorAll('button').forEach(el=>el.addEventListener('click',()=>{stop();data[chapter].progress=+el.dataset.step;render();}));
    render();if(scroll)$('chapter-title').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }
  function render(){
    const d=data[chapter],a=getAxes(),names=labels(),colors=axisColors(),p=d.progress,step=Math.min(2,Math.floor(Math.max(0,p-1e-8)));let A,B,finalA,finalB,la,ra,activeA,activeB,captions,readouts,pathA,pathB;
    if(chapter===0){
      const [m,n]=a,[tm,tn]=d.angles,rn=M.rot(n,tn),rm=M.rot(m,tm),mp=M.apply(rn,m),directProgress=M.clamp(p,0,1);
      finalA=M.rot(mp,tm);finalB=M.conjugate(rn,rm);A=M.rot(mp,tm*directProgress);B=M.conjugationPath(n,m,tn,tm,p);
      la=[{vector:n,label:'n',color:C.n},{vector:m,label:'m',color:C.m},{vector:mp,label:'m′',color:C.active}];
      ra=[{vector:n,label:'n',color:C.n},{vector:m,label:'m',color:C.m},{vector:M.apply(B,mp),label:p===0||p===3?'m′':p>=1&&p<=2?'m':'m′(t)',color:C.active}];
      activeA=p>0?mp:null;activeB=p>0?(step===1?m:n):null;
      captions=[p===0?'Start · m, n, m′ and kettle':p<1?`A · one rotation about m′ (${format(tm*directProgress)}°)`: 'A complete · Rot(m′, θₘ)',p===0?'Start · m, n, m′ and kettle':p===3?'B complete · Rₙ Rₘ Rₙᵀ = Rot(m′, θₘ)':[`B1 · Undo about n: −θₙ`,`B2 · Rotate about m: θₘ`,`B3 · Restore about n: θₙ`][step]];
      readouts=[['Moved direction m′',vec(mp),'m′ = Rₙ m; fixed in panel A'],['Kettle in panel A',p===0?'Starting orientation':p<1?`${format(tm*directProgress)}° about m′`:'Direct rotation complete','One rotation about the fixed m′ axis'],['Kettle in panel B',p===0?'Starting orientation':p===3?'Conjugation complete':['After Rₙᵀ','After Rₘ Rₙᵀ','After Rₙ Rₘ Rₙᵀ'][step],'Three-step conjugation path']];
      const arc=Array.from({length:61},(_,i)=>M.apply(M.rot(n,tn*i/60),m).map(x=>x*1.65));
      left.set({body:true,orientation:A,axes:la,active:activeA,arc});right.set({body:true,orientation:B,axes:ra,active:activeB});
      $('matrix-a-title').textContent='Final A · Rot(m′, θₘ)';$('matrix-b-title').textContent='Final B · Rₙ Rₘ Rₙᵀ';
      $('scene-legend').innerHTML=`<span><i style="background:${C.n}"></i>n</span><span><i style="background:${C.m}"></i>m</span><span><i style="background:${C.active}"></i>Moved / active axis</span><span><i style="background:${C.body}"></i>Kettle orientation</span>`;
    }else{
      const reverse=chapter===1||d.mode==='reverse',ea=reverse?a.slice().reverse():a,et=reverse?d.angles.slice().reverse():d.angles,en=reverse?names.slice().reverse():names;
      A=M.sequence(a,d.angles,true,p);B=M.sequence(ea,et,false,p);finalA=M.sequence(a,d.angles);finalB=M.sequence(ea,et,false);
      activeA=M.apply(M.sequence(a,d.angles,true,step),a[step]);activeB=ea[step];
      la=a.flatMap((v,i)=>[{vector:v,label:'',color:colors[i],ghost:true,emphasized:names[i]==='m'},{vector:M.apply(A,v),label:names[i]+'(t)',color:colors[i]}]);
      ra=a.map((v,i)=>({vector:v,label:names[i],color:colors[i]}));
      left.set({body:true,orientation:A,axes:la,active:p>0?activeA:null});right.set({body:true,orientation:B,axes:ra,active:p>0?activeB:null});
      const timeNames=names.map((n,i)=>n+(i===1?'′':i===2?'″':''));
      captions=[timeNames.map((n,i)=>`${n}(${d.angles[i]}°)`).join(' → '),en.map((n,i)=>`${n}(${et[i]}°)`).join(' → ')];
      if(chapter===2)$('chapter-description').textContent=`With the body axes initially aligned with X, Y, Z, intrinsic ${timeNames.join(' → ')} reaches the same final orientation as extrinsic ${names.slice().reverse().join(' → ')} with the same angle on each axis.`;
      const a1=M.rot(a[0],d.angles[0]),a2=M.mul(a1,M.rot(a[1],d.angles[1]));
      readouts=[[`Direction ${names[1]}′ after step 1`,vec(M.apply(a1,a[1])),`A₁ ${names[1]}`],[`Direction ${names[2]}″ after step 2`,vec(M.apply(a2,a[2])),`A₂ ${names[2]}`],['Current intrinsic rotation axis',p===0?'No rotation yet':vec(activeA),p===0?'Move the progress slider or press Play':`Step ${step+1}: ${timeNames[step]}`]];
      const sub=n=>`R<sub>${n}</sub>`;$('hero-equation').innerHTML='A<sub>3</sub> = '+names.map(sub).join(' ');
      $('matrix-a-title').textContent='Final intrinsic · '+names.map(n=>'R'+n).join(' ');$('matrix-b-title').textContent='Final extrinsic · '+en.slice().reverse().map(n=>'R'+n).join(' ');
      $('scene-legend').innerHTML=names.map((n,i)=>`<span><i style="background:${colors[i]}"></i>${n}</span>`).join('')+`<span><i style="background:${C.active}"></i>Active axis</span><span><i style="background:${C.body}"></i>Kettle orientation</span>`;
    }
    $('left-caption').textContent=captions[0];$('right-caption').textContent=captions[1];
    $('progress').value=p;$('progress-count').textContent=(chapter===0?'Panel B · ':'')+p.toFixed(2)+' / 3';$('progress-label').textContent=p===0?'Starting state':p===3?'Final result':chapter===0?['Panel B · undo the axis motion','Panel B · rotate about m','Panel B · restore the axis motion'][step]:`Step ${step+1} · ${names[step]}${step===1?'′':step===2?'″':''}`;
    $('vector-readouts').innerHTML=readouts.map(([title,value,note])=>`<div class="vector-card"><strong>${title}</strong><output>${value}</output><small>${note}</small></div>`).join('');
    $('matrix-a').innerHTML=matrixHTML(finalA);$('matrix-b').innerHTML=matrixHTML(finalB);$('matrix-error').textContent=errorText(M.norm(finalA,finalB));$('current-error').textContent=errorText(M.norm(A,B));
    const equal=M.norm(finalA,finalB)<1e-10;
    $('result').classList.toggle('different',!equal);$('result-title').textContent=equal?(p===3?'The final orientations agree':'The final orientations will agree'):'Same time order gives a different result';$('result-description').textContent=chapter===0?'Panel A uses one rotation about m′. Only panel B uses Rₙᵀ, Rₘ, then Rₙ.':equal?'Reverse the axis–angle pairs. The intermediate motions can differ.':'Rotation order matters: try reversing the axis–angle pairs.';
    $('live-progress').textContent=`Selected progress: ${p.toFixed(2)} / 3`;
    document.querySelectorAll('[data-unit]').forEach(el=>{const i=+el.dataset.unit;el.textContent='unit '+vec(a[i]);});
    document.querySelectorAll('[data-step]').forEach(el=>el.setAttribute('aria-pressed',Math.abs(+el.dataset.step-p)<.001?'true':'false'));
    document.querySelectorAll('[data-proof-step],[data-derive-step]').forEach(el=>el.classList.toggle('active',p>0&&Number(el.dataset.proofStep??el.dataset.deriveStep)===step));
  }
  $('play').addEventListener('click',()=>{if(playing){stop();return;}if(data[chapter].progress>=3)data[chapter].progress=0;playing=true;$('play').textContent='Ⅱ Pause';last=0;$('result').setAttribute('aria-live','off');function tick(t){if(!playing)return;if(!last)last=t;data[chapter].progress=Math.min(3,data[chapter].progress+Math.min(t-last,100)/1800);last=t;render();if(data[chapter].progress>=3){stop();$('result').setAttribute('aria-live','polite');return;}frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);});
  $('progress').addEventListener('input',e=>{stop();data[chapter].progress=e.target.valueAsNumber;render();});
  document.querySelectorAll('[data-chapter]').forEach(el=>el.addEventListener('click',()=>setChapter(+el.dataset.chapter)));
  $('previous-chapter').addEventListener('click',()=>setChapter(chapter-1,true));$('next-chapter').addEventListener('click',()=>setChapter(chapter+1,true));
  $('reset').addEventListener('click',()=>{data[chapter]=fresh(chapter);setChapter(chapter);});$('camera-reset').addEventListener('click',()=>left.home());
  $('axis-preset').addEventListener('change',e=>{stop();const d=data[chapter];d.preset=e.target.value;d.axes=d.preset==='arbitrary'?defaults[chapter].axes.map(v=>v.slice()):d.preset==='parallel'?defaults[chapter].axes.map(()=>[1,1,1]):chapter===0?[[1,0,0],[0,0,1]]:[[1,0,0],[0,1,0],[0,0,1]];renderControls();render();});
  $('axis-order').addEventListener('change',e=>{const d=data[2],byAxis=Object.fromEntries(d.order.split('').map((name,i)=>[name,d.angles[i]]));d.order=e.target.value;d.angles=d.order.split('').map(name=>byAxis[name]);setChapter(2);});
  document.querySelectorAll('[name=comparison]').forEach(el=>el.addEventListener('change',()=>{stop();data[2].mode=el.value;render();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  setChapter(0);
})();
