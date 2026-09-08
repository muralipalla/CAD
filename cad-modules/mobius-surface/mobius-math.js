(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MobiusMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RADIUS = 10;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = vector => Math.hypot(vector[0], vector[1], vector[2]);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];

  function normalize(vector) {
    const length = norm(vector);
    if (!Number.isFinite(length) || length === 0) {
      throw new RangeError("A unit vector requires a finite, nonzero vector.");
    }
    return vector.map(component => component / length);
  }

  function parameters(u, v, options = {}) {
    if (!Number.isFinite(u) || u < 0 || u > 1) {
      throw new RangeError("Use 0 <= u <= 1.");
    }
    if (!Number.isFinite(v)) throw new RangeError("Use a finite angle v in radians.");
    const { length = 2, distance = RADIUS, translation = 1, twists = 1 } = options;
    if (!Number.isFinite(length) || length <= 0) {
      throw new RangeError("Use a finite segment length L > 0.");
    }
    if (!Number.isFinite(distance) || distance <= length / 2) {
      throw new RangeError("Use a finite translation distance d > L / 2.");
    }
    if (!Number.isFinite(translation) || translation < 0 || translation > 1) {
      throw new RangeError("Use a translation progress between 0 and 1.");
    }
    if (!Number.isInteger(twists) || twists < 0 || twists > 3) {
      throw new RangeError("Use an integer number of half-twists from 0 to 3.");
    }
    const t = length * (u - 0.5), sv = Math.sin(v), cv = Math.cos(v);
    // Angle addition avoids overflow in k*v and 2*v for very large finite v.
    let s = 0, c = 1;
    for (let i = 0; i < twists; i++) {
      const nextS = s * cv + c * sv;
      c = c * cv - s * sv;
      s = nextS;
    }
    return { length, distance, translation, twists, t, s, c, s2: 2 * sv * cv, c2: cv * cv - sv * sv, q: distance - t * s };
  }

  function finalPoint(p) {
    return [p.q * p.c2, p.t * p.c, -p.q * p.s2];
  }

  // Right-handed active rotations acting on column vectors:
  // Translate first, then rotate around the parallel z-axis through (d,0,0):
  // T(d)Rz(kv)T(-d)[T(d)L1] = T(d)Rz(kv)L1. Finally apply global Ry(2v).
  // k counts half-turns, so k=1 is the original Mobius strip.
  // Translation progress changes stage 2 only; later stages use the endpoint d.
  function stagePoint(stage, u, v, options) {
    if (!Number.isInteger(stage) || stage < 1 || stage > 5) {
      throw new RangeError("Use an integer construction stage from 1 to 5.");
    }
    const p = parameters(u, v, options);
    if (stage === 1) return [0, p.t, 0];
    if (stage === 2) return [p.translation * p.distance, p.t, 0];
    if (stage === 3) return [p.q, p.t * p.c, 0];
    return finalPoint(p);
  }

  function surface(u, v, options) {
    return finalPoint(parameters(u, v, options));
  }

  function derivatives(u, v, options) {
    const { length, twists, t, s, c, s2, c2, q } = parameters(u, v, options);
    const ru = [-length * s * c2, length * c, length * s * s2];
    const rv = [-twists * t * c * c2 - 2 * q * s2, -twists * t * s, twists * t * c * s2 - 2 * q * c2];
    const normal = [length * (-2 * q * c * c2 + twists * t * s2), -2 * length * q * s, length * (2 * q * c * s2 + twists * t * c2)];
    return { ru, rv, normal, unitNormal: normalize(normal) };
  }

  // One lap is v:0 -> pi. Odd k reverses the normal; even k restores it.
  // Two laps restore the followed normal for every integer k.
  function orientation(laps, options) {
    if (!Number.isFinite(laps) || laps < 0 || laps > 2) {
      throw new RangeError("Use a lap count between 0 and 2.");
    }
    const v = Math.PI * laps;
    const normal = derivatives(0.5, v, options).unitNormal;
    const referenceNormal = [-1, 0, 0];
    return { point: surface(0.5, v, options), normal, referenceNormal, dot: dot(normal, referenceNormal) };
  }

  return { RADIUS, stagePoint, surface, derivatives, orientation, cross, dot, norm, normalize, clamp };
});
