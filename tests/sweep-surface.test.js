const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const math = require('../cad-modules/sweep-surface/sweep-math.js');

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}
function vectorClose(actual, expected, tolerance = 1e-8) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => close(value, expected[i], tolerance));
}
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

test('the AST parser loads in a classic browser script and respects mathematical precedence', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../cad-modules/sweep-surface/sweep-math.js'), 'utf8'), context);
  close(context.SweepMath.compile('sin(pi/2)+cos(0)', 'u')(0), 2);
  close(math.compile('-u^2 + 2^3^2 + 2^-2', 'u')(3), 503.25);
  close(math.compile('1e-3 + .5 + 2.', 'v')(0), 2.501);
  close(math.compile('sqrt(4)+abs(-2)+log(e)+exp(0)+tan(0)', 'u')(0), 6);
  close(math.compile('(u-0.5)^3', 'u').derivative(0.5), 0);
  close(math.compile('u^u', 'u').derivative(0.7), Math.pow(0.7, 0.7) * (Math.log(0.7) + 1));
});

test('the parser rejects executable text, wrong variables, resource abuse, and undefined values', () => {
  for (const source of ['window.alert(1)', 'u.constructor', 'sin u', '2u', 'u;1', 'v+1', 'foo(u)', 'sin(', '1,2', '', 'u '.repeat(200), '('.repeat(40)+'u'+')'.repeat(40)]) {
    assert.throws(() => math.compile(source, 'u'), undefined, source);
  }
  for (const source of ['1/0', 'sqrt(-1)', 'log(0)', 'exp(1000)', '(-1)^0.5', '1e999']) {
    assert.throws(() => math.compile(source, 'u')(0), undefined, source);
  }
});

test('a straight path and circular profile produce the independent cylinder formula', () => {
  const model = math.build({path:['0','0','6*u-3'],profile:['2*cos(2*pi*v)','2*sin(2*pi*v)']});
  for (const u of [0, 0.123, 0.5, 0.873, 1]) {
    for (const v of [0, 0.17, 0.5, 0.87, 1]) vectorClose(model.point(u,v), [2*Math.cos(2*Math.PI*v),2*Math.sin(2*Math.PI*v),6*u-3]);
    vectorClose(model.frame(u).normal, [1,0,0]);
    vectorClose(model.frame(u).binormal, [0,1,0]);
  }
  assert.equal(model.closedPath, false);
  assert.equal(model.closedProfile, true);
  assert.equal(model.positions.length, 161*65*3);
  assert.equal(model.indices.length, 160*64*6);
  vectorClose(model.bounds.min, [-2,-2,-3]);
  vectorClose(model.bounds.max, [2,2,3]);
});

test('a circular path and circular profile satisfy the implicit torus equation', () => {
  const model = math.build({path:['3*cos(2*pi*u)','3*sin(2*pi*u)','0'],profile:['0.7*cos(2*pi*v)','0.7*sin(2*pi*v)']});
  assert.equal(model.closedPath, true);
  assert.equal(model.closedProfile, true);
  for (const u of [0, 0.123, 0.41, 0.5, 0.837, 1]) {
    for (const v of [0, 0.13, 0.39, 0.72, 1]) {
      const [x,y,z] = model.point(u,v);
      close((Math.hypot(x,y)-3)**2 + z*z, 0.49, 1e-8);
    }
  }
  for (const v of [0,0.3,0.8,1]) vectorClose(model.point(0,v),model.point(1,v));
});

test('transport frames stay right-handed, orthonormal, and continuous through an inflection', () => {
  const model = math.build({path:['4*u-2','3*(u-0.5)^3','0.2*sin(2*pi*u)'],profile:['v-0.5','0'],pathSegments:160});
  let prior;
  for (let i=0;i<=400;i++) {
    const f=model.frame(i/400);
    for (const vector of [f.tangent,f.normal,f.binormal]) close(dot(vector,vector),1);
    close(dot(f.tangent,f.normal),0);
    close(dot(f.tangent,f.binormal),0);
    close(dot(f.normal,f.binormal),0);
    vectorClose(cross(f.tangent,f.normal),f.binormal);
    if (prior) assert.ok(dot(prior,f.normal)>0.99);
    prior=f.normal;
  }
});

test('closed non-planar transport corrects frame holonomy and flags mismatched twist or taper', () => {
  const options={path:['(2+0.3*cos(6*pi*u))*cos(2*pi*u)','(2+0.3*cos(6*pi*u))*sin(2*pi*u)','0.4*sin(6*pi*u)'],profile:['v-0.5','0']};
  const model=math.build(options);
  assert.equal(model.closedPath,true);
  vectorClose(model.frame(0).normal,model.frame(1).normal,1e-7);
  vectorClose(model.frame(0).binormal,model.frame(1).binormal,1e-7);
  vectorClose(model.point(0,0.17),model.point(1,0.17),1e-7);
  const fullTurn=math.build({...options,twist:360});
  vectorClose(fullTurn.point(0,0.17),fullTurn.point(1,0.17),1e-7);
  assert.ok(!fullTurn.warnings.some(x=>x.includes('open parameter seam')));
  assert.ok(math.build({...options,twist:90}).warnings.some(x=>x.includes('open parameter seam')));
  assert.ok(math.build({...options,taper:2}).warnings.some(x=>x.includes('open parameter seam')));
});

test('translation, taper, and twist match an independent rotation-and-scale formula', () => {
  const model=math.build({path:['2*u','u^2','3*u'],profile:['v','2*v-1'],mode:'translate',scale:0.7,taper:2,twist:120});
  for (const u of [0,0.2,0.587,1]) for (const v of [0,0.3,1]) {
    const theta=2*Math.PI*u/3, size=0.7*(1+u), a=v,b=2*v-1;
    vectorClose(model.point(u,v),[2*u+size*(a*Math.cos(theta)-b*Math.sin(theta)),u*u+size*(a*Math.sin(theta)+b*Math.cos(theta)),3*u]);
  }
});

test('mesh rows match point queries and indices remain inside the mesh', () => {
  const model=math.build({path:['cos(2*pi*u)','sin(2*pi*u)','2*u'],profile:['cos(2*pi*v)','sin(2*pi*v)'],scale:0.2,twist:73,taper:0.6,pathSegments:32,profileSegments:12});
  for(let i=0;i<=32;i+=4) for(let j=0;j<=12;j+=3) {
    const offset=(i*13+j)*3;
    vectorClose(Array.from(model.positions.slice(offset,offset+3)),model.point(i/32,j/12),2e-7);
  }
  assert.ok([...model.indices].every(index=>index>=0&&index<model.positions.length/3));
  assert.throws(()=>model.point(-0.1,0));
  assert.throws(()=>model.profileAt(2));
});

test('invalid and degenerate geometry fails with a useful error; collapsed tips are disclosed', () => {
  for (const options of [
    {path:['0','0','0']},
    {path:['(u-0.5)^3','0','0']},
    {path:['sqrt(u)','0','0']},
    {path:['u','0','1/(u-0.5)']},
    {profile:['0','0']},
    {path:['10001+u','0','0']},
    {scale:0}, {taper:-1}, {pathSegments:100000}, {profileSegments:2.5}, {mode:'other'}
  ]) assert.throws(()=>math.build(options));
  const cone=math.build({taper:0});
  vectorClose(cone.point(1,0.3),[0,0,2]);
  assert.ok(cone.warnings.some(x=>x.includes('singular tip')));
});
