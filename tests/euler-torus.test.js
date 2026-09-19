const assert = require("node:assert/strict");
const test = require("node:test");

const torus = require("../cad-modules/euler-characteristic/torus-lab.js");

function vectorClose(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) <= tolerance,
      `coordinate ${index}: expected ${expected[index]}, received ${value}`);
  });
}

function distance(a, b) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

test("the planar 2 by 2 cellulation has nine vertices, sixteen edges, and eight faces", () => {
  const cellulation = torus.createCellulation();
  assert.equal(cellulation.vertices.length, 9);
  assert.equal(cellulation.edges.length, 16);
  assert.equal(cellulation.faces.length, 8);
  assert.equal(new Set(cellulation.vertices.map(vertex => vertex.id)).size, 9);
  assert.equal(new Set(cellulation.edges.map(edge => edge.id)).size, 16);
  assert.equal(cellulation.edges.filter(edge => edge.kind === "diagonal").length, 4);
});

test("the two quotient steps give the intended Euler counts", () => {
  assert.deepEqual(torus.quotientCounts("rectangle"), {
    stage: "rectangle", V: 9, E: 16, F: 8, chi: 1
  });
  assert.deepEqual(torus.quotientCounts("cylinder"), {
    stage: "cylinder", V: 6, E: 14, F: 8, chi: 0
  });
  assert.deepEqual(torus.quotientCounts("torus"), {
    stage: "torus", V: 4, E: 12, F: 8, chi: 0
  });
  assert.throws(() => torus.quotientCounts("mobius"), RangeError);
});

test("formation begins at the planar rectangle and is continuous at the cylinder milestone", () => {
  const u = 0.31, v = 0.72;
  vectorClose(torus.formationPoint(u, v, 0), torus.flatPoint(u, v));
  vectorClose(torus.formationPoint(u, v, 1), torus.cylinderPoint(u, v));
  vectorClose(torus.rolledPoint(u, v, 1), torus.bentPoint(u, v, 0));
});

test("the a boundaries meet at the cylinder and remain identified", () => {
  for (const progress of [1, 1.15, 1.5, 1.9, 2]) {
    for (const v of [0, 0.17, 0.5, 0.81, 1]) {
      const first = torus.formationPoint(0, v, progress);
      const second = torus.formationPoint(1, v, progress);
      assert.ok(distance(first, second) < 1e-9, `a seam open at progress ${progress}, v ${v}`);
    }
  }
});

test("the b boundaries meet when the torus closes", () => {
  for (const u of [0, 0.13, 0.5, 0.77, 1]) {
    const first = torus.formationPoint(u, 0, 2);
    const second = torus.formationPoint(u, 1, 2);
    assert.ok(distance(first, second) < 1e-9, `b seam open at u ${u}`);
  }
});

test("the final points satisfy the standard implicit torus equation", () => {
  const major = torus.DEFAULT_LENGTH / torus.TAU;
  const minor = torus.DEFAULT_WIDTH / torus.TAU;
  for (let i = 0; i <= 10; i += 1) {
    for (let j = 0; j <= 10; j += 1) {
      const [x, y, z] = torus.torusPoint(i / 10, j / 10);
      const radial = Math.hypot(x, y);
      assert.ok(Math.abs((radial - major) ** 2 + z ** 2 - minor ** 2) < 1e-9);
    }
  }
});

test("boundary helpers preserve the indicated arrow directions and join the correct pairs", () => {
  assert.match(torus.BOUNDARY_PAIRS.a.description, /left to right/);
  assert.match(torus.BOUNDARY_PAIRS.b.description, /bottom to top/);

  const aStart = torus.boundaryPoint("a", 0, 0.2, 0);
  const aEnd = torus.boundaryPoint("a", 0, 0.8, 0);
  assert.ok(aEnd[0] > aStart[0], "the a arrow must point toward increasing v / right");

  const bStart = torus.boundaryPoint("b", 0, 0.2, 0);
  const bEnd = torus.boundaryPoint("b", 0, 0.8, 0);
  assert.ok(bEnd[1] > bStart[1], "the b arrow must point toward increasing u / top");

  vectorClose(torus.boundaryPoint("a", 0, 0.41, 1), torus.boundaryPoint("a", 1, 0.41, 1));
  vectorClose(torus.boundaryPoint("b", 0, 0.41, 2), torus.boundaryPoint("b", 1, 0.41, 2));
});

test("all sampled intermediate coordinates are finite", () => {
  for (let p = 0; p <= 20; p += 1) {
    for (let i = 0; i <= 8; i += 1) {
      for (let j = 0; j <= 8; j += 1) {
        assert.ok(torus.formationPoint(i / 8, j / 8, p / 10).every(Number.isFinite));
      }
    }
  }
});

test("progress milestones select counts only after an identification is complete", () => {
  assert.equal(torus.stageForProgress(0.999), "rectangle");
  assert.equal(torus.stageForProgress(1), "cylinder");
  assert.equal(torus.stageForProgress(1.999), "cylinder");
  assert.equal(torus.stageForProgress(2), "torus");
  assert.equal(torus.countsForProgress(0.4).chi, 1);
  assert.equal(torus.countsForProgress(1.4).chi, 0);
});

test("invalid parameters are rejected", () => {
  assert.throws(() => torus.formationPoint(-0.1, 0.5, 0), RangeError);
  assert.throws(() => torus.formationPoint(0.5, 1.1, 0), RangeError);
  assert.throws(() => torus.formationPoint(0.5, 0.5, 2.1), RangeError);
  assert.throws(() => torus.flatPoint(0.5, 0.5, 4, 3), RangeError);
  assert.throws(() => torus.boundaryPoint("c", 0, 0.5, 0), RangeError);
  assert.throws(() => torus.boundaryPoint("a", 2, 0.5, 0), RangeError);
});
