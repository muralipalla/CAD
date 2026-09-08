(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RationalBezierMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function construction(radius, degrees) {
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(degrees) || degrees < 0 || degrees > 180) {
      throw new RangeError("Use r > 0 and 0 <= theta <= 180 degrees.");
    }
    const theta = degrees * Math.PI / 180;
    const c = degrees === 90 ? 0 : Math.cos(theta), s = degrees === 180 ? 0 : Math.sin(theta);
    const a = degrees === 180 ? 0 : Math.cos(theta / 2), b = Math.sin(theta / 2);
    const controls = [[radius * c, -radius * s, 1], [radius, 0, c], [radius * c, radius * s, 1]];
    const projected = controls.map(p => p[2] === 0 ? null : project(p));
    return { radius, degrees, theta, c, s, a, b, controls, projected, weights: [1, c, 1],
      vertex: [radius * a * a, 0, a * a] };
  }
  function bernstein(u) {
    if (!Number.isFinite(u) || u < 0 || u > 1) throw new RangeError("Use 0 <= u <= 1.");
    return [(1 - u) ** 2, 2 * u * (1 - u), u * u];
  }
  function lifted(model, u) {
    bernstein(u);
    // Equivalent to Bernstein blending; avoids cancellation near theta = 180.
    const t = 2 * u - 1, a2 = model.a * model.a, q = model.b * t;
    return [model.radius * (a2 - q * q), 2 * model.radius * model.a * q, a2 + q * q];
  }
  function project(point) {
    if (!Number.isFinite(point[2]) || point[2] === 0) throw new RangeError("A point with w = 0 projects to infinity.");
    return [point[0] / point[2], point[1] / point[2], 1];
  }
  function rational(model, u) {
    bernstein(u);
    const q = model.b * (2 * u - 1), scale = Math.max(model.a, Math.abs(q));
    if (scale === 0) return null; // theta = 180, u = 1/2: the apex cannot be projected.
    const A = model.a / scale, B = q / scale, denominator = A * A + B * B;
    return [model.radius * (A * A - B * B) / denominator, 2 * model.radius * A * B / denominator, 1];
  }
  function sample(model, count = 160) {
    if (model.degrees === 0) return { curve: [model.controls[0]], arc: [model.projected[0]] };
    const uniform = Array.from({ length: count + 1 }, (_, i) => i / count);
    if (model.degrees === 180) return { curve: uniform.map(u => lifted(model, u)), arc: [model.projected[0]] };
    // Include uniform polar-angle samples: major arcs change very rapidly near u=1/2.
    const angleParameters = uniform.map((fraction, i) => i === 0 ? 0 : i === count ? 1
      : clamp((1 + model.a / model.b * Math.tan(model.theta * (fraction - 0.5))) / 2, 0, 1));
    const parameters = [...new Set([...uniform, ...angleParameters])].sort((a, b) => a - b);
    return { curve: parameters.map(u => lifted(model, u)), arc: parameters.map(u => rational(model, u)) };
  }
  return { clamp, construction, bernstein, lifted, project, rational, sample };
});
