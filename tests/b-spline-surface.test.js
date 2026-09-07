const assert = require("node:assert/strict");
const test = require("node:test");
const M = require("../programming-modules/b-spline-surfaces/surface-math.js");
const Code = require("../programming-modules/b-spline-surfaces/surface-code.js");
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const plane = () => Array.from({ length: 16 }, (_, index) => {
  const i = index % 4, j = Math.floor(index / 4);
  return { x: i, y: j, z: i + 2 * j };
});

test("uniform cubic basis matches Cox-de Boor on its active span including endpoints", () => {
  function cox(i, order, t) {
    if (order === 1) return Number(M.KNOTS[i] <= t && t < M.KNOTS[i + 1]);
    const knots = M.KNOTS;
    return (t - knots[i]) / (knots[i + order - 1] - knots[i]) * cox(i, order - 1, t)
      + (knots[i + order] - t) / (knots[i + order] - knots[i + 1]) * cox(i + 1, order - 1, t);
  }
  for (let s = 0; s <= 20; s += 1) {
    const t = s / 20, b = M.basis(t);
    near(b.reduce((a, v) => a + v, 0), 1);
    for (let i = 0; i < 4; i += 1) { assert.ok(b[i] >= 0); near(b[i], cox(i, 4, t)); }
  }
  assert.deepEqual(M.basis(0), [1 / 6, 4 / 6, 1 / 6, 0]);
  assert.deepEqual(M.basis(1), [0, 1 / 6, 4 / 6, 1 / 6]);
});

test("tensor product preserves the requested i-first order and reproduces affine planes", () => {
  for (const u of [0, .13, .5, 1]) for (const v of [0, .28, .75, 1]) {
    const p = M.evaluate(plane(), u, v);
    near(p.x, 1 + u); near(p.y, 1 + v); near(p.z, 3 + u + 2 * v);
  }
  const points = plane(), before = M.evaluate(points, .37, .62);
  points[4 * 2 + 1].z += 3; // P12
  near(M.evaluate(points, .37, .62).z - before.z, 3 * M.basis(.37)[1] * M.basis(.62)[2]);
});

test("mesh winding is upward on a planar net and remains finite for coincident controls", () => {
  const mesh = M.sample(plane(), 10);
  assert.equal(mesh.positions.length, 11 * 11 * 3);
  assert.equal(mesh.indices.length, 10 * 10 * 6);
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const vertices = mesh.indices.slice(t, t + 3).map((index) => mesh.positions.slice(index * 3, index * 3 + 3));
    const [a, b, c] = vertices;
    assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0);
  }
  const degenerate = M.sample(Array.from({ length: 16 }, () => ({ x: 1, y: 2, z: 3 })), 4);
  assert.ok(degenerate.positions.every(Number.isFinite));
});

test("capture requires height confirmation for each of the 16 specified point labels", () => {
  const capture = new M.Capture();
  const expected = ["P00", "P10", "P20", "P30", "P01", "P11", "P21", "P31", "P02", "P12", "P22", "P32", "P03", "P13", "P23", "P33"];
  for (let index = 0; index < 16; index += 1) {
    assert.equal(M.label(index), expected[index]);
    assert.equal(capture.place(index % 4, Math.floor(index / 4)), true);
    assert.equal(capture.confirmed, index);
    assert.equal(capture.place(9, 9), false);
    capture.edit("z", index / 4 - 2);
    assert.equal(capture.points[index].z, index / 4 - 2);
    assert.equal(capture.confirm(), true);
    assert.equal(capture.confirmed, index + 1);
  }
  assert.equal(capture.place(5, 5), false);
  assert.equal(capture.confirm(), false);
});

test("revisiting, undoing, and resetting do not relabel or corrupt control points", () => {
  const capture = new M.Capture();
  for (let i = 0; i < 16; i += 1) { capture.place(1, 2); capture.confirm(); }
  assert.ok(capture.select(9)); capture.edit("z", 4);
  assert.equal(capture.points[9].z, 4); assert.equal(capture.points[8].z, 0);
  capture.undo(); assert.equal(capture.points.length, 15);
  capture.place(3, 4); capture.edit("z", -2);
  assert.equal(capture.select(0), false);
  capture.undo(); assert.equal(capture.points.length, 15);
  capture.place(2, 4); capture.confirm(); assert.equal(capture.points.length, 16);
  capture.clear(); assert.equal(capture.confirmed, 0); assert.equal(capture.selected, -1);
  capture.place(-1, 11); capture.edit("z", 30);
  assert.deepEqual(capture.points[0], { x: 0, y: 10, z: 5 });
  assert.throws(() => capture.edit("z", NaN));
});

test("control net connects neighbors without a spurious edge between successive rows", () => {
  assert.equal(M.netEdges(16).length, 24);
  assert.ok(!M.netEdges(16).some(([a, b]) => a === 3 && b === 4));
  for (let count = 0; count <= 16; count += 1) {
    assert.ok(M.netEdges(count).every(([a, b]) => a < count && b < count));
  }
});

test("generated programs retain all coordinates in the same order and reject partial nets", () => {
  const points = plane();
  const python = Code.python(points), matlab = Code.matlab(points);
  const pyRows = python.match(/\[[\d., -]+\],  # P\d\d/g);
  const matRows = matlab.match(/[\d. -]+; % P\d\d/g);
  assert.equal(pyRows.length, 16); assert.equal(matRows.length, 16);
  for (let i = 0; i < 16; i += 1) {
    assert.ok(pyRows[i].endsWith(M.label(i))); assert.ok(matRows[i].endsWith(M.label(i)));
  }
  assert.match(Code.python([]), /points.shape != \(16, 3\)/);
  assert.match(Code.matlab([]), /isequal\(size\(points\), \[16 3\]\)/);
});
