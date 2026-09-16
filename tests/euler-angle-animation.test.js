const assert = require("node:assert/strict");
const test = require("node:test");
const E = require("../cad-modules/geometric-transformations/euler-angles.js");
const M = require("../cad-modules/intrinsic-extrinsic-rotations/rotations-math.js");

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + " differs from " + expected);
}

function arrayNear(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach(function (value, index) { near(value, expected[index], tolerance); });
}

test("Euler animation ends at Rz(alpha) Ry(beta) Rx(gamma)", () => {
  const angles = [60, 45, 30];
  const actual = E.frameState(M, angles, 3);
  const expected = M.multiply(
    M.multiply(M.rotation("Z", angles[0]), M.rotation("Y", angles[1])),
    M.rotation("X", angles[2])
  );

  arrayNear(actual.orientation, expected);
  assert.equal(actual.step, 2);
  assert.equal(actual.fraction, 1);
  assert.equal(actual.complete, true);
});

test("active axes follow z, rotated y-prime, then rotated x-double-prime", () => {
  const angles = [60, 45, 30];
  arrayNear(E.frameState(M, angles, 0).activeAxis, [0, 0, 1]);

  const expectedYPrime = M.apply(M.rotation("Z", angles[0]), [0, 1, 0]);
  arrayNear(E.frameState(M, angles, 1).activeAxis, expectedYPrime);

  const firstTwo = M.multiply(M.rotation("Z", angles[0]), M.rotation("Y", angles[1]));
  const expectedXDoublePrime = M.apply(firstTwo, [1, 0, 0]);
  arrayNear(E.frameState(M, angles, 2).activeAxis, expectedXDoublePrime);
});

test("fractional progress applies only the current intrinsic rotation fraction", () => {
  const angles = [80, -50, 35];
  const frame = E.frameState(M, angles, 1.4);
  const expected = M.multiply(M.rotation("Z", 80), M.rotation("Y", -20));

  arrayNear(frame.orientation, expected);
  assert.equal(frame.step, 1);
  near(frame.fraction, 0.4);
  assert.equal(frame.complete, false);
});

test("intrinsic ZYX result matches the reversed fixed-axis sequence", () => {
  const angles = [25, -40, 75];
  const intrinsic = E.frameState(M, angles, 3).orientation;
  const extrinsic = M.orientation("XYZ", angles.slice().reverse(), "extrinsic", 3);
  arrayNear(intrinsic, extrinsic);
});

test("frameState rejects malformed dependencies, angles and progress", () => {
  assert.throws(() => E.frameState(null, [1, 2, 3], 0), TypeError);
  assert.throws(() => E.frameState({}, [1, 2, 3], 0), TypeError);
  assert.throws(() => E.frameState(M, [1, 2], 0), RangeError);
  assert.throws(() => E.frameState(M, [1, NaN, 3], 0), RangeError);
  assert.throws(() => E.frameState(M, [1, 2, 3], -0.01), RangeError);
  assert.throws(() => E.frameState(M, [1, 2, 3], 3.01), RangeError);
  assert.throws(() => E.frameState(M, [1, 2, 3], NaN), RangeError);
});
