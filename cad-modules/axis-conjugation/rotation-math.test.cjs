const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'rotation-math.js'),'utf8'),ctx);
const M=ctx.AxisRotation,close=(a,b,tol=2e-12)=>assert.ok(M.norm(a,b)<tol,`Difference ${M.norm(a,b)}`);
test('quarter-turn sends m=X around n=Z to Y; right-handed rotation sends Y to Z about X',()=>{
  close(M.apply(M.rot([0,0,1],90),[1,0,0]),[0,1,0]);close(M.apply(M.rot([1,0,0],90),[0,1,0]),[0,0,1]);
});
test('conjugation agrees independently with Rodrigues about the moved arbitrary axis',()=>{
  let seed=91257;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<300;i++){
    const n=Array.from({length:3},()=>random()*2-1),m=Array.from({length:3},()=>random()*2-1),tn=random()*720-360,tm=random()*720-360;
    const rn=M.rot(n,tn),direct=M.rot(M.apply(rn,M.unit(m)),tm),conjugated=M.conjugate(rn,M.rot(m,tm));close(direct,conjugated);
    close(M.mul(M.transpose(direct),direct),M.I());close(M.conjugationPath(n,m,tn,tm,3),direct);
  }
});
test('each intrinsic step equals rotation about its transported world axis',()=>{
  const axes=[[1,.3,.2],[.2,1,.4],[.4,-.2,1]],angles=[55,40,65];let explicit=M.I();
  axes.forEach((axis,i)=>{const moved=M.apply(explicit,M.unit(axis)),increment=M.rot(moved,angles[i]);explicit=M.mul(increment,explicit);close(explicit,M.sequence(axes,angles,true,i+1));});
  close(explicit,M.sequence(axes.slice().reverse(),angles.slice().reverse(),false));
});
test('all six Cartesian orders equal reversed extrinsic pairs; same order usually differs',()=>{
  const axes={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]};
  for(const order of ['XYZ','XZY','YXZ','YZX','ZXY','ZYX']){const a=order.split('').map(n=>axes[n]),t=[60,45,30];close(M.sequence(a,t),M.sequence(a.slice().reverse(),t.slice().reverse(),false));assert.ok(M.norm(M.sequence(a,t),M.sequence(a,t,false))>.1);}
});
test('parallel, negative, zero-angle, half-turn, extreme-scale and gimbal-lock cases remain valid',()=>{
  const m=[1,2,3];close(M.rot(m,62),M.rot(m.map(x=>-x),-62));close(M.rot(m,0),M.I());
  for(const angle of [0,180,-180,90,-90])close(M.conjugate(M.rot(m,angle),M.rot(m,57)),M.rot(m,57));
  close(M.unit([1e308,1e308,0]),[Math.SQRT1_2,Math.SQRT1_2,0]);close(M.unit([1e-310,0,0]),[1,0,0]);
  const a=[[1,0,0],[0,1,0],[0,0,1]];close(M.sequence(a,[20,90,70]),M.sequence(a.slice().reverse(),[70,90,20],false));
  assert.throws(()=>M.rot([0,0,0],40),/zero/);assert.throws(()=>M.rot([NaN,1,0],40),/finite/);assert.throws(()=>M.rot([1,0,0],Infinity),/finite/);
});
test('animation endpoints and step boundaries are continuous',()=>{
  const axes=[[1,.3,.2],[.2,1,.4],[.4,-.2,1]],angles=[55,40,65];
  close(M.sequence(axes,angles,true,0),M.I());close(M.conjugationPath(axes[0],axes[1],60,45,0),M.I());
  for(const p of [1,2]){close(M.sequence(axes,angles,true,p-1e-9),M.sequence(axes,angles,true,p+1e-9),1e-8);close(M.conjugationPath(axes[0],axes[1],60,45,p-1e-9),M.conjugationPath(axes[0],axes[1],60,45,p+1e-9),1e-8);}
});
