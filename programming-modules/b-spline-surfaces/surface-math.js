(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SurfaceMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const COUNT = 16;
  const KNOTS = Object.freeze([-3, -2, -1, 0, 1, 2, 3, 4]);
  const LIMITS = Object.freeze({ x: [0, 10], y: [0, 10], z: [-5, 5] });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const label = (index) => `P${index % 4}${Math.floor(index / 4)}`;
  function coordinate(axis, value) {
    if (!Number.isFinite(value)) throw new RangeError("Coordinates must be finite numbers.");
    return Math.round(clamp(value, ...LIMITS[axis]) * 100) / 100;
  }
  function basis(t) {
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError("Parameters must lie in [0, 1].");
    return [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6,
      (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  }
  function evaluate(points, u, v) {
    if (points.length !== COUNT) throw new RangeError("A bicubic patch needs 16 control points.");
    const bu = basis(u), bv = basis(v);
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
  function sample(points, divisions = 40) {
    if (!Number.isInteger(divisions) || divisions < 1 || divisions > 120) throw new RangeError("Invalid mesh resolution.");
    const positions = [], indices = [];
    for (let j = 0; j <= divisions; j += 1) {
      for (let i = 0; i <= divisions; i += 1) {
        const p = evaluate(points, i / divisions, j / divisions);
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
  class Capture {
    constructor() { this.clear(); }
    clear() { this.points = []; this.selected = -1; this.pending = false; }
    place(x, y) {
      if (this.pending || this.points.length === COUNT) return false;
      this.points.push({ x: coordinate("x", x), y: coordinate("y", y), z: 0 });
      this.selected = this.points.length - 1;
      this.pending = true;
      return true;
    }
    confirm() {
      if (!this.pending) return false;
      this.pending = false;
      this.selected = this.points.length === COUNT ? COUNT - 1 : -1;
      return true;
    }
    select(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.points.length) return false;
      if (this.pending && index !== this.points.length - 1) return false;
      this.selected = index;
      return true;
    }
    edit(axis, value) {
      if (!(axis in LIMITS) || this.selected < 0) return false;
      this.points[this.selected][axis] = coordinate(axis, value);
      return true;
    }
    undo() {
      if (!this.points.length) return false;
      this.points.pop();
      this.pending = false;
      this.selected = -1;
      return true;
    }
    get confirmed() { return this.points.length - Number(this.pending); }
  }
  return { COUNT, KNOTS, LIMITS, clamp, label, basis, evaluate, sample, netEdges, Capture };
});
