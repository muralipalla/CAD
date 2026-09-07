(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SurfaceMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const COUNT = 16;
  const KNOTS = Object.freeze({
    open: Object.freeze([-3, -2, -1, 0, 1, 2, 3, 4]),
    clamped: Object.freeze([0, 0, 0, 0, 1, 1, 1, 1])
  });
  const LIMITS = Object.freeze({ x: [0, 10], y: [0, 10], z: [-5, 5] });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const label = (index) => `P${index % 4}${Math.floor(index / 4)}`;
  function coordinate(axis, value) {
    if (!Number.isFinite(value)) throw new RangeError("Coordinates must be finite numbers.");
    return Math.round(clamp(value, ...LIMITS[axis]) * 100) / 100;
  }
  function basis(t, mode = "clamped") {
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError("Parameters must lie in [0, 1].");
    if (!Object.hasOwn(KNOTS, mode)) throw new RangeError("Unknown boundary mode.");
    if (mode === "clamped") return [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
    return [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6,
      (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  }
  function evaluate(points, u, v, mode = "clamped") {
    if (points.length !== COUNT) throw new RangeError("A bicubic patch needs 16 control points.");
    const bu = basis(u, mode), bv = basis(v, mode);
    const result = { x: 0, y: 0, z: 0 };
    for (let j = 0; j < 4; j += 1) {
      for (let i = 0; i < 4; i += 1) {
        const point = points[4 * j + i], weight = bu[i] * bv[j];
        for (const axis of ["x", "y", "z"]) {
          if (!Number.isFinite(point[axis])) throw new RangeError("Coordinates must be finite numbers.");
          result[axis] += weight * point[axis];
        }
      }
    }
    return result;
  }
  function sample(points, divisions = 40, mode = "clamped") {
    if (!Number.isInteger(divisions) || divisions < 1 || divisions > 120) throw new RangeError("Invalid mesh resolution.");
    const positions = [], indices = [];
    for (let j = 0; j <= divisions; j += 1) {
      for (let i = 0; i <= divisions; i += 1) {
        const p = evaluate(points, i / divisions, j / divisions, mode);
        positions.push(p.x, p.y, p.z);
        if (j < divisions && i < divisions) {
          const a = j * (divisions + 1) + i, b = a + 1, c = a + divisions + 1;
          indices.push(a, b, c, b, c + 1, c);
        }
      }
    }
    return { positions, indices };
  }
  function netEdges(count) {
    const edges = [];
    for (let index = 0; index < count; index += 1) {
      if (index % 4 < 3 && index + 1 < count) edges.push([index, index + 1]);
      if (index + 4 < count) edges.push([index, index + 4]);
    }
    return edges;
  }
  function squareGrid() {
    return Array.from({ length: COUNT }, (_, index) => ({ x: 2 + 2 * (index % 4), y: 2 + 2 * Math.floor(index / 4), z: 0 }));
  }
  class Grid {
    constructor() { this.mode = "clamped"; this.reset(); }
    reset() { this.points = squareGrid(); this.selected = 0; }
    setMode(mode) {
      if (!Object.hasOwn(KNOTS, mode)) throw new RangeError("Unknown boundary mode.");
      this.mode = mode;
    }
    select(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.points.length) return false;
      this.selected = index;
      return true;
    }
    edit(axis, value) {
      if (!Object.hasOwn(LIMITS, axis) || this.selected < 0) return false;
      this.points[this.selected][axis] = coordinate(axis, value);
      return true;
    }
  }
  return { COUNT, KNOTS, LIMITS, clamp, label, basis, evaluate, sample, netEdges, squareGrid, Grid };
});
