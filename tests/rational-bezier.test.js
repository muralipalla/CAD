const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../programming-modules/rational-bezier-curves/rational-math.js");
const Code = require("../programming-modules/rational-bezier-curves/rational-code.js");
const near = (a, b, tolerance = 1e-11) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const nearPoint = (a, b) => a.forEach((value, i) => near(value, b[i]));

test("parabola lies in cutting plane and cone; its projection lies on circle", () => {
  for (const radius of [0.5, 1, 2, 3]) for (const theta of [0, 10, 45, 75, 90, 91, 120, 179, 179.9999]) {
    const model = M.construction(radius, theta);
    for (let i = 0; i <= 200; i++) {
      const u = i / 200, h = M.lifted(model, u), p = M.project(h);
      near(h[0] + radius * h[2], radius * (1 + model.c));
      near(h[0] ** 2 + h[1] ** 2, radius ** 2 * h[2] ** 2);
      near(p[0] ** 2 + p[1] ** 2, radius ** 2);
      assert.ok(h[2] >= (1 + model.c) / 2 - 1e-12);
      assert.ok(Math.atan2(p[1], p[0]) >= -model.theta - 1e-12);
      assert.ok(Math.atan2(p[1], p[0]) <= model.theta + 1e-12);
      nearPoint(p, M.rational(model, u));
      const b = M.bernstein(u);
      nearPoint(h, [0,1,2].map(axis => b.reduce((sum, v, j) => sum + v * model.controls[j][axis], 0)));
    }
    nearPoint(M.lifted(model, 0), model.controls[0]);
    nearPoint(M.lifted(model, 1), model.controls[2]);
    nearPoint(M.lifted(model, 0.5), model.vertex);
    nearPoint(M.rational(model, 0.5), [radius, 0, 1]);
  }
});

test("known quarter-circle controls, weights, tangent intersection and off-cone control", () => {
  const model = M.construction(1, 45), h = Math.SQRT1_2;
  nearPoint(model.controls[1], [1, 0, h]);
  nearPoint(model.projected[1], [Math.SQRT2, 0, 1]);
  nearPoint(model.weights, [1, h, 1]);
  const p = model.projected[1];
  near(model.c * p[0] + model.s * p[1], 1);
  near(model.c * p[0] - model.s * p[1], 1);
  assert.ok(model.controls[1][0] ** 2 - model.controls[1][2] ** 2 > 0);
});

test("notes' 4x4 projection matrix agrees with divide by w", () => {
  const pi = [0, 0, 1, -1], v = [0, 0, 0, 1];
  const dot = pi.reduce((total, x, i) => total + x * v[i], 0);
  const matrix = v.map((value, i) => pi.map((coefficient, j) => value * coefficient - (i === j ? dot : 0)));
  for (const theta of [10, 45, 75, 120, 179]) {
    const model = M.construction(2, theta);
    for (const p of [...model.controls, M.lifted(model, 0.3)]) {
      const homogeneous = [...p, 1];
      const result = matrix.map(row => row.reduce((sum, coefficient, i) => sum + coefficient * homogeneous[i], 0));
      nearPoint(result.slice(0, 3).map(value => value / result[3]), M.project(p));
    }
  }
});

test("0 to 180 range represents infinite controls and singular endpoints explicitly", () => {
  for (const pair of [[0, 45], [-1, 45], [1, -1], [1, 181], [NaN, 45]]) {
    assert.throws(() => M.construction(...pair), RangeError);
  }
  assert.throws(() => M.project([1, 0, 0]), RangeError);
  assert.throws(() => M.bernstein(-0.1), RangeError);
  const model = M.construction(1, 89.99);
  assert.ok(model.projected[1][0] > 5000);
  nearPoint(M.rational(model, 0.5), [1, 0, 1]);
  const semicircle = M.construction(1, 90);
  assert.equal(semicircle.projected[1], null); assert.equal(semicircle.weights[1], 0);
  nearPoint(M.rational(semicircle, 0.5), [1,0,1]);
  const major = M.construction(1,120); near(major.weights[1], -0.5); nearPoint(major.projected[1], [-2,0,1]);
  const degenerate = M.construction(1,180);
  nearPoint(M.lifted(degenerate,0.5), [0,0,0]);
  assert.equal(M.rational(degenerate,0.5), null);
  for (const u of [0,0.4,0.6,1]) nearPoint(M.rational(degenerate,u), [-1,0,1]);
  const collapsed = M.construction(1,0);
  for (const u of [0,0.5,1]) nearPoint(M.rational(collapsed,u), [1,0,1]);
});

test("sampling resolves the whole major arc near 180 degrees", () => {
  for (const theta of [90,120,179,179.9999]) {
    const sampled = M.sample(M.construction(2,theta));
    let previous = -theta*Math.PI/180;
    for (const p of sampled.arc) {
      assert.ok(p.every(Number.isFinite)); near(p[0]**2+p[1]**2,4);
      const angle = Math.atan2(p[1],p[0]);
      assert.ok(angle >= previous-1e-12 && angle-previous < 0.041);
      previous = angle;
    }
    near(previous, theta*Math.PI/180);
  }
});

test("generated programs use current parameters and the notes' projection matrix", () => {
  const model = M.construction(2.35, 37);
  const py = Code.python(model), matlab = Code.matlab(model);
  assert.match(py, /r = 2\.35/); assert.match(py, /theta_degrees = 37/);
  assert.match(matlab, /theta_degrees = 37/);
  assert.match(py, /Proj = np.outer\(V, Pi\) - \(Pi @ V\) \* np.eye\(4\)/);
  assert.match(matlab, /Proj = V\*Pi' - \(Pi'\*V\)\*eye\(4\)/);
});
