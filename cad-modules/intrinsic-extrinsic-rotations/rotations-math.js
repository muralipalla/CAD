(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RotationMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // All matrices are row-major arrays acting actively on column vectors.
  function finiteArray(values, size, name) {
    if ((!Array.isArray(values) && !ArrayBuffer.isView(values)) || values.length !== size ||
      Array.from(values).some(value => !Number.isFinite(value))) {
      throw new RangeError(name + " must contain " + size + " finite numbers.");
    }
  }

  function identity() {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  function multiply(A, B) {
    finiteArray(A, 9, "Matrix A");
    finiteArray(B, 9, "Matrix B");
    const result = new Array(9).fill(0);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        for (let k = 0; k < 3; k++) result[3 * row + column] += A[3 * row + k] * B[3 * k + column];
      }
    }
    return result;
  }

  function axisName(axis) {
    if (typeof axis !== "string" || !/^[xyz]$/i.test(axis)) {
      throw new RangeError("Use the axis x, y, or z.");
    }
    return axis.toUpperCase();
  }

  function rotation(axis, angleDegrees) {
    const name = axisName(axis);
    if (!Number.isFinite(angleDegrees)) throw new RangeError("Use a finite angle in degrees.");
    // Reduce before converting to radians so every finite degree input is valid.
    const reduced = angleDegrees % 360;
    const quarterTurns = reduced / 90;
    let c, s;
    if (Number.isInteger(quarterTurns)) {
      const index = ((quarterTurns % 4) + 4) % 4;
      c = [1, 0, -1, 0][index];
      s = [0, 1, 0, -1][index];
    } else {
      const angle = reduced * Math.PI / 180;
      c = Math.cos(angle); s = Math.sin(angle);
    }
    if (name === "X") return [1, 0, 0, 0, c, -s, 0, s, c];
    if (name === "Y") return [c, 0, s, 0, 1, 0, -s, 0, c];
    return [c, -s, 0, s, c, 0, 0, 0, 1];
  }

  function apply(matrix, vector) {
    finiteArray(matrix, 9, "Matrix");
    finiteArray(vector, 3, "Vector");
    return [0, 1, 2].map(row => matrix[3 * row] * vector[0] + matrix[3 * row + 1] * vector[1] + matrix[3 * row + 2] * vector[2]);
  }

  function sequence(axes, angles, frame, progress) {
    if (typeof axes !== "string" || !/^[xyz]{3}$/i.test(axes)) {
      throw new RangeError("Use three chronological axes, such as XYZ or ZXZ.");
    }
    finiteArray(angles, 3, "Angles");
    if (frame !== "intrinsic" && frame !== "extrinsic") {
      throw new RangeError("Use the frame intrinsic or extrinsic.");
    }
    if (!Number.isFinite(progress) || progress < 0 || progress > 3) {
      throw new RangeError("Use rotation progress from 0 to 3.");
    }
    return axes.toUpperCase();
  }

  function orientation(axes, angles, frame = "intrinsic", progress = 3) {
    const names = sequence(axes, angles, frame, progress);
    let result = identity();
    for (let step = 0; step < 3; step++) {
      const fraction = Math.max(0, Math.min(1, progress - step));
      if (fraction === 0) break;
      const next = rotation(names[step], angles[step] * fraction);
      // Body axes move with Q: (Q R Q^T)Q = Q R. Global axes stay fixed: R Q.
      result = frame === "intrinsic" ? multiply(result, next) : multiply(next, result);
    }
    return result;
  }

  function activeAxis(axes, angles, frame = "intrinsic", progress = 3) {
    const names = sequence(axes, angles, frame, progress);
    // At a join select the next step; at completion retain the last step's axis.
    const step = Math.min(2, Math.floor(progress));
    const axis = [0, 0, 0];
    axis["XYZ".indexOf(names[step])] = 1;
    if (frame === "extrinsic") return axis;
    // Rotating about this axis does not change its own direction during the step.
    return apply(orientation(names, angles, frame, step), axis);
  }

  function reverseSequence(axes, angles) {
    const names = sequence(axes, angles, "intrinsic", 3);
    return { axes: names.split("").reverse().join(""), angles: Array.from(angles).reverse() };
  }

  function properRotation(matrix, name) {
    finiteArray(matrix, 9, name);
    const tolerance = 1e-7;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let inner = 0;
        for (let row = 0; row < 3; row++) inner += matrix[3 * row + i] * matrix[3 * row + j];
        if (Math.abs(inner - (i === j ? 1 : 0)) > tolerance) {
          throw new RangeError(name + " must be a proper rotation matrix.");
        }
      }
    }
    const m = matrix;
    const determinant = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    if (Math.abs(determinant - 1) > tolerance) throw new RangeError(name + " must have determinant +1.");
  }

  function differenceDegrees(A, B) {
    properRotation(A, "Orientation A");
    properRotation(B, "Orientation B");
    const transposeA = [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
    const relative = multiply(transposeA, B);
    const cosine = Math.max(-1, Math.min(1, (relative[0] + relative[4] + relative[8] - 1) / 2));
    const sine = Math.hypot(relative[7] - relative[5], relative[2] - relative[6], relative[3] - relative[1]) / 2;
    // atan2 retains small-angle information that acos(trace) can round away.
    return Math.atan2(sine, cosine) * 180 / Math.PI;
  }

  return { identity, multiply, rotation, apply, orientation, activeAxis, reverseSequence, differenceDegrees };
});
