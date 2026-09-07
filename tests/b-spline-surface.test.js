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
    const knots = M.knots(4, 4, "open");
    if (order === 1) return Number(knots[i] <= t && t < knots[i + 1]);
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
  for (const size of [4, 5, 6]) {
    assert.equal(M.netEdges(size * size).length, 2 * size * (size - 1));
    assert.ok(M.netEdges(size * size).every(([a, b]) => b - a === size || (b - a === 1 && Math.floor(a / size) === Math.floor(b / size))));
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
  assert.throws(() => Code.python([]));
  assert.throws(() => Code.matlab([]));
});

test("generated programs use the current grid, order and full precision knot construction", () => {
  for (const size of [4, 5, 6]) for (let order = 2; order <= size; order++) for (const mode of ["clamped", "open"]) {
    const py = Code.python(M.squareGrid(size), mode, order), mat = Code.matlab(M.squareGrid(size), mode, order);
    assert.equal(py.match(/\],  # P\d\d/g).length, size * size);
    assert.equal(mat.match(/; % P\d\d/g).length, size * size);
    assert.ok(py.includes(`c, m = ${size}, ${order}`));
    assert.ok(mat.includes(`c = ${size}; m = ${order};`));
    assert.ok(py.includes(mode === "clamped" ? "[0.0]*m + [i/spans" : "[(i-m+1)/spans"));
    assert.ok(mat.includes(mode === "clamped" ? "[zeros(1,m), (1:spans-1)/spans" : "((0:c+m-1)-m+1)/spans"));
  }
});

test("all grid/order/mode combinations partition unity and reproduce Greville coordinate planes", () => {
  for (const size of [4, 5, 6]) for (let order = 2; order <= size; order++) for (const mode of ["clamped", "open"]) {
    const knots = M.knots(size, order, mode), spans = size - order + 1;
    assert.equal(knots.length, size + order);
    assert.equal(knots[order - 1], 0); assert.equal(knots[size], 1);
    const greville = Array.from({ length: size }, (_, i) => knots.slice(i + 1, i + order).reduce((a, b) => a + b, 0) / (order - 1));
    const points = Array.from({ length: size * size }, (_, k) => {
      const x = greville[k % size], y = greville[Math.floor(k / size)];
      return { x, y, z: x + 2 * y };
    });
    const parameters = [0, 1e-10, .137, .5, .891, 1 - 1e-10, 1, ...Array.from({ length: spans - 1 }, (_, k) => (k + 1) / spans)];
    for (const t of parameters) {
      const b = M.basis(t, mode, size, order);
      assert.equal(b.length, size); assert.ok(b.every((v) => v >= -1e-14));
      near(b.reduce((a, v) => a + v, 0), 1);
      for (const v of parameters) {
        const point = M.evaluate(points, t, v, mode, order);
        near(point.x, t); near(point.y, v); near(point.z, t + 2 * v);
      }
    }
    if (mode === "clamped") {
      assert.deepEqual(M.basis(0, mode, size, order), Array.from({ length: size }, (_, i) => Number(i === 0)));
      assert.deepEqual(M.basis(1, mode, size, order), Array.from({ length: size }, (_, i) => Number(i === size - 1)));
    }
    const mesh = M.sample(points, 10, mode, order);
    assert.equal(mesh.divisions % spans, 0);
    assert.equal(mesh.positions.length, (mesh.divisions + 1) ** 2 * 3);
    assert.equal(mesh.indices.length, mesh.divisions ** 2 * 6);
    assert.ok(mesh.positions.every(Number.isFinite));
    for (let k = 0; k < mesh.positions.length; k += 3) near(mesh.positions[k + 2], mesh.positions[k] + 2 * mesh.positions[k + 1]);
  }
});

test("grid size changes reset the net and constrain order while order changes retain edits", () => {
  const grid = new M.Grid();
  for (const size of [5, 6, 4]) {
    grid.setSize(size);
    assert.equal(grid.points.length, size * size); assert.equal(grid.selected, 0);
    assert.deepEqual(grid.points, M.squareGrid(size));
    grid.setOrder(size); grid.select(size * size - 1); grid.edit("z", 3.5);
    assert.equal(M.label(grid.selected, size), `P${size - 1}${size - 1}`);
    const snapshot = structuredClone(grid.points);
    grid.setOrder(2); grid.setMode("open");
    assert.deepEqual(grid.points, snapshot); assert.equal(grid.selected, size * size - 1);
    grid.setOrder(size);
  }
  assert.equal(grid.order, 4);
  assert.throws(() => grid.setSize(3)); assert.throws(() => grid.setOrder(5));
  assert.throws(() => grid.setOrder(1)); assert.throws(() => grid.setOrder(2.5));
});
