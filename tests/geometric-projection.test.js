const assert = require("node:assert/strict");
const test = require("node:test");
const P = require("../cad-modules/geometric-transformations/projection-playground.js");

const near = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) < tolerance, actual + " != " + expected);
};

const nearPoint = (actual, expected) => {
  expected.forEach((value, index) => near(actual[index], value));
};

test("projects a viewpoint below the plane toward a point above it", () => {
  const result = P.projectToZ0([0, -0.7, -3.2], [-2, -1.1, 2.5]);
  assert.equal(result.kind, "point");
  near(result.lambda, 3.2 / 5.7);
  nearPoint(result.point, [-1.1228070175438596, -0.924561403508772, 0]);
});

test("intersects a line with a general plane", () => {
  const result = P.linePlaneIntersection([0, 0, 0], [2, 0, 0], [1, 1, 1, -1]);
  assert.equal(result.kind, "point");
  near(result.lambda, 0.5);
  nearPoint(result.point, [1, 0, 0]);
});

test("plane coefficient scaling does not change the intersection", () => {
  const viewpoint = [1, -2, 4];
  const point = [5, 6, -4];
  const expected = P.linePlaneIntersection(viewpoint, point, [0, 0, 1, 0]);

  for (const scale of [7, -0.25, 1e-8]) {
    const actual = P.linePlaneIntersection(viewpoint, point, [0, 0, scale, 0]);
    assert.equal(actual.kind, "point");
    near(actual.lambda, expected.lambda);
    nearPoint(actual.point, expected.point);
  }
});

test("reports parallel, contained and degenerate lines", () => {
  assert.equal(P.projectToZ0([0, 0, 2], [3, 1, 2]).kind, "parallel");
  assert.equal(P.projectToZ0([0, 0, 0], [3, 1, 0]).kind, "contained");
  assert.equal(P.projectToZ0([1, 2, 3], [1, 2, 3]).kind, "degenerate");
});

test("handles endpoints that already lie on the plane", () => {
  const pointOnPlane = P.projectToZ0([0, 0, 4], [2, 3, 0]);
  near(pointOnPlane.lambda, 1);
  nearPoint(pointOnPlane.point, [2, 3, 0]);

  const viewpointOnPlane = P.projectToZ0([2, 3, 0], [5, 8, -2]);
  near(viewpointOnPlane.lambda, 0);
  nearPoint(viewpointOnPlane.point, [2, 3, 0]);
});

test("the Three.js scene keeps V below and three source points above Pi", () => {
  const geometry = P.INITIAL_GEOMETRY;
  assert.ok(geometry.viewpoint[2] < 0);
  assert.equal(geometry.points.length, 3);
  assert.ok(geometry.points.every((point) => point[2] > 0));

  const results = P.projectPointsToZ0(geometry.viewpoint, geometry.points);
  assert.equal(results.length, 3);
  results.forEach((result) => {
    assert.equal(result.kind, "point");
    assert.ok(result.lambda > 0 && result.lambda < 1);
    near(result.point[2], 0);
  });
});

test("rejects malformed geometry", () => {
  assert.throws(() => P.projectToZ0([0, 0], [0, 0, 1]), RangeError);
  assert.throws(() => P.linePlaneIntersection([0, 0, 1], [0, 0, -1], [0, 0, 0, 1]), RangeError);
  assert.throws(() => P.linePlaneIntersection([0, 0, 1], [0, 0, -1], [0, 0, 1, 0], 0), RangeError);
  assert.throws(() => P.projectPointsToZ0([0, 0, -1], []), RangeError);
});
