(function (root) {
  'use strict';
  const I = () => [1,0,0,0,1,0,0,0,1];
  const unit = v => {
    if (v.length !== 3 || !v.every(Number.isFinite)) throw new RangeError('Use three finite axis components.');
    const scale = Math.max(...v.map(Math.abs));
    if (!scale) throw new RangeError('A rotation axis cannot be the zero vector.');
    const scaled = v.map(x => x / scale), length = Math.hypot(...scaled);
    return scaled.map(x => x / length);
  };
  const mul = (a,b) => Array.from({length:9}, (_,i) => [0,1,2].reduce((s,k) => s+a[3*Math.floor(i/3)+k]*b[3*k+i%3],0));
  const transpose = a => [a[0],a[3],a[6],a[1],a[4],a[7],a[2],a[5],a[8]];
  const apply = (a,v) => [0,1,2].map(i => a[3*i]*v[0]+a[3*i+1]*v[1]+a[3*i+2]*v[2]);
  function rot(v, degrees) {
    if (!Number.isFinite(degrees)) throw new RangeError('Use a finite angle.');
    const [x,y,z]=unit(v), t=(degrees%360)*Math.PI/180, c=Math.cos(t), s=Math.sin(t), d=1-c;
    return [c+x*x*d,x*y*d-z*s,x*z*d+y*s,y*x*d+z*s,c+y*y*d,y*z*d-x*s,z*x*d-y*s,z*y*d+x*s,c+z*z*d];
  }
  const conjugate = (a,b) => mul(mul(a,b),transpose(a));
  const norm = (a,b) => Math.hypot(...a.map((v,i) => v-b[i]));
  const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
  function sequence(axes,angles,intrinsic=true,progress=3) {
    let a=I();
    axes.forEach((axis,i) => {
      const r=rot(axis,angles[i]*clamp(progress-i,0,1));
      a=intrinsic?mul(a,r):mul(r,a);
    });
    return a;
  }
  function conjugationPath(n,m,tn,tm,progress) {
    const p=clamp(progress,0,3);
    const undo=rot(n,-tn*clamp(p,0,1));
    const turn=rot(m,tm*clamp(p-1,0,1));
    const restore=rot(n,tn*clamp(p-2,0,1));
    return mul(restore,mul(turn,undo));
  }
  root.AxisRotation={I,unit,mul,transpose,apply,rot,conjugate,norm,clamp,sequence,conjugationPath};
})(globalThis);
