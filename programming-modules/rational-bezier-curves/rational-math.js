(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RationalBezierMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function construction(radius, degrees) {
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(degrees) || degrees <= 0 || degrees >= 90) {
      throw new RangeError("Use r > 0 and 0 < theta < 90 degrees.");
    }
    const theta = degrees * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
    const controls = [[radius * c, -radius * s, 1], [radius, 0, c], [radius * c, radius * s, 1]];
    const projected = controls.map(project);
    return { radius, degrees, theta, c, s, controls, projected, weights: [1, c, 1],
      vertex: [radius * (1 + c) / 2, 0, (1 + c) / 2] };
  }
  function bernstein(u) {
    if (!Number.isFinite(u) || u < 0 || u > 1) throw new RangeError("Use 0 <= u <= 1.");
    return [(1 - u) ** 2, 2 * u * (1 - u), u * u];
  }
  function lifted(model, u) {
    const b = bernstein(u);
    return [0, 1, 2].map(axis => b.reduce((sum, value, i) => sum + value * model.controls[i][axis], 0));
  }
  function project(point) {
    if (!Number.isFinite(point[2]) || point[2] === 0) throw new RangeError("A point with w = 0 projects to infinity.");
    return [point[0] / point[2], point[1] / point[2], 1];
  }
  function rational(model, u) {
    const b = bernstein(u), weighted = b.map((value, i) => value * model.weights[i]);
    const denominator = weighted.reduce((sum, value) => sum + value, 0);
    return [0, 1, 2].map(axis => weighted.reduce((sum, value, i) => sum + value * model.projected[i][axis], 0) / denominator);
  }
  function sample(model, count = 160) {
    const curve = Array.from({ length: count + 1 }, (_, i) => lifted(model, i / count));
    return { curve, arc: curve.map(project) };
  }
  return { clamp, construction, bernstein, lifted, project, rational, sample };
});
