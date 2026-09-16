(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Transform2DMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EPSILON = 1e-9;
  const PRESETS = Object.freeze({
    identity: Object.freeze({ label: "Identity", matrix: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) }),
    scale: Object.freeze({ label: "Non-uniform scale", matrix: Object.freeze([1.6, 0, 0, 0, 0.7, 0, 0, 0, 1]) }),
    shearX: Object.freeze({ label: "Shear in x", matrix: Object.freeze([1, 0.75, 0, 0, 1, 0, 0, 0, 1]) }),
    shearY: Object.freeze({ label: "Shear in y", matrix: Object.freeze([1, 0, 0, -0.55, 1, 0, 0, 0, 1]) }),
    rotate30: Object.freeze({ label: "Rotate 30°", matrix: Object.freeze([Math.sqrt(3) / 2, -0.5, 0, 0.5, Math.sqrt(3) / 2, 0, 0, 0, 1]) }),
    translate: Object.freeze({ label: "Translate", matrix: Object.freeze([1, 0, 1.75, 0, 1, 1.25, 0, 0, 1]) }),
    reflectX: Object.freeze({ label: "Reflect in x-axis", matrix: Object.freeze([1, 0, 0, 0, -1, 0, 0, 0, 1]) }),
    reflectY: Object.freeze({ label: "Reflect in y-axis", matrix: Object.freeze([-1, 0, 0, 0, 1, 0, 0, 0, 1]) }),
    reflectDiagonal: Object.freeze({ label: "Reflect in y = x", matrix: Object.freeze([0, 1, 0, 1, 0, 0, 0, 0, 1]) }),
    projective: Object.freeze({ label: "Projective tilt · advanced", matrix: Object.freeze([1, 0, 0, 0, 1, 0, 0.12, -0.06, 1]) })
  });

  function validateMatrix(matrix) {
    if (!Array.isArray(matrix) || matrix.length !== 9 || matrix.some((value) => !Number.isFinite(value))) {
      throw new RangeError("A transformation matrix must contain nine finite numbers.");
    }
  }

  function canonicalMatrix(matrix) {
    validateMatrix(matrix);
    const maximum = Math.max(...matrix.map(Math.abs));
    if (maximum === 0) return [...matrix];
    const homogeneousScale = Math.abs(matrix[8]);
    const affineLastRow = homogeneousScale > 0 && Math.abs(matrix[6]) <= EPSILON * homogeneousScale && Math.abs(matrix[7]) <= EPSILON * homogeneousScale;
    const scale = affineLastRow ? matrix[8] : matrix.find((value) => Math.abs(value) === maximum);
    return matrix.map((value) => value / scale);
  }

  function identity() { return [...PRESETS.identity.matrix]; }

  function preset(name) {
    if (!Object.hasOwn(PRESETS, name)) throw new RangeError("Unknown transformation preset.");
    return [...PRESETS[name].matrix];
  }

  function multiply(left, right) {
    validateMatrix(left); validateMatrix(right);
    return Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3), column = index % 3;
      return [0, 1, 2].reduce((sum, k) => sum + left[3 * row + k] * right[3 * k + column], 0);
    });
  }

  function translation(tx, ty) {
    if (![tx, ty].every(Number.isFinite)) throw new RangeError("Translation coordinates must be finite numbers.");
    return [1, 0, tx, 0, 1, ty, 0, 0, 1];
  }

  function rotation(degrees) {
    if (!Number.isFinite(degrees)) throw new RangeError("A rotation angle must be finite.");
    const normalizedDegrees = degrees % 360;
    let cosine, sine;
    if (normalizedDegrees % 90 === 0) {
      const cardinalValues = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      [cosine, sine] = cardinalValues[((normalizedDegrees / 90) % 4 + 4) % 4];
    } else {
      const radians = normalizedDegrees * Math.PI / 180;
      cosine = Math.cos(radians); sine = Math.sin(radians);
    }
    return [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
  }

  function scaling(scaleX, scaleY = scaleX) {
    if (![scaleX, scaleY].every(Number.isFinite)) throw new RangeError("Scale factors must be finite numbers.");
    return [scaleX, 0, 0, 0, scaleY, 0, 0, 0, 1];
  }

  function aboutPoint(originTransform, center) {
    validateMatrix(originTransform); validatePoint(center);
    const [centerX, centerY] = center;
    return multiply(translation(centerX, centerY), multiply(originTransform, translation(-centerX, -centerY)));
  }

  function cumulativeMatrices(operators) {
    if (!Array.isArray(operators)) throw new RangeError("Operators must be an array of matrices.");
    const states = [identity()];
    for (const operator of operators) {
      validateMatrix(operator);
      states.push(multiply(operator, states.at(-1)));
    }
    return states;
  }

  function aboutPointStages(originTransform, center) {
    validateMatrix(originTransform); validatePoint(center);
    const [centerX, centerY] = center;
    const operators = [translation(-centerX, -centerY), [...originTransform], translation(centerX, centerY)];
    return { operators: operators.map((operator) => [...operator]), states: cumulativeMatrices(operators) };
  }

  function referenceFrameStages(originTransform, center, degrees = 0) {
    validateMatrix(originTransform); validatePoint(center);
    if (!Number.isFinite(degrees)) throw new RangeError("A reference-frame angle must be finite.");
    const [centerX, centerY] = center;
    const operators = [translation(-centerX, -centerY), rotation(-degrees), [...originTransform], rotation(degrees), translation(centerX, centerY)];
    return { operators: operators.map((operator) => [...operator]), states: cumulativeMatrices(operators) };
  }

  function aboutFrame(originTransform, center, degrees = 0) {
    return referenceFrameStages(originTransform, center, degrees).states.at(-1);
  }

  function reflectionAboutLine(center, degrees) {
    return aboutFrame(preset("reflectX"), center, degrees);
  }

  function validatePoint(point) {
    if (!Array.isArray(point) || point.length !== 2 || point.some((value) => !Number.isFinite(value))) {
      throw new RangeError("A point must contain two finite coordinates.");
    }
  }

  function homogeneousUnchecked(matrix, point) {
    const [x, y] = point;
    return [matrix[0] * x + matrix[1] * y + matrix[2], matrix[3] * x + matrix[4] * y + matrix[5], matrix[6] * x + matrix[7] * y + matrix[8]];
  }

  function homogeneous(matrix, point) {
    const normalized = canonicalMatrix(matrix);
    validatePoint(point);
    return homogeneousUnchecked(normalized, point);
  }

  function transformPoint(matrix, point, epsilon = EPSILON) {
    const normalized = canonicalMatrix(matrix);
    validatePoint(point);
    const [x, y, w] = homogeneousUnchecked(normalized, point);
    const denominatorScale = Math.abs(normalized[6] * point[0]) + Math.abs(normalized[7] * point[1]) + Math.abs(normalized[8]);
    const threshold = epsilon * denominatorScale;
    if (Math.abs(w) <= threshold) return null;
    const result = [x / w, y / w];
    return result.every(Number.isFinite) ? result : null;
  }

  function transformPath(matrix, points, epsilon = EPSILON) {
    const normalized = canonicalMatrix(matrix);
    if (!Array.isArray(points)) throw new RangeError("A path must be an array of points.");
    const paths = [];
    let path = [], previousW = null;
    function finish() { if (path.length > 1) paths.push(path); path = []; }
    for (const point of points) {
      validatePoint(point);
      const h = homogeneousUnchecked(normalized, point), w = h[2];
      const denominatorScale = Math.abs(normalized[6] * point[0]) + Math.abs(normalized[7] * point[1]) + Math.abs(normalized[8]);
      const threshold = epsilon * denominatorScale;
      if (Math.abs(w) <= threshold || (previousW !== null && previousW * w < 0)) {
        finish(); previousW = w; continue;
      }
      const transformed = [h[0] / w, h[1] / w];
      if (!transformed.every(Number.isFinite)) finish();
      else path.push(transformed);
      previousW = w;
    }
    finish();
    return paths;
  }

  function determinant(matrix) {
    validateMatrix(matrix);
    const [a, b, c, d, e, f, g, h, i] = matrix;
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  }

  function classify(matrix) {
    const normalized = canonicalMatrix(matrix), det = determinant(normalized);
    const affine = Math.abs(normalized[6]) <= EPSILON && Math.abs(normalized[7]) <= EPSILON && Math.abs(normalized[8] - 1) <= EPSILON;
    return { kind: affine ? "affine" : "projective", determinant: det, singular: Math.abs(det) <= EPSILON,
      orientation: Math.abs(det) <= EPSILON ? "collapsed" : det > 0 ? "preserved" : "reversed" };
  }

  function makeGrid(extent = 3, step = 0.5, samples = 48) {
    if (![extent, step].every((value) => Number.isFinite(value) && value > 0) || !Number.isInteger(samples) || samples < 2) throw new RangeError("Invalid grid settings.");
    const lines = [], count = Math.round(2 * extent / step);
    for (let n = 0; n <= count; n += 1) {
      const fixed = -extent + n * step;
      lines.push(Array.from({ length: samples + 1 }, (_, k) => [fixed, -extent + 2 * extent * k / samples]));
      lines.push(Array.from({ length: samples + 1 }, (_, k) => [-extent + 2 * extent * k / samples, fixed]));
    }
    return lines;
  }

  function sampleCurve(name, count = 160) {
    if (!Number.isInteger(count) || count < 8 || count > 500) throw new RangeError("Invalid curve sample count.");
    if (name === "circle") return [Array.from({ length: count + 1 }, (_, i) => { const t = 2 * Math.PI * i / count; return [2.2 * Math.cos(t), 2.2 * Math.sin(t)]; })];
    throw new RangeError("Unknown curve.");
  }

  function geometry(name) { return name === "grid" ? makeGrid() : sampleCurve(name); }

  function makeViewport(width, height, zoomPercent = 100, baseSpan = 4) {
    if (![width, height, zoomPercent, baseSpan].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError("Viewport dimensions, zoom and span must be positive finite numbers.");
    const margin = Math.min(44, Math.max(28, Math.min(width, height) * .08));
    const usableWidth = Math.max(1, width - 2 * margin), usableHeight = Math.max(1, height - 2 * margin);
    const span = baseSpan * 100 / zoomPercent;
    return { cx: width / 2, cy: height / 2, scale: Math.min(usableWidth, usableHeight) / (2 * span), span, width, height };
  }

  return { EPSILON, PRESETS, identity, preset, validateMatrix, canonicalMatrix, multiply, translation, rotation, scaling, aboutPoint, cumulativeMatrices, aboutPointStages, referenceFrameStages, aboutFrame, reflectionAboutLine, homogeneous, transformPoint, transformPath, determinant, classify, makeGrid, sampleCurve, geometry, makeViewport };
});
