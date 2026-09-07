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
    if (order === 1) return Number(M.KNOTS.open[i] <= t && t < M.KNOTS.open[i + 1]);
    const knots = M.KNOTS.open;
    return (t - knots[i]) / (knots[i + order - 1] - knots[i]) * cox(i, order - 1, t)
      + (knots[i + order] - t) / (knots[i + order] - knots[i + 1]) * cox(i + 1, order - 1, t);
  }
  for (let s = 0; s <= 20; s += 1) {
    const t = s / 20, b = M.basis(t, "open");
    near(b.reduce((a, v) => a + v, 0), 1);
    for (let i = 0; i < 4; i += 1) { assert.ok(b[i] >= 0); near(b[i], cox(i, 4, t)); }
  }
  assert.deepEqual(M.basis(0, "open"), [1 / 6, 4 / 6, 1 / 6, 0]);
  assert.deepEqual(M.basis(1, "open"), [0, 1 / 6, 4 / 6, 1 / 6]);
});

test("clamped basis partitions unity and interpolates the four corner controls", () => {
  assert.deepEqual(M.basis(0), [1, 0, 0, 0]);
  assert.deepEqual(M.basis(1), [0, 0, 0, 1]);
  for (let s = 0; s <= 20; s += 1) {
    const b = M.basis(s / 20);
    assert.ok(b.every((v) => v >= 0)); near(b.reduce((a, v) => a + v), 1);
  }
  const points = plane();
  for (const [u, v, index] of [[0, 0, 0], [1, 0, 3], [0, 1, 12], [1, 1, 15]]) assert.deepEqual(M.evaluate(points, u, v), points[index]);
});

test("both tensor products preserve i-first order and reproduce affine planes", () => {
  for (const mode of ["open", "clamped"]) {
    for (const u of [0, .13, .5, 1]) for (const v of [0, .28, .75, 1]) {
      const p = M.evaluate(plane(), u, v, mode);
      if (mode === "open") { near(p.x, 1 + u); near(p.y, 1 + v); near(p.z, 3 + u + 2 * v); }
      else { near(p.x, 3 * u); near(p.y, 3 * v); near(p.z, 3 * u + 6 * v); }
    }
    const points = plane(), before = M.evaluate(points, .37, .62, mode);
    points[4 * 2 + 1].z += 3; // P12
    near(M.evaluate(points, .37, .62, mode).z - before.z, 3 * M.basis(.37, mode)[1] * M.basis(.62, mode)[2]);
  }
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

test("editor starts with all 16 points in a flat square grid in the specified order", () => {
  const grid = new M.Grid();
  assert.equal(grid.points.length, 16); assert.equal(grid.mode, "clamped");
  const expected = ["P00", "P10", "P20", "P30", "P01", "P11", "P21", "P31", "P02", "P12", "P22", "P32", "P03", "P13", "P23", "P33"];
  for (let index = 0; index < 16; index += 1) {
    assert.equal(M.label(index), expected[index]);
    assert.deepEqual(grid.points[index], { x: 2 + 2 * (index % 4), y: 2 + 2 * Math.floor(index / 4), z: 0 });
    assert.ok(grid.select(index));
  }
  assert.equal(M.evaluate(grid.points, 0, 0, "clamped").x, 2);
  near(M.evaluate(grid.points, 0, 0, "open").x, 4);
  assert.equal(M.evaluate(grid.points, 1, 1, "clamped").x, 8);
  near(M.evaluate(grid.points, 1, 1, "open").x, 6);
});

test("selection, edits and mode switching preserve the complete control net", () => {
  const grid = new M.Grid();
  grid.select(9); grid.edit("z", 4); grid.edit("x", 3.7);
  assert.equal(grid.points[9].z, 4); assert.equal(grid.points[8].z, 0);
  const edited = structuredClone(grid.points);
  grid.setMode("open"); assert.deepEqual(grid.points, edited); assert.equal(grid.selected, 9);
  grid.setMode("clamped"); assert.deepEqual(grid.points, edited); assert.equal(grid.selected, 9);
  assert.throws(() => grid.setMode("invalid")); assert.throws(() => M.basis(.5, "invalid"));
  grid.setMode("open"); grid.reset();
  assert.equal(grid.mode, "open"); assert.equal(grid.selected, 0);
  assert.deepEqual(grid.points, M.squareGrid());
  grid.edit("x", -1); grid.edit("y", 11); grid.edit("z", 30);
  assert.deepEqual(grid.points[0], { x: 0, y: 10, z: 5 });
  assert.throws(() => grid.edit("z", NaN)); assert.equal(grid.select(16), false);
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

test("generated knot vectors and basis formulas follow the selected mode", () => {
  for (const mode of ["clamped", "open"]) {
    const py = Code.python(M.squareGrid(), mode), mat = Code.matlab(M.squareGrid(), mode);
    assert.ok(py.includes(`# U = V = [${M.KNOTS[mode].join(", ")}]`));
    assert.ok(mat.includes(`% U = V = [${M.KNOTS[mode].join(" ")}]`));
    assert.ok(py.includes(mode === "clamped" ? "3*t*(1-t)**2" : "3*t**3-6*t**2+4"));
    assert.ok(mat.includes(mode === "clamped" ? "3*t*(1-t)^2" : "3*t^3-6*t^2+4"));
  }
});
