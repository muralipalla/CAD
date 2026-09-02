(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BSplineBasisMath = api;
}(typeof window !== "undefined" ? window : undefined, function () {
  "use strict";

  const VALID_MODES = new Set([
    "clamped",
    "unclamped",
    "periodic",
    "custom",
    "custom-periodic",
  ]);
  const MAX_KNOTS = 64;

  function isPeriodicMode(mode) {
    return mode === "periodic" || mode === "custom-periodic";
  }

  function isCustomFiniteMode(mode) {
    return mode === "custom";
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function toleranceFor(knots) {
    if (!knots.length) return 1e-12;
    return Math.max(1, Math.abs(knots.at(-1) - knots[0])) * 1e-10;
  }

  function nearlyEqual(a, b, tolerance) {
    return Math.abs(a - b) <= tolerance;
  }

  function parseKnotVector(text) {
    const source = String(text ?? "")
      .replace(/^\s*U\s*=\s*/i, "")
      .replace(/[\[\]{}()]/g, " ")
      .trim();
    if (!source) return { values: [], error: "Enter at least one knot value." };

    const tokens = source.split(/[\s,;]+/).filter(Boolean);
    const values = tokens.map(Number);
    const invalidIndex = values.findIndex((value) => !Number.isFinite(value));
    if (invalidIndex >= 0) {
      return { values: [], error: `Knot ${invalidIndex} (“${tokens[invalidIndex]}”) is not a finite number.` };
    }
    return { values, error: "" };
  }

  function basisCountFor(knotCount, order, mode) {
    return isPeriodicMode(mode) ? knotCount - 2 * order + 1 : knotCount - order;
  }

  function effectiveBasisCountFor(basisCount, order, mode) {
    return isPeriodicMode(mode) ? basisCount + order - 1 : basisCount;
  }

  function defaultKnotVector(mode, order, basisCount = 6) {
    const safeOrder = Math.max(1, Math.floor(order));
    const safeCount = Math.max(safeOrder, Math.floor(basisCount));

    if (mode === "clamped") {
      const interiorCount = safeCount - safeOrder;
      const knots = Array(safeOrder).fill(0);
      for (let index = 1; index <= interiorCount; index += 1) {
        knots.push(index / (interiorCount + 1));
      }
      knots.push(...Array(safeOrder).fill(1));
      return knots;
    }

    if (mode === "periodic") {
      const knotCount = safeCount + 2 * safeOrder - 1;
      return Array.from(
        { length: knotCount },
        (_, index) => index / (knotCount - 1),
      );
    }

    if (mode === "custom-periodic") {
      const degree = safeOrder - 1;
      const activeSpacings = Array.from(
        { length: safeCount },
        (_, index) => (
          1
          + 0.28 * Math.sin((2 * Math.PI * (index + 0.25)) / safeCount)
          + 0.12 * Math.cos((4 * Math.PI * (index + 0.1)) / safeCount)
        ),
      );
      const differences = [
        ...activeSpacings.slice(safeCount - degree),
        ...activeSpacings,
        ...activeSpacings.slice(0, degree),
      ];
      const knots = [0];
      for (const spacing of differences) knots.push(knots.at(-1) + spacing);
      const scale = knots.at(-1);
      return knots.map((value) => value / scale);
    }

    const knotCount = safeCount + safeOrder;
    if (mode === "custom") {
      return Array.from(
        { length: knotCount },
        (_, index) => {
          const parameter = index / (knotCount - 1);
          return 0.58 * parameter + 0.42 * parameter * parameter;
        },
      );
    }

    return Array.from(
      { length: knotCount },
      (_, index) => index / (knotCount - 1),
    );
  }

  function endpointMultiplicity(knots, fromLeft, tolerance) {
    if (!knots.length) return 0;
    const endpoint = fromLeft ? knots[0] : knots.at(-1);
    let count = 0;
    if (fromLeft) {
      for (const knot of knots) {
        if (!nearlyEqual(knot, endpoint, tolerance)) break;
        count += 1;
      }
      return count;
    }
    for (let index = knots.length - 1; index >= 0; index -= 1) {
      if (!nearlyEqual(knots[index], endpoint, tolerance)) break;
      count += 1;
    }
    return count;
  }

  function validateConfiguration(knots, order, mode) {
    const errors = [];
    if (!VALID_MODES.has(mode)) {
      errors.push("Choose Clamped, Not clamped, Periodic, Custom, or Custom periodic.");
    }
    if (!Number.isInteger(order) || order < 1) errors.push("Order m must be a positive integer.");
    if (!Array.isArray(knots)) errors.push("The knot vector must be a list of numbers.");

    const values = Array.isArray(knots) ? knots : [];
    if (values.length > MAX_KNOTS) errors.push(`Use at most ${MAX_KNOTS} knots in this plotter.`);
    if (values.some((value) => !Number.isFinite(value))) errors.push("Every knot must be a finite number.");

    for (let index = 1; index < values.length; index += 1) {
      if (values[index] < values[index - 1]) {
        errors.push("Knot values must be nondecreasing.");
        break;
      }
    }

    const safeOrder = Number.isInteger(order) && order > 0 ? order : 1;
    const tolerance = toleranceFor(values);
    let multiplicity = 1;
    for (let index = 1; index < values.length; index += 1) {
      multiplicity = nearlyEqual(values[index], values[index - 1], tolerance) ? multiplicity + 1 : 1;
      if (multiplicity > safeOrder) {
        errors.push(`Knot multiplicity cannot exceed the order m = ${safeOrder}.`);
        break;
      }
    }

    const basisCount = basisCountFor(values.length, safeOrder, mode);
    if (basisCount < safeOrder) {
      const relationship = isPeriodicMode(mode) ? "k − 2m + 1" : "k − m";
      errors.push(`This vector gives c = ${relationship} = ${basisCount}; at least m = ${safeOrder} basis functions are required.`);
    }

    const effectiveBasisCount = effectiveBasisCountFor(basisCount, safeOrder, mode);
    const startIndex = safeOrder - 1;
    const endIndex = values.length - safeOrder;
    const activeStart = values[startIndex];
    const activeEnd = values[endIndex];
    if (
      Number.isFinite(activeStart) &&
      Number.isFinite(activeEnd) &&
      activeEnd - activeStart <= tolerance
    ) {
      errors.push("The active parameter domain must have positive length.");
    }

    if (
      values.length > safeOrder &&
      Number.isFinite(values[startIndex]) &&
      Number.isFinite(values[startIndex + 1]) &&
      values[startIndex + 1] - values[startIndex] <= tolerance
    ) {
      errors.push("The first active knot span must have positive length.");
    }
    if (
      endIndex > 0 &&
      Number.isFinite(values[endIndex]) &&
      Number.isFinite(values[endIndex - 1]) &&
      values[endIndex] - values[endIndex - 1] <= tolerance
    ) {
      errors.push("The last active knot span must have positive length.");
    }

    const leftMultiplicity = endpointMultiplicity(values, true, tolerance);
    const rightMultiplicity = endpointMultiplicity(values, false, tolerance);
    if (mode === "clamped" && (leftMultiplicity !== safeOrder || rightMultiplicity !== safeOrder)) {
      errors.push(`Clamped mode requires the first and last knots to each have multiplicity m = ${safeOrder}.`);
    }
    if (mode === "unclamped" && safeOrder > 1 && (leftMultiplicity >= safeOrder || rightMultiplicity >= safeOrder)) {
      errors.push(`Not clamped mode requires both endpoint multiplicities to be less than m = ${safeOrder}.`);
    }

    if (isPeriodicMode(mode) && basisCount >= safeOrder && values.length > 1) {
      const degree = safeOrder - 1;
      const differences = values.slice(1).map((value, index) => value - values[index]);
      for (let index = 0; index < degree; index += 1) {
        const leftGuard = differences[index];
        const leftPeriod = differences[basisCount + index];
        const rightGuard = differences[basisCount + degree + index];
        const rightPeriod = differences[degree + index];
        if (
          !Number.isFinite(leftGuard) ||
          !Number.isFinite(leftPeriod) ||
          !Number.isFinite(rightGuard) ||
          !Number.isFinite(rightPeriod) ||
          !nearlyEqual(leftGuard, leftPeriod, tolerance) ||
          !nearlyEqual(rightGuard, rightPeriod, tolerance)
        ) {
          errors.push("Periodic guard-knot spacings must repeat across both ends of the active domain.");
          break;
        }
      }
    }

    const domain = Number.isFinite(activeStart) && Number.isFinite(activeEnd)
      ? [activeStart, activeEnd]
      : null;
    const supportStart = values[0];
    const supportEnd = values.at(-1);
    const supportDomain = Number.isFinite(supportStart) && Number.isFinite(supportEnd)
      ? [supportStart, supportEnd]
      : null;

    return {
      valid: errors.length === 0,
      errors,
      knots: values.slice(),
      order: safeOrder,
      degree: safeOrder - 1,
      mode,
      knotCount: values.length,
      basisCount,
      effectiveBasisCount,
      domain,
      supportDomain,
      plotDomain: isCustomFiniteMode(mode) ? supportDomain : domain,
      tolerance,
    };
  }

  function findSpan(effectiveBasisCount, degree, parameter, knots) {
    const lastBasis = effectiveBasisCount - 1;
    if (parameter >= knots[effectiveBasisCount]) return lastBasis;
    if (parameter <= knots[degree]) return degree;

    let low = degree;
    let high = effectiveBasisCount;
    let middle = Math.floor((low + high) / 2);
    while (parameter < knots[middle] || parameter >= knots[middle + 1]) {
      if (parameter < knots[middle]) high = middle;
      else low = middle;
      const next = Math.floor((low + high) / 2);
      if (next === middle) break;
      middle = next;
    }
    return middle;
  }

  function localBasisFunctions(span, parameter, degree, knots) {
    const basis = Array(degree + 1).fill(0);
    const left = Array(degree + 1).fill(0);
    const right = Array(degree + 1).fill(0);
    basis[0] = 1;

    for (let column = 1; column <= degree; column += 1) {
      left[column] = parameter - knots[span + 1 - column];
      right[column] = knots[span + column] - parameter;
      let saved = 0;
      for (let row = 0; row < column; row += 1) {
        const denominator = right[row + 1] + left[column - row];
        const term = Math.abs(denominator) <= Number.EPSILON ? 0 : basis[row] / denominator;
        basis[row] = saved + right[row + 1] * term;
        saved = left[column - row] * term;
      }
      basis[column] = saved;
    }
    return basis;
  }

  function fullBasisFunctions(knots, order, parameter) {
    if (
      !Array.isArray(knots)
      || !Number.isInteger(order)
      || order < 1
      || knots.length <= order
    ) {
      return [];
    }

    const supportStart = knots[0];
    const supportEnd = knots.at(-1);
    const requestedParameter = Number(parameter);
    const numericParameter = Number.isFinite(requestedParameter)
      ? requestedParameter
      : supportStart;
    const u = Math.min(supportEnd, Math.max(supportStart, numericParameter));
    let previous = Array(knots.length - 1).fill(0);

    if (u >= supportEnd) {
      for (let index = knots.length - 2; index >= 0; index -= 1) {
        if (knots[index + 1] > knots[index]) {
          previous[index] = 1;
          break;
        }
      }
    } else {
      for (let index = 0; index < knots.length - 1; index += 1) {
        if (knots[index] <= u && u < knots[index + 1]) {
          previous[index] = 1;
          break;
        }
      }
    }

    for (let currentOrder = 2; currentOrder <= order; currentOrder += 1) {
      const current = Array(knots.length - currentOrder).fill(0);
      for (let index = 0; index < current.length; index += 1) {
        const leftDenominator = knots[index + currentOrder - 1] - knots[index];
        const rightDenominator = knots[index + currentOrder] - knots[index + 1];
        const leftTerm = leftDenominator > 0
          ? ((u - knots[index]) / leftDenominator) * previous[index]
          : 0;
        const rightTerm = rightDenominator > 0
          ? ((knots[index + currentOrder] - u) / rightDenominator) * previous[index + 1]
          : 0;
        current[index] = leftTerm + rightTerm;
      }
      previous = current;
    }

    return previous;
  }

  function evaluateWithConfiguration(configuration, parameter) {
    if (!configuration.valid || !configuration.domain) return [];
    if (isCustomFiniteMode(configuration.mode)) {
      return fullBasisFunctions(
        configuration.knots,
        configuration.order,
        parameter,
      );
    }

    const [activeStart, activeEnd] = configuration.domain;
    const requestedParameter = Number(parameter);
    const numericParameter = Number.isFinite(requestedParameter) ? requestedParameter : activeStart;
    const u = isPeriodicMode(configuration.mode) && numericParameter >= activeEnd
      ? activeStart
      : Math.min(activeEnd, Math.max(activeStart, numericParameter));
    const span = findSpan(
      configuration.effectiveBasisCount,
      configuration.degree,
      u,
      configuration.knots,
    );
    const localValues = localBasisFunctions(span, u, configuration.degree, configuration.knots);
    const values = Array(configuration.basisCount).fill(0);

    for (let local = 0; local < localValues.length; local += 1) {
      const effectiveIndex = span - configuration.degree + local;
      const basisIndex = isPeriodicMode(configuration.mode)
        ? positiveModulo(effectiveIndex, configuration.basisCount)
        : effectiveIndex;
      if (basisIndex >= 0 && basisIndex < values.length) values[basisIndex] += localValues[local];
    }
    return values;
  }

  function basisValues(knots, order, mode, parameter) {
    return evaluateWithConfiguration(validateConfiguration(knots, order, mode), parameter);
  }

  function sampleBasisSegments(knots, order, mode, samplesPerSpan = 48) {
    const configuration = validateConfiguration(knots, order, mode);
    if (!configuration.valid || !configuration.domain) return { configuration, segments: [] };

    const spanIndices = [];
    const firstSpan = isCustomFiniteMode(mode) ? 0 : configuration.degree;
    const finalSpan = isCustomFiniteMode(mode)
      ? configuration.knots.length - 2
      : configuration.effectiveBasisCount - 1;
    for (let span = firstSpan; span <= finalSpan; span += 1) {
      if (configuration.knots[span + 1] - configuration.knots[span] > configuration.tolerance) {
        spanIndices.push(span);
      }
    }

    const steps = Math.max(8, Math.min(160, Math.floor(samplesPerSpan)));
    const segments = spanIndices.map((span, spanListIndex) => {
      const start = configuration.knots[span];
      const end = configuration.knots[span + 1];
      const parameters = [];
      const values = [];
      const sums = [];
      for (let step = 0; step <= steps; step += 1) {
        const isRightBoundary = step === steps;
        const isFinalSpan = spanListIndex === spanIndices.length - 1;
        const epsilon = Math.min(
          (end - start) / 2,
          Math.max(Number.EPSILON * Math.max(1, Math.abs(start), Math.abs(end)) * 16, (end - start) * 1e-9),
        );
        const needsLeftLimit = isRightBoundary && (!isFinalSpan || isPeriodicMode(configuration.mode));
        const parameter = needsLeftLimit
          ? end - epsilon
          : start + (end - start) * (step / steps);
        const row = evaluateWithConfiguration(configuration, parameter);
        parameters.push(parameter);
        values.push(row);
        sums.push(row.reduce((sum, value) => sum + value, 0));
      }
      return { span, start, end, parameters, values, sums };
    });

    return { configuration, segments };
  }

  return {
    basisCountFor,
    basisValues,
    defaultKnotVector,
    effectiveBasisCountFor,
    findSpan,
    fullBasisFunctions,
    isCustomFiniteMode,
    isPeriodicMode,
    localBasisFunctions,
    parseKnotVector,
    sampleBasisSegments,
    validateConfiguration,
  };
}));
