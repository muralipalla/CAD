(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SurfaceGeometryMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TAU = Math.PI * 2;
  const DEFAULT_MAJOR_RADIUS = 2.4;
  const DEFAULT_MINOR_RADIUS = 0.9;
  const DEFAULT_SPHERE_RADIUS = 2.2;
  const GAUSS_SURFACE_TYPES = Object.freeze({
    elliptic: Object.freeze({ label: "Elliptic paraboloid", curvature: "positive" }),
    cylindrical: Object.freeze({ label: "Parabolic cylinder", curvature: "zero" }),
    saddle: Object.freeze({ label: "Hyperbolic paraboloid", curvature: "negative" }),
    wave: Object.freeze({ label: "Sinusoidal patch", curvature: "mixed" })
  });
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function assertUnit(value, name) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} must be between 0 and 1.`);
  }
  function assertRadii(major, minor) {
    if (!Number.isFinite(major) || !Number.isFinite(minor) || minor <= 0 || major <= minor) {
      throw new RangeError("The major radius must be larger than the positive minor radius.");
    }
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(vector) { return Math.hypot(...vector); }
  function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
  function unit(vector) {
    const length = norm(vector);
    if (!length) throw new RangeError("Cannot normalize a zero vector.");
    return vector.map(value => value / length);
  }

  function spherePlaneCurvature(angleDegrees, radius = DEFAULT_SPHERE_RADIUS) {
    if (!Number.isFinite(angleDegrees) || angleDegrees < 0 || angleDegrees > 85) {
      throw new RangeError("angleDegrees must be between 0 and 85.");
    }
    if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("The sphere radius must be positive.");
    const angle = angleDegrees * Math.PI / 180;
    const sine = Math.sin(angle), cosine = Math.cos(angle);
    const point = [radius, 0, 0], tangentAxis = [0, 1, 0];
    const planeNormal = [sine, 0, cosine];
    const planeConstant = radius * sine;
    const center = planeNormal.map(value => planeConstant * value);
    const rawCircleRadius = radius * Math.abs(cosine);
    const singular = rawCircleRadius < 1e-8;
    const circleRadius = singular ? 0 : rawCircleRadius;
    const radialAtPoint = singular
      ? [0, 0, -1]
      : point.map((value, index) => (value - center[index]) / circleRadius);
    const planeBasisX = radialAtPoint, planeBasisY = tangentAxis;
    const sphereNormal = point.map(value => value / radius);
    const curvature = singular ? [0, 0, 0] : center.map((value, index) => (value - point[index]) / (circleRadius * circleRadius));
    const signedNormalCurvature = singular ? -1 / radius : dot(curvature, sphereNormal);
    const normalCurvature = singular ? [0, 0, 0] : sphereNormal.map(value => signedNormalCurvature * value);
    const geodesicCurvature = singular ? [0, 0, 0] : curvature.map((value, index) => value - normalCurvature[index]);
    return {
      angle,
      angleDegrees,
      radius,
      curveParameter: 0,
      singular,
      tangentAxis,
      planeNormal,
      planeBasisX,
      planeBasisY,
      planeConstant,
      center,
      circleRadius,
      point,
      sphereNormal,
      curvature,
      normalCurvature,
      geodesicCurvature,
      curvatureMagnitude: singular ? Infinity : norm(curvature),
      normalCurvatureMagnitude: 1 / radius,
      geodesicCurvatureMagnitude: singular ? Infinity : norm(geodesicCurvature),
      circleType: singular ? "tangent" : Math.abs(planeConstant) < 1e-9 ? "great" : "small"
    };
  }

  function assertGaussSurfaceType(surfaceType) {
    if (!Object.prototype.hasOwnProperty.call(GAUSS_SURFACE_TYPES, surfaceType)) {
      throw new RangeError(`Unknown Gauss-map surface type: ${surfaceType}.`);
    }
  }
  function gaussSurfaceGeometry(u, v, surfaceType = "elliptic") {
    assertUnit(u, "u"); assertUnit(v, "v");
    assertGaussSurfaceType(surfaceType);
    const x = 3 * (u - 0.5), y = 3 * (v - 0.5);
    let z, dzdx, dzdy;
    if (surfaceType === "elliptic") {
      z = 0.28 * (x * x + y * y) - 0.55; dzdx = 0.56 * x; dzdy = 0.56 * y;
    } else if (surfaceType === "cylindrical") {
      z = 0.38 * x * x - 0.58; dzdx = 0.76 * x; dzdy = 0;
    } else if (surfaceType === "saddle") {
      z = 0.3 * (x * x - y * y); dzdx = 0.6 * x; dzdy = -0.6 * y;
    } else {
      z = 0.34 * Math.sin(1.45 * x) * Math.cos(1.45 * y) - 0.12;
      dzdx = 0.493 * Math.cos(1.45 * x) * Math.cos(1.45 * y);
      dzdy = -0.493 * Math.sin(1.45 * x) * Math.sin(1.45 * y);
    }
    const point = [x, y, z], ru = [3, 0, 3 * dzdx], rv = [0, 3, 3 * dzdy];
    return { point, ru, rv, normal: unit(cross(ru, rv)), surfaceType };
  }
  function gaussSurfacePoint(u, v, surfaceType = "elliptic") {
    return gaussSurfaceGeometry(u, v, surfaceType).point;
  }
  function gaussSurfaceDerivatives(u, v, surfaceType = "elliptic") {
    return gaussSurfaceGeometry(u, v, surfaceType);
  }
  function gaussPatchDomain(u, v, areaFraction) {
    assertUnit(u, "u"); assertUnit(v, "v");
    if (!Number.isFinite(areaFraction) || areaFraction <= 0 || areaFraction > 1) {
      throw new RangeError("areaFraction must be greater than 0 and at most 1.");
    }
    const side = Math.sqrt(areaFraction);
    const uMin = clamp(u - side / 2, 0, 1 - side), vMin = clamp(v - side / 2, 0, 1 - side);
    return { uMin, uMax: uMin + side, vMin, vMax: vMin + side, areaFraction };
  }

  function torusPoint(u, v, major = DEFAULT_MAJOR_RADIUS, minor = DEFAULT_MINOR_RADIUS) {
    assertUnit(u, "u"); assertUnit(v, "v"); assertRadii(major, minor);
    const theta = TAU * u, phi = TAU * v, ring = major + minor * Math.cos(phi);
    return [ring * Math.cos(theta), ring * Math.sin(theta), minor * Math.sin(phi)];
  }
  function torusGeometry(u, v, major = DEFAULT_MAJOR_RADIUS, minor = DEFAULT_MINOR_RADIUS) {
    assertUnit(u, "u"); assertUnit(v, "v"); assertRadii(major, minor);
    const theta = TAU * u, phi = TAU * v, cosine = Math.cos(phi), sine = Math.sin(phi), ring = major + minor * cosine;
    const point = [ring * Math.cos(theta), ring * Math.sin(theta), minor * sine];
    const ru = [-TAU * ring * Math.sin(theta), TAU * ring * Math.cos(theta), 0];
    const rv = [-TAU * minor * sine * Math.cos(theta), -TAU * minor * sine * Math.sin(theta), TAU * minor * cosine];
    const normal = [cosine * Math.cos(theta), cosine * Math.sin(theta), sine];
    const gaussian = cosine / (minor * ring);
    const tolerance = 1e-10;
    const classification = gaussian > tolerance ? "positive" : gaussian < -tolerance ? "negative" : "zero";
    return { point, ru, rv, normal, gaussian, classification, theta, phi };
  }

  function mix(a, b, t) { return a.map((value, index) => value + (b[index] - value) * t); }
  function torusCurvatureColor(v, major = DEFAULT_MAJOR_RADIUS, minor = DEFAULT_MINOR_RADIUS) {
    assertUnit(v, "v"); assertRadii(major, minor);
    const geometry = torusGeometry(0, v, major, minor);
    const zero = [1, 0.72, 0.04], positive = [1, 0.12, 0.045], negative = [0.22, 0.08, 0.82];
    const maximum = geometry.gaussian >= 0
      ? 1 / (minor * (major + minor))
      : 1 / (minor * (major - minor));
    const intensity = Math.sqrt(clamp(Math.abs(geometry.gaussian) / maximum, 0, 1));
    return mix(zero, geometry.gaussian >= 0 ? positive : negative, intensity);
  }

  return {
    TAU,
    DEFAULT_MAJOR_RADIUS,
    DEFAULT_MINOR_RADIUS,
    DEFAULT_SPHERE_RADIUS,
    GAUSS_SURFACE_TYPES,
    clamp,
    cross,
    dot,
    norm,
    unit,
    spherePlaneCurvature,
    gaussSurfaceGeometry,
    gaussSurfacePoint,
    gaussSurfaceDerivatives,
    gaussPatchDomain,
    torusPoint,
    torusGeometry,
    torusCurvatureColor
  };
});
