const assert = require("node:assert/strict");
const test = require("node:test");
const F = require("../cad-modules/curves/frenet-frame.js");

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " differs from " + expected);
}

function vectorNear(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach(function (value, index) { near(value, expected[index], tolerance); });
}

function dot(a, b) {
  return a.reduce(function (sum, value, index) { return sum + value * b[index]; }, 0);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function subtract(a, b) {
  return a.map(function (value, index) { return value - b[index]; });
}

function length(vector) {
  return Math.sqrt(dot(vector, vector));
}

test("tapered spiral reaches both requested endpoint radii", () => {
  const startRadius = 0.6;
  const endRadius = 2.3;
  const pitch = 1.8;
  const start = -3 * Math.PI;
  const end = 3 * Math.PI;
  const first = F.spiralFrame(startRadius, endRadius, pitch, start);
  const middle = F.spiralFrame(startRadius, endRadius, pitch, 0);
  const last = F.spiralFrame(startRadius, endRadius, pitch, end);

  near(Math.hypot(first.point[0], first.point[1]), startRadius);
  near(Math.hypot(middle.point[0], middle.point[1]), (startRadius + endRadius) / 2);
  near(Math.hypot(last.point[0], last.point[1]), endRadius);
  near(last.point[2] - first.point[2], pitch * 3);
});

test("constant radii reduce to the known circular helix frame", () => {
  const frame = F.spiralFrame(2, 2, 2 * Math.PI, 0);
  const rootFive = Math.sqrt(5);

  vectorNear(frame.point, [2, 0, 0]);
  vectorNear(frame.tangent, [0, 2 / rootFive, 1 / rootFive]);
  vectorNear(frame.normal, [-1, 0, 0]);
  vectorNear(frame.binormal, [0, -1 / rootFive, 2 / rootFive]);
  near(frame.curvature, 2 / 5);
  near(frame.torsion, 1 / 5);
  near(frame.circleRadius, 5 / 2);
  vectorNear(frame.center, [-0.5, 0, 0]);
});

test("analytic derivatives agree with central differences", () => {
  const values = [0.7, 2.2, -2.4, 0.8];
  const epsilon = 1e-5;
  const frame = F.spiralFrame(...values);
  const before = F.spiralFrame(values[0], values[1], values[2], values[3] - epsilon).point;
  const after = F.spiralFrame(values[0], values[1], values[2], values[3] + epsilon).point;
  const numericalVelocity = after.map(function (value, index) { return (value - before[index]) / (2 * epsilon); });
  vectorNear(numericalVelocity, frame.velocity, 2e-10);
});

test("T, N and B remain orthonormal and right-handed", () => {
  [
    [0.7, 2.2, 2, -4.2],
    [2.4, 0.4, -4, 1.3],
    [1.2, 2.5, 0, 7.8]
  ].forEach(function (values) {
    const frame = F.spiralFrame(...values);
    near(length(frame.tangent), 1);
    near(length(frame.normal), 1);
    near(length(frame.binormal), 1);
    near(dot(frame.tangent, frame.normal), 0);
    near(dot(frame.tangent, frame.binormal), 0);
    near(dot(frame.normal, frame.binormal), 0);
    vectorNear(cross(frame.tangent, frame.normal), frame.binormal);
  });
});

test("osculating circle passes through the point in the osculating plane", () => {
  const values = [0.8, 2.1, -2.4, 0.7];
  const frame = F.spiralFrame(...values);
  vectorNear(F.osculatingCirclePoint(...values, 0), frame.point);

  [0.2, 1.8, 4.7].forEach(function (angle) {
    const point = F.osculatingCirclePoint(...values, angle);
    const radial = subtract(point, frame.center);
    near(length(radial), frame.circleRadius);
    near(dot(radial, frame.binormal), 0);
  });
});

test("osculating circle tangent agrees with the spiral tangent", () => {
  const values = [2.2, 0.6, 3.1, -0.4];
  const epsilon = 1e-6;
  const before = F.osculatingCirclePoint(...values, -epsilon);
  const after = F.osculatingCirclePoint(...values, epsilon);
  const derivative = after.map(function (value, index) { return (value - before[index]) / (2 * epsilon); });
  const frame = F.spiralFrame(...values);
  vectorNear(derivative.map(function (value) { return value / frame.circleRadius; }), frame.tangent, 1e-9);
});

test("zero and negative pitch cover planar and opposite-handed spirals", () => {
  const planar = F.spiralFrame(0.7, 2.2, 0, 1.1);
  near(planar.torsion, 0);
  vectorNear(planar.binormal, [0, 0, 1]);

  const positive = F.spiralFrame(0.7, 2.2, 2.2, 0.3);
  const negative = F.spiralFrame(0.7, 2.2, -2.2, 0.3);
  near(positive.curvature, negative.curvature);
  near(positive.torsion, -negative.torsion);
  near(positive.circleRadius, negative.circleRadius);
});

test("one revolution advances pitch while radius changes by one third of its range", () => {
  const startRadius = 0.7;
  const endRadius = 2.2;
  const pitch = -2.6;
  const parameter = -2;
  const first = F.spiralFrame(startRadius, endRadius, pitch, parameter);
  const next = F.spiralFrame(startRadius, endRadius, pitch, parameter + 2 * Math.PI);

  near(next.radius - first.radius, (endRadius - startRadius) / 3);
  near(next.point[2] - first.point[2], pitch);
  const firstDirection = [first.point[0], first.point[1]].map(function (value) { return value / first.radius; });
  const nextDirection = [next.point[0], next.point[1]].map(function (value) { return value / next.radius; });
  vectorNear(nextDirection, firstDirection);
});

test("sampling includes both spiral endpoints", () => {
  const points = F.sampleSpiral(0.5, 2.5, 3, undefined, undefined, 17);
  near(Math.hypot(points[0][0], points[0][1]), 0.5);
  near(Math.hypot(points.at(-1)[0], points.at(-1)[1]), 2.5);
  assert.equal(points.length, 17);
});

test("invalid tapered spiral inputs are rejected", () => {
  assert.throws(() => F.spiralFrame(-1, 2, 1, 0), RangeError);
  assert.throws(() => F.spiralFrame(1, -2, 1, 0), RangeError);
  assert.throws(() => F.spiralFrame(1, 2, NaN, 0), RangeError);
  assert.throws(() => F.spiralFrame(1, 2, 1, 4 * Math.PI), RangeError);
  assert.throws(() => F.spiralFrame(0, 0, 1, 0), RangeError);
  assert.throws(() => F.osculatingCirclePoint(1, 2, 1, 0, Infinity), RangeError);
  assert.throws(() => F.sampleSpiral(1, 2, 1, 2, 1, 10), RangeError);
  assert.throws(() => F.sampleSpiral(1, 2, 1, 0, 1, 1), RangeError);
});
