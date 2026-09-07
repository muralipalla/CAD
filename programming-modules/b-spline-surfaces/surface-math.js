(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SurfaceMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const GRID_SIZES = Object.freeze([4, 5, 6]);
  const LIMITS = Object.freeze({ x: [0, 10], y: [0, 10], z: [-5, 5] });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const label = (index, size = 4) => `P${index % size}${Math.floor(index / size)}`;
  function validate(size, order, mode) {
    if (!GRID_SIZES.includes(size)) throw new RangeError("Choose a 4, 5 or 6 point grid in each direction.");
    if (!Number.isInteger(order) || order < 2 || order > size) throw new RangeError("Order must be between 2 and the grid size.");
    if (!["open", "clamped"].includes(mode)) throw new RangeError("Unknown boundary mode.");
  }
  function knots(size = 4, order = 4, mode = "clamped") {
    validate(size, order, mode);
    const spans = size - order + 1;
    return Array.from({ length: size + order }, (_, i) => mode === "open"
      ? (i - order + 1) / spans
      : i < order ? 0 : i >= size ? 1 : (i - order + 1) / spans);
  }
  function coordinate(axis, value) {
    if (!Number.isFinite(value)) throw new RangeError("Coordinates must be finite numbers.");
    return Math.round(clamp(value, ...LIMITS[axis]) * 100) / 100;
  }
  function basis(t, mode = "clamped", size = 4, order = 4) {
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError("Parameters must lie in [0, 1].");
    const U = knots(size, order, mode);
    // Use the left limit of the final active span at the closed domain endpoint.
    let values = Array.from({ length: U.length - 1 }, (_, i) => Number(t === 1 ? i === size - 1 : U[i] <= t && t < U[i + 1]));
    for (let currentOrder = 2; currentOrder <= order; currentOrder += 1) {
      values = Array.from({ length: values.length - 1 }, (_, i) => {
        const left = U[i + currentOrder - 1] - U[i], right = U[i + currentOrder] - U[i + 1];
        return (left ? (t - U[i]) / left * values[i] : 0)
          + (right ? (U[i + currentOrder] - t) / right * values[i + 1] : 0);
      });
    }
    return values;
  }
  function combine(points, bu, bv, size) {
    const result = { x: 0, y: 0, z: 0 };
    for (let j = 0; j < size; j += 1) {
      for (let i = 0; i < size; i += 1) {
        const point = points[size * j + i], weight = bu[i] * bv[j];
        for (const axis of ["x", "y", "z"]) {
          if (!Number.isFinite(point[axis])) throw new RangeError("Coordinates must be finite numbers.");
          result[axis] += weight * point[axis];
        }
      }
    }
    return result;
  }
  function evaluate(points, u, v, mode = "clamped", order = 4) {
    const size = Math.sqrt(points.length);
    return combine(points, basis(u, mode, size, order), basis(v, mode, size, order), size);
  }
  function sample(points, divisions = 60, mode = "clamped", order = 4) {
    if (!Number.isInteger(divisions) || divisions < 1 || divisions > 120) throw new RangeError("Invalid mesh resolution.");
    const size = Math.sqrt(points.length);
    validate(size, order, mode);
    const spans = size - order + 1;
    divisions = spans * Math.ceil(divisions / spans); // Include every interior knot.
    const bases = Array.from({ length: divisions + 1 }, (_, i) => basis(i / divisions, mode, size, order));
    const positions = [], indices = [];
    for (let j = 0; j <= divisions; j += 1) {
      for (let i = 0; i <= divisions; i += 1) {
        const p = combine(points, bases[i], bases[j], size);
        positions.push(p.x, p.y, p.z);
        if (j < divisions && i < divisions) {
          const a = j * (divisions + 1) + i, b = a + 1, c = a + divisions + 1;
          indices.push(a, b, c, b, c + 1, c);
        }
      }
    }
    return { positions, indices, divisions };
  }
  function netEdges(count, size = Math.sqrt(count)) {
    const edges = [];
    for (let index = 0; index < count; index += 1) {
      if (index % size < size - 1 && index + 1 < count) edges.push([index, index + 1]);
      if (index + size < count) edges.push([index, index + size]);
    }
    return edges;
  }
  function squareGrid(size = 4) {
    validate(size, 2, "clamped");
    return Array.from({ length: size * size }, (_, index) => ({ x: coordinate("x", 2 + 6 * (index % size) / (size - 1)), y: coordinate("y", 2 + 6 * Math.floor(index / size) / (size - 1)), z: 0 }));
  }
  class Grid {
    constructor() { this.mode = "clamped"; this.size = 4; this.order = 4; this.reset(); }
    reset() { this.points = squareGrid(this.size); this.selected = 0; }
    setSize(size) {
      const order = Math.min(this.order, size);
      validate(size, order, this.mode);
      if (size === this.size) return;
      this.size = size; this.order = order; this.reset();
    }
    setOrder(order) { validate(this.size, order, this.mode); this.order = order; }
    setMode(mode) {
      validate(this.size, this.order, mode);
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
  return { GRID_SIZES, LIMITS, clamp, label, knots, basis, evaluate, sample, netEdges, squareGrid, Grid };
});
