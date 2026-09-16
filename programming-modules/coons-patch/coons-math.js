(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoonsMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const LIMITS = Object.freeze({ x: [0, 10], y: [0, 10], z: [-5, 5] });
  const LABELS = Object.freeze(["P00", "P10", "P01", "P11", "C0,1", "C0,2", "C1,1", "C1,2", "D0,1", "D0,2", "D1,1", "D1,2"]);
  const BOUNDARIES = Object.freeze({ C0: [0, 4, 5, 2], C1: [1, 6, 7, 3], D0: [0, 8, 9, 1], D1: [2, 10, 11, 3] });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const clean = (axis, value) => {
    if (!Object.hasOwn(LIMITS, axis) || !Number.isFinite(value)) throw new RangeError("Coordinates must be finite numbers.");
    return Math.round(clamp(value, ...LIMITS[axis]) * 100) / 100;
  };
  function defaults() {
    return [
      { x: 2, y: 2, z: 0 }, { x: 8, y: 2, z: 0 }, { x: 2, y: 8, z: 0 }, { x: 8, y: 8, z: 0 },
      { x: 1.4, y: 4, z: 2 }, { x: 1.4, y: 6, z: 2 }, { x: 8.6, y: 4, z: -1.5 }, { x: 8.6, y: 6, z: -1.5 },
      { x: 4, y: 1.4, z: -1 }, { x: 6, y: 1.4, z: 1 }, { x: 4, y: 8.6, z: 1 }, { x: 6, y: 8.6, z: -1 }
    ];
  }
  function validate(points) {
    if (!Array.isArray(points) || points.length !== 12) throw new RangeError("A cubic Coons patch requires 12 unique boundary control points.");
    for (const point of points) for (const axis of ["x", "y", "z"]) if (!Number.isFinite(point?.[axis])) throw new RangeError("Coordinates must be finite numbers.");
  }
  function bezier(points, t) {
    if (!Array.isArray(points) || points.length !== 4 || !Number.isFinite(t) || t < 0 || t > 1) throw new RangeError("A cubic Bézier curve needs four points and t in [0, 1].");
    const s = 1 - t, weights = [s ** 3, 3 * s * s * t, 3 * s * t * t, t ** 3];
    return ["x", "y", "z"].reduce((out, axis) => ({ ...out, [axis]: points.reduce((sum, p, i) => sum + weights[i] * p[axis], 0) }), {});
  }
  const boundary = (points, name, t) => {
    validate(points);
    if (!Object.hasOwn(BOUNDARIES, name)) throw new RangeError("Unknown boundary curve.");
    return bezier(BOUNDARIES[name].map((index) => points[index]), t);
  };
  function evaluate(points, u, v) {
    validate(points);
    if (![u, v].every((t) => Number.isFinite(t) && t >= 0 && t <= 1)) throw new RangeError("Parameters must lie in [0, 1].");
    const C0 = boundary(points, "C0", v), C1 = boundary(points, "C1", v);
    const D0 = boundary(points, "D0", u), D1 = boundary(points, "D1", u);
    const [P00, P10, P01, P11] = points;
    const result = {};
    for (const axis of ["x", "y", "z"]) {
      const bilinear = (1-u)*(1-v)*P00[axis] + u*(1-v)*P10[axis] + (1-u)*v*P01[axis] + u*v*P11[axis];
      result[axis] = (1-u)*C0[axis] + u*C1[axis] + (1-v)*D0[axis] + v*D1[axis] - bilinear;
    }
    return result;
  }
  function sample(points, divisions = 48) {
    validate(points);
    if (!Number.isInteger(divisions) || divisions < 2 || divisions > 120) throw new RangeError("Invalid mesh resolution.");
    const positions = [], indices = [];
    for (let j = 0; j <= divisions; j++) for (let i = 0; i <= divisions; i++) {
      const p = evaluate(points, i / divisions, j / divisions);
      positions.push(p.x, p.y, p.z);
      if (i < divisions && j < divisions) {
        const a = j * (divisions + 1) + i, b = a + 1, c = a + divisions + 1;
        indices.push(a, b, c, b, c + 1, c);
      }
    }
    return { positions, indices, divisions };
  }
  function boundarySamples(points, divisions = 48) {
    validate(points);
    const result = {};
    for (const name of Object.keys(BOUNDARIES)) result[name] = Array.from({ length: divisions + 1 }, (_, i) => boundary(points, name, i / divisions));
    return result;
  }
  function controlEdges() {
    return Object.values(BOUNDARIES).flatMap((indices) => indices.slice(0, -1).map((a, i) => [a, indices[i + 1]]));
  }
  class Patch {
    constructor() { this.reset(); }
    reset() { this.points = defaults(); this.selected = 4; }
    select(index) { if (!Number.isInteger(index) || index < 0 || index >= this.points.length) return false; this.selected = index; return true; }
    edit(axis, value) { this.points[this.selected][axis] = clean(axis, value); return true; }
  }
  return { LIMITS, LABELS, BOUNDARIES, clamp, defaults, validate, bezier, boundary, evaluate, sample, boundarySamples, controlEdges, Patch };
});
