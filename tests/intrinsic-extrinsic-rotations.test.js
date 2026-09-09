const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "../cad-modules/intrinsic-extrinsic-rotations/rotations-math.js");
const source = fs.readFileSync(sourcePath, "utf8");
// Load the same UMD implementation used by the interactive page.
const mathModule = { exports: {} };
vm.runInThisContext("(function(module, exports) {\n" + source + "\n})", { filename: sourcePath })(mathModule, mathModule.exports);
const M = mathModule.exports;

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
}
function vectorNear(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => near(value, expected[index], tolerance));
}
const transpose = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const determinant = m => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((total, value, index) => total + value * b[index], 0);
const unit = axis => "XYZ".split("").map(name => name === axis ? 1 : 0);

// Independent world-axis Rodrigues construction, applied directly to a vector.
function rotateVector(vector, axis, degrees) {
  const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const perpendicular = cross(axis, vector), projection = dot(axis, vector);
  return vector.map((value, i) => c * value + s * perpendicular[i] + (1 - c) * projection * axis[i]);
}

const sequences = ["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX", "XYX", "ZXZ", "XXX"];
const angleSets = [[20, 50, -35], [90, 90, 90], [-135, 275, -450], [0, 0, 0]];

test("UMD supports browser and CommonJS loading, with independent identity arrays", () => {
  const browser = vm.createContext({});
  vm.runInContext(source, browser, { filename: sourcePath });
  assert.equal(typeof browser.RotationMath.orientation, "function");
  vectorNear(Array.from(browser.RotationMath.apply(browser.RotationMath.rotation("z", 90), [1, 0, 0])), [0, 1, 0]);
  vectorNear(M.identity(), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const changed = M.identity(); changed[0] = 4;
  assert.equal(M.identity()[0], 1);
});

test("elementary rotations use the active right-hand rule on known 90-degree vectors", () => {
  vectorNear(M.apply(M.rotation("X", 90), [0, 1, 0]), [0, 0, 1], 0);
  vectorNear(M.apply(M.rotation("y", 90), [0, 0, 1]), [1, 0, 0], 0);
  vectorNear(M.apply(M.rotation("z", 90), [1, 0, 0]), [0, 1, 0], 0);
  vectorNear(M.apply(M.rotation("Y", 90), [1, 0, 0]), [0, 0, -1], 0);
  vectorNear(M.apply(M.rotation("z", -90), [1, 0, 0]), [0, -1, 0], 0);
  vectorNear(M.rotation("X", 360), M.identity(), 0);
  vectorNear(M.rotation("Z", -450), M.rotation("Z", -90), 0);
});

test("row-major multiplication acts in column-vector composition order without mutating inputs", () => {
  const A = [1, 2, 3, 0, 1, 4, 5, 6, 0], B = [-2, 1, 0, 3, 0, 0, 4, 5, 1];
  const savedA = A.slice(), savedB = B.slice();
  vectorNear(M.multiply(A, B), [16, 16, 3, 19, 20, 4, 8, 5, 0], 0);
  vectorNear(M.apply(M.multiply(A, B), [2, -1, 3]), M.apply(A, M.apply(B, [2, -1, 3])), 0);
  assert.deepEqual(A, savedA); assert.deepEqual(B, savedB);
  vectorNear(M.apply(new Float64Array(M.identity()), new Float64Array([2, 4, 6])), [2, 4, 6], 0);
});

test("intrinsic and extrinsic chronological XY rotations have different known outcomes", () => {
  const intrinsic = M.orientation("XYZ", [90, 90, 0], "intrinsic");
  const extrinsic = M.orientation("XYZ", [90, 90, 0], "extrinsic");
  vectorNear(M.apply(intrinsic, [0, 0, 1]), [1, 0, 0], 0);
  vectorNear(M.apply(extrinsic, [0, 0, 1]), [0, -1, 0], 0);
  vectorNear(M.apply(intrinsic, [1, 0, 0]), [0, 1, 0], 0);
  vectorNear(M.apply(extrinsic, [1, 0, 0]), [0, 0, -1], 0);
  near(M.differenceDegrees(intrinsic, extrinsic), 120);
});

test("reversing angle-axis pairs gives the same final orientation without negating angles", () => {
  for (const axes of sequences) {
    for (const angles of angleSets) {
      const original = angles.slice(), reversed = M.reverseSequence(axes.toLowerCase(), angles);
      assert.equal(reversed.axes, axes.split("").reverse().join(""));
      assert.deepEqual(reversed.angles, original.slice().reverse());
      assert.deepEqual(angles, original);
      for (const frame of ["intrinsic", "extrinsic"]) {
        const otherFrame = frame === "intrinsic" ? "extrinsic" : "intrinsic";
        const A = M.orientation(axes, angles, frame), B = M.orientation(reversed.axes, reversed.angles, otherFrame);
        vectorNear(A, B);
        near(M.differenceDegrees(A, B), 0);
      }
    }
  }
  const reversed = M.reverseSequence("XYZ", [20, 50, -35]);
  assert.ok(M.differenceDegrees(M.orientation("XYZ", [20, 50, -35], "intrinsic", 1), M.orientation(reversed.axes, reversed.angles, "extrinsic", 1)) > 10);
});

test("all intermediate orientations remain orthogonal with determinant +1", () => {
  for (const axes of sequences) {
    for (const angles of angleSets) {
      for (const frame of ["intrinsic", "extrinsic"]) {
        for (const progress of [0, 0.37, 1, 1.6, 2, 2.8, 3]) {
          const result = M.orientation(axes, angles, frame, progress);
          vectorNear(M.multiply(transpose(result), result), M.identity());
          near(determinant(result), 1);
          near(Math.hypot(...M.apply(result, [2, -3, 6])), 7);
        }
      }
    }
  }
});

test("fractional progress follows an independent Rodrigues rotation about the current world axis", () => {
  for (const axes of sequences) {
    for (const frame of ["intrinsic", "extrinsic"]) {
      const angles = [65, -40, 125], probe = [0.3, -0.4, 1.2];
      for (let step = 0; step < 3; step++) {
        const before = M.orientation(axes, angles, frame, step);
        const worldAxis = frame === "intrinsic" ? M.apply(before, unit(axes[step])) : unit(axes[step]);
        for (const fraction of [0.2, 0.5, 0.85]) {
          const progress = step + fraction;
          vectorNear(M.activeAxis(axes, angles, frame, progress), worldAxis);
          const expected = rotateVector(M.apply(before, probe), worldAxis, angles[step] * fraction);
          vectorNear(M.apply(M.orientation(axes, angles, frame, progress), probe), expected);
        }
      }
    }
  }
});

test("activeAxis changes to the next stage at joins and retains the third-stage axis at completion", () => {
  const angles = [90, 90, 90];
  vectorNear(M.activeAxis("XYZ", angles, "intrinsic", 0), [1, 0, 0], 0);
  vectorNear(M.activeAxis("XYZ", angles, "intrinsic", 1), [0, 0, 1], 0);
  vectorNear(M.activeAxis("XYZ", angles, "intrinsic", 1.6), [0, 0, 1], 0);
  vectorNear(M.activeAxis("XYZ", angles, "intrinsic", 2), [1, 0, 0], 0);
  vectorNear(M.activeAxis("XYZ", angles, "intrinsic", 3), [1, 0, 0], 0);
  vectorNear(M.activeAxis("XYZ", angles, "extrinsic", 1), [0, 1, 0], 0);
  vectorNear(M.activeAxis("XYZ", angles, "extrinsic", 3), [0, 0, 1], 0);
});

test("partial progress completes only the chronological prefix and stays continuous at joins", () => {
  const angles = [40, -70, 120];
  for (const frame of ["intrinsic", "extrinsic"]) {
    vectorNear(M.orientation("XYZ", angles, frame, 0), M.identity(), 0);
    vectorNear(M.orientation("XYZ", angles, frame, 0.5), M.rotation("X", 20));
    vectorNear(M.orientation("XYZ", angles, frame, 1), M.rotation("X", 40));
    const expected = frame === "intrinsic" ? M.multiply(M.rotation("X", 40), M.rotation("Y", -35)) : M.multiply(M.rotation("Y", -35), M.rotation("X", 40));
    vectorNear(M.orientation("XYZ", angles, frame, 1.5), expected);
    for (const join of [1, 2]) {
      assert.ok(M.differenceDegrees(M.orientation("XYZ", angles, frame, join - 1e-8), M.orientation("XYZ", angles, frame, join + 1e-8)) < 0.00001);
    }
  }
});

test("repeated axes and negative angles work, including equivalent same-axis accumulation", () => {
  for (const frame of ["intrinsic", "extrinsic"]) {
    vectorNear(M.orientation("xxx", [-45, 120, -30], frame), M.rotation("X", 45));
    vectorNear(M.orientation("ZZZ", [-45, 120, -30], frame, 1.5), M.rotation("Z", 15));
  }
});

test("angular distance is stable near zero and 180 degrees, symmetric, and frame-independent", () => {
  for (const degrees of [0, 1e-10, 0.001, 30, 90, 179.99999999, 180, 270, -75]) {
    const expected = Math.min(((degrees % 360) + 360) % 360, 360 - (((degrees % 360) + 360) % 360));
    near(M.differenceDegrees(M.identity(), M.rotation("Z", degrees)), expected, 1e-10);
  }
  near(M.differenceDegrees(M.identity(), M.rotation("X", 1e-10)), 1e-10, 1e-20);
  const A = M.orientation("XYZ", [35, 60, -20]), B = M.orientation("ZYX", [-80, 15, 40]);
  const C = M.orientation("XYX", [-55, 75, 30]);
  const distance = M.differenceDegrees(A, B);
  near(distance, M.differenceDegrees(B, A));
  near(distance, M.differenceDegrees(M.multiply(C, A), M.multiply(C, B)));
  near(distance, M.differenceDegrees(M.multiply(A, C), M.multiply(B, C)));
  near(M.differenceDegrees(A, A), 0, 0);
});

test("validation rejects invalid data and non-rotation distances while allowing finite degree inputs", () => {
  for (const axis of ["", "XY", "a", 0, null]) assert.throws(() => M.rotation(axis, 30), RangeError);
  for (const angle of [NaN, Infinity, -Infinity, "30", null]) assert.throws(() => M.rotation("X", angle), RangeError);
  for (const axes of ["", "XY", "XYZX", "XQZ", null]) assert.throws(() => M.orientation(axes, [1, 2, 3]), RangeError);
  for (const angles of [[1, 2], [1, 2, Infinity], [1, "2", 3], null]) {
    assert.throws(() => M.orientation("XYZ", angles), RangeError);
    assert.throws(() => M.reverseSequence("XYZ", angles), RangeError);
  }
  for (const frame of ["local", "global", "Intrinsic", null]) assert.throws(() => M.orientation("XYZ", [1, 2, 3], frame), RangeError);
  for (const progress of [-0.1, 3.1, NaN, Infinity, "1", null]) {
    assert.throws(() => M.orientation("XYZ", [1, 2, 3], "intrinsic", progress), RangeError);
    assert.throws(() => M.activeAxis("XYZ", [1, 2, 3], "intrinsic", progress), RangeError);
  }
  assert.throws(() => M.multiply([1, 2], M.identity()), RangeError);
  assert.throws(() => M.apply(M.identity(), [0, 1, NaN]), RangeError);
  assert.throws(() => M.differenceDegrees(M.identity(), [1, 0, 0, 0, 1, 0, 0, 0, -1]), RangeError);
  assert.throws(() => M.differenceDegrees(M.identity(), M.identity().map(value => value * 2)), RangeError);
  for (const degrees of [Number.MAX_VALUE, -Number.MAX_VALUE]) {
    const result = M.rotation("X", degrees);
    assert.ok(result.every(Number.isFinite));
    near(determinant(result), 1);
  }
});
