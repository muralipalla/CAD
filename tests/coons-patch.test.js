const assert = require("node:assert/strict");
const test = require("node:test");
const M = require("../programming-modules/coons-patch/coons-math.js");
const Code = require("../programming-modules/coons-patch/coons-code.js");
const near = (a,b,t=1e-10) => assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const nearPoint = (a,b) => ["x","y","z"].forEach((axis)=>near(a[axis],b[axis]));

test("cubic Bezier evaluation interpolates endpoints",()=>{
  const points=M.defaults(),curve=M.BOUNDARIES.C0.map((i)=>points[i]);
  nearPoint(M.bezier(curve,0),points[0]); nearPoint(M.bezier(curve,1),points[2]);
  assert.throws(()=>M.bezier(curve,-.1));
});

test("Coons patch interpolates every boundary",()=>{
  const points=M.defaults();
  for(const t of [0,.13,.5,.88,1]){
    nearPoint(M.evaluate(points,0,t),M.boundary(points,"C0",t));
    nearPoint(M.evaluate(points,1,t),M.boundary(points,"C1",t));
    nearPoint(M.evaluate(points,t,0),M.boundary(points,"D0",t));
    nearPoint(M.evaluate(points,t,1),M.boundary(points,"D1",t));
  }
});

test("straight compatible boundaries reproduce a bilinear plane",()=>{
  const corners=[{x:0,y:0,z:0},{x:3,y:0,z:3},{x:0,y:3,z:6},{x:3,y:3,z:9}];
  const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
  const points=[...corners,lerp(corners[0],corners[2],1/3),lerp(corners[0],corners[2],2/3),lerp(corners[1],corners[3],1/3),lerp(corners[1],corners[3],2/3),lerp(corners[0],corners[1],1/3),lerp(corners[0],corners[1],2/3),lerp(corners[2],corners[3],1/3),lerp(corners[2],corners[3],2/3)];
  for(const u of [0,.2,.7,1])for(const v of [0,.4,.9,1]){const p=M.evaluate(points,u,v);near(p.x,3*u);near(p.y,3*v);near(p.z,3*u+6*v);}
});

test("mesh has upward winding and finite coordinates",()=>{
  const mesh=M.sample(M.defaults(),10);assert.equal(mesh.positions.length,11*11*3);assert.equal(mesh.indices.length,10*10*6);assert.ok(mesh.positions.every(Number.isFinite));
  for(let k=0;k<mesh.indices.length;k+=3){const [a,b,c]=mesh.indices.slice(k,k+3).map((i)=>mesh.positions.slice(i*3,i*3+3));assert.ok((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0);}
});

test("editor preserves shared corners and clamps coordinates",()=>{
  const patch=new M.Patch();assert.equal(patch.points.length,12);assert.equal(M.controlEdges().length,12);patch.select(0);patch.edit("x",-3);patch.edit("z",9);assert.deepEqual(patch.points[0],{x:0,y:2,z:5});assert.equal(M.BOUNDARIES.C0[0],M.BOUNDARIES.D0[0]);assert.equal(patch.select(12),false);assert.throws(()=>patch.edit("z",NaN));
});

test("generated Python and MATLAB retain all controls and formula terms",()=>{
  const py=Code.python(M.defaults()),mat=Code.matlab(M.defaults());assert.equal(py.match(/# (?:P|C|D)\w*/g).length,12);assert.equal(mat.match(/% (?:P|C|D)\w*/g).length,12);for(const code of[py,mat]){assert.match(code,/ruled/i);assert.match(code,/bilinear|B =/);assert.match(code,/bezier/i);}assert.throws(()=>Code.python([]));
});
