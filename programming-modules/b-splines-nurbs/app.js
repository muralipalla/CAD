(function () {
  "use strict";

  const Lab = window.CurveLab;
  const canvas = document.querySelector("[data-curve-canvas]");
  const weightCanvas = document.querySelector("[data-weight-canvas]");
  const basisCanvas = document.querySelector("[data-basis-canvas]");
  const status = document.querySelector("[data-status]");
  const modeControl = document.querySelector("[data-mode]");
  const degreeControl = document.querySelector("[data-degree]");
  const knotInput = document.querySelector("[data-knot-vector]");
  const knotHelp = document.querySelector("[data-knot-help]");
  const weightNumber = document.querySelector("[data-weight-number]");
  const weightLabel = document.querySelector("[data-weight-label]");
  const weightSummary = document.querySelector("[data-weight-summary]");
  const basisPanel = document.querySelector("[data-basis-panel]");
  const basisKey = document.querySelector("[data-basis-key]");
  const basisSummary = document.querySelector("[data-basis-summary]");
  const basisKind = document.querySelector("[data-basis-kind]");
  const plotGrid = document.querySelector("[data-plot-grid]");
  const showPolygon = document.querySelector("[data-show-polygon]");
  const showHulls = document.querySelector("[data-show-hulls]");
  const colorSpans = document.querySelector("[data-color-spans]");
  const showBasis = document.querySelector("[data-show-basis]");
  const minimumWeight = 0.1;
  const maximumWeight = 5;
  const defaults = [
    { x: 0.07, y: 0.25 },
    { x: 0.2, y: 0.78 },
    { x: 0.38, y: 0.84 },
    { x: 0.52, y: 0.22 },
    { x: 0.7, y: 0.18 },
    { x: 0.9, y: 0.7 }
  ];
  let points = defaults.map((point) => ({ ...point }));
  let weights = points.map(() => 1);
  let degree = 3;
  let mode = "clamped";
  let knots = [];
  let selected = 0;
  let dragging = -1;
  let weightDragging = -1;
  let activeCurvePointer = null;
  let activeWeightPointer = null;
  let currentPlot;
  let currentWeightPlot;
  let validationMessage = "";

  function uniformKnots(controlCount, splineDegree) {
    const length = controlCount + splineDegree + 1;
    return Array.from({ length }, (_, index) => index / (length - 1));
  }

  function clampedKnots(controlCount, splineDegree) {
    const interiorCount = controlCount - splineDegree - 1;
    const result = Array(splineDegree + 1).fill(0);
    for (let index = 1; index <= interiorCount; index += 1) result.push(index / (interiorCount + 1));
    result.push(...Array(splineDegree + 1).fill(1));
    return result;
  }

  function effectiveControl() {
    if (mode !== "periodic" || !points.length) return { points, weights };
    return {
      points: points.concat(points.slice(0, degree).map((point) => ({ ...point }))),
      weights: weights.concat(weights.slice(0, degree))
    };
  }

  function generatedKnots() {
    if (points.length <= degree) return [];
    const controlCount = mode === "periodic" ? points.length + degree : points.length;
    return mode === "clamped" ? clampedKnots(controlCount, degree) : uniformKnots(controlCount, degree);
  }

  function minimumKnotSpan(knotVector) {
    if (knotVector.length < 2) return 1e-12;
    return Math.max(1, Math.abs(knotVector.at(-1) - knotVector[0])) * 1e-12;
  }

  function resetKnots() {
    knots = generatedKnots();
    knotInput.value = knots.map(String).join(", ");
    validationMessage = "";
    updateKnotHelp();
  }

  function updateDegreeOptions() {
    const maximum = Math.min(5, points.length - 1);
    for (const option of degreeControl.options) option.disabled = maximum < 1 || Number(option.value) > maximum;
    if (maximum < 1) {
      degree = 1;
      degreeControl.value = "1";
      return;
    }
    if (degree > maximum) {
      degree = maximum;
      degreeControl.value = String(degree);
    }
  }

  function updateKnotHelp() {
    const effectiveCount = mode === "periodic" ? points.length + degree : points.length;
    if (points.length <= degree) {
      knotHelp.textContent = `Add at least ${degree + 1} control points to create a degree-${degree} knot vector.`;
      return;
    }
    const modeRule = mode === "clamped"
      ? ` The first and last ${degree + 1} knots must remain repeated.`
      : mode === "periodic"
        ? " End knot spacings must wrap cyclically to preserve the periodic seam."
        : "";
    knotHelp.textContent = `Expected ${effectiveCount + degree + 1} nondecreasing values for ${effectiveCount} effective control points and degree ${degree}. Active domain: U${degree} to U${effectiveCount}.${modeRule}`;
  }

  function parseKnots() {
    if (points.length <= degree) return { error: `Add at least ${degree + 1} control points before applying knots.` };
    const values = knotInput.value.split(/[\s,;]+/).filter(Boolean).map(Number);
    const effectiveCount = effectiveControl().points.length;
    const expected = effectiveCount + degree + 1;
    if (values.length !== expected) return { error: `Expected ${expected} knot values; received ${values.length}.` };
    if (values.some((value) => !Number.isFinite(value))) return { error: "Every knot must be a finite number." };
    for (let index = 1; index < values.length; index += 1) {
      if (values[index] < values[index - 1]) return { error: "Knot values must be nondecreasing." };
    }
    let multiplicity = 1;
    for (let index = 1; index < values.length; index += 1) {
      multiplicity = values[index] === values[index - 1] ? multiplicity + 1 : 1;
      if (multiplicity > degree + 1) return { error: `Knot multiplicity cannot exceed degree + 1 (${degree + 1}).` };
    }
    const minimumSpan = minimumKnotSpan(values);
    if (values[effectiveCount] - values[degree] <= minimumSpan) return { error: "The active parameter domain is too short for the knot tolerance." };
    if (values[degree + 1] - values[degree] <= minimumSpan) return { error: "The first active knot span is too short for the knot tolerance." };
    if (values[effectiveCount] - values[effectiveCount - 1] <= minimumSpan) return { error: "The last active knot span is too short for the knot tolerance." };
    const tolerance = Math.max(1, Math.abs(values.at(-1) - values[0])) * 1e-8;
    if (mode === "clamped") {
      for (let index = 1; index <= degree; index += 1) {
        if (Math.abs(values[index] - values[0]) > tolerance || Math.abs(values.at(-1 - index) - values.at(-1)) > tolerance) {
          return { error: `Clamped mode requires multiplicity ${degree + 1} at both ends.` };
        }
      }
    }
    if (mode === "periodic") {
      const differences = values.slice(1).map((value, index) => value - values[index]);
      const baseCount = points.length;
      for (let index = 0; index < degree; index += 1) {
        const leftMatches = Math.abs(differences[index] - differences[baseCount + index]) <= tolerance;
        const rightMatches = Math.abs(differences[baseCount + degree + index] - differences[degree + index]) <= tolerance;
        if (!leftMatches || !rightMatches) return { error: "Periodic knot spacings must wrap consistently at both ends." };
      }
    }
    return { values };
  }

  function findSpan(controlCount, splineDegree, parameter, knotVector) {
    const lastControl = controlCount - 1;
    if (parameter >= knotVector[lastControl + 1]) return lastControl;
    if (parameter <= knotVector[splineDegree]) return splineDegree;
    let low = splineDegree;
    let high = lastControl + 1;
    let middle = Math.floor((low + high) / 2);
    while (parameter < knotVector[middle] || parameter >= knotVector[middle + 1]) {
      if (parameter < knotVector[middle]) high = middle;
      else low = middle;
      middle = Math.floor((low + high) / 2);
    }
    return middle;
  }

  function basisFunctions(span, parameter, splineDegree, knotVector) {
    const basis = Array(splineDegree + 1).fill(0);
    const left = Array(splineDegree + 1).fill(0);
    const right = Array(splineDegree + 1).fill(0);
    basis[0] = 1;
    for (let column = 1; column <= splineDegree; column += 1) {
      left[column] = parameter - knotVector[span + 1 - column];
      right[column] = knotVector[span + column] - parameter;
      let saved = 0;
      for (let row = 0; row < column; row += 1) {
        const denominator = right[row + 1] + left[column - row];
        const term = Math.abs(denominator) < 1e-14 ? 0 : basis[row] / denominator;
        basis[row] = saved + right[row + 1] * term;
        saved = left[column - row] * term;
      }
      basis[column] = saved;
    }
    return basis;
  }

  function evaluate(parameter) {
    const data = effectiveControl();
    const span = findSpan(data.points.length, degree, parameter, knots);
    const basis = basisFunctions(span, parameter, degree, knots);
    let denominator = 0;
    let x = 0;
    let y = 0;
    for (let local = 0; local <= degree; local += 1) {
      const index = span - degree + local;
      const contribution = basis[local] * data.weights[index];
      denominator += contribution;
      x += contribution * data.points[index].x;
      y += contribution * data.points[index].y;
    }
    return denominator > 1e-14 ? { x: x / denominator, y: y / denominator } : { x: 0, y: 0 };
  }

  function activeSpans() {
    const count = effectiveControl().points.length;
    const spans = [];
    const minimumSpan = minimumKnotSpan(knots);
    for (let span = degree; span < count; span += 1) {
      if (knots[span + 1] - knots[span] > minimumSpan) spans.push(span);
    }
    return spans;
  }

  function spanParameterSets() {
    const spans = activeSpans();
    return spans.map((span, spanIndex) => {
      const start = knots[span];
      const end = knots[span + 1];
      const steps = 42;
      const parameters = Array.from({ length: steps + 1 }, (_, index) => {
        const isRightBoundary = index === steps;
        const needsLeftLimit = isRightBoundary && (spanIndex < spans.length - 1 || mode === "periodic");
        const scale = Math.max(1, Math.abs(start), Math.abs(end));
        const epsilon = Math.min((end - start) / 2, Math.max(Number.EPSILON * scale * 16, (end - start) * 1e-8));
        return needsLeftLimit ? end - epsilon : start + (end - start) * index / steps;
      });
      return { span, parameters };
    });
  }

  function sampledSpans() {
    const parameterSets = spanParameterSets();
    return parameterSets.map(({ span, parameters }, spanIndex) => {
      const samples = parameters.map(evaluate);
      if (mode === "periodic" && spanIndex === parameterSets.length - 1 && parameterSets.length) samples.push(evaluate(knots[parameterSets[0].span]));
      return { span, samples, parameters };
    });
  }

  function rationalBasisValues(parameter) {
    const data = effectiveControl();
    const values = Array(points.length).fill(0);
    if (!points.length || data.points.length <= degree) return values;
    const span = findSpan(data.points.length, degree, parameter, knots);
    const localBasis = basisFunctions(span, parameter, degree, knots);
    let denominator = 0;
    for (let local = 0; local <= degree; local += 1) {
      const effectiveIndex = span - degree + local;
      const contribution = localBasis[local] * data.weights[effectiveIndex];
      denominator += contribution;
      values[effectiveIndex % points.length] += contribution;
    }
    return denominator > 1e-14 ? values.map((value) => value / denominator) : values;
  }

  function draw(context, width, height) {
    currentPlot = Lab.plotRect(width, height);
    Lab.drawGrid(context, currentPlot);
    const data = effectiveControl();
    const segments = points.length > degree ? sampledSpans() : [];
    if (showHulls.checked) {
      segments.forEach(({ span }, index) => {
        const hull = Lab.convexHull(data.points.slice(span - degree, span + 1));
        Lab.drawPolyline(context, hull, currentPlot, { color: Lab.palette[index % Lab.palette.length], width: 1.5, dash: [5, 5], closed: hull.length > 2, fill: hull.length > 2 ? `${Lab.palette[index % Lab.palette.length]}18` : undefined });
      });
    }
    if (showPolygon.checked) Lab.drawPolyline(context, points, currentPlot, { color: "rgba(255,255,255,0.46)", width: 1.7, dash: [5, 5], closed: mode === "periodic" });
    segments.forEach(({ samples }, index) => Lab.drawPolyline(context, samples, currentPlot, { color: colorSpans.checked ? Lab.palette[index % Lab.palette.length] : "#8ac7ff", width: 4 }));
    points.forEach((point, index) => Lab.drawPoint(context, point, currentPlot, {
      label: `P${index + 1} · w=${Lab.formatNumber(weights[index], 2)}`,
      fill: index === selected ? "#ffd166" : Math.abs(weights[index] - 1) > 1e-10 ? "#a99ae0" : "#ff725c",
      radius: index === selected ? 9 : 7
    }));
  }

  const view = Lab.createCanvas(canvas, draw);

  function weightScreenPosition(index) {
    if (!currentWeightPlot || index < 0 || index >= points.length) return null;
    const rowY = points.length === 1
      ? currentWeightPlot.top + currentWeightPlot.height / 2
      : currentWeightPlot.bottom - currentWeightPlot.height * index / (points.length - 1);
    const normalizedWeight = (weights[index] - minimumWeight) / (maximumWeight - minimumWeight);
    return { x: currentWeightPlot.left + normalizedWeight * currentWeightPlot.width, y: rowY };
  }

  function drawWeightEditor(context, width, height) {
    currentWeightPlot = Lab.plotRect(width, height, { left: 58, right: 20, top: 36, bottom: 58 });
    context.save();
    context.fillStyle = "#171541";
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1;
    context.font = "700 11px system-ui, sans-serif";
    context.textBaseline = "middle";

    const tickWeights = [minimumWeight, 1, 2, 3, 4, maximumWeight];
    tickWeights.forEach((weight) => {
      const x = currentWeightPlot.left + (weight - minimumWeight) / (maximumWeight - minimumWeight) * currentWeightPlot.width;
      context.strokeStyle = "rgba(255,255,255,0.1)";
      context.beginPath();
      context.moveTo(x, currentWeightPlot.top);
      context.lineTo(x, currentWeightPlot.bottom);
      context.stroke();
      context.fillStyle = "rgba(255,255,255,0.68)";
      context.textAlign = "center";
      context.fillText(Lab.formatNumber(weight, 1), x, currentWeightPlot.bottom + 18);
    });

    if (points.length > 1) {
      context.strokeStyle = "rgba(138,199,255,0.72)";
      context.lineWidth = 2;
      context.beginPath();
      points.forEach((point, index) => {
        const handle = weightScreenPosition(index);
        if (index === 0) context.moveTo(handle.x, handle.y);
        else context.lineTo(handle.x, handle.y);
      });
      context.stroke();
    }

    points.forEach((point, index) => {
      const handle = weightScreenPosition(index);
      context.strokeStyle = "rgba(255,255,255,0.1)";
      context.beginPath();
      context.moveTo(currentWeightPlot.left, handle.y);
      context.lineTo(currentWeightPlot.right, handle.y);
      context.stroke();
      context.fillStyle = "rgba(255,255,255,0.72)";
      context.textAlign = "right";
      context.fillText(`P${index + 1}`, currentWeightPlot.left - 9, handle.y);
      context.beginPath();
      context.arc(handle.x, handle.y, index === selected ? 9 : 7, 0, Math.PI * 2);
      context.fillStyle = index === selected ? "#ffd166" : Math.abs(weights[index] - 1) > 1e-10 ? "#a99ae0" : "#ff725c";
      context.fill();
      context.strokeStyle = "white";
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = "white";
      context.textAlign = handle.x > currentWeightPlot.left + currentWeightPlot.width * 0.72 ? "right" : "left";
      context.fillText(Lab.formatNumber(weights[index], 2), handle.x + (context.textAlign === "right" ? -11 : 11), handle.y);
    });

    context.strokeStyle = "rgba(255,255,255,0.4)";
    context.lineWidth = 1.25;
    context.beginPath();
    context.moveTo(currentWeightPlot.left, currentWeightPlot.top);
    context.lineTo(currentWeightPlot.left, currentWeightPlot.bottom);
    context.lineTo(currentWeightPlot.right, currentWeightPlot.bottom);
    context.stroke();
    context.fillStyle = "rgba(255,255,255,0.82)";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillText("weight w", currentWeightPlot.left + currentWeightPlot.width / 2, height - 10);
    context.save();
    context.translate(14, currentWeightPlot.top + currentWeightPlot.height / 2);
    context.rotate(-Math.PI / 2);
    context.fillText("point index", 0, 0);
    context.restore();

    if (!points.length) {
      context.fillStyle = "rgba(255,255,255,0.72)";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("Add a control point in the curve plot", width / 2, height / 2);
    }
    context.restore();
  }

  function drawBasisFunctions(context, width, height) {
    const plot = Lab.plotRect(width, height, { left: 54, right: 20, top: 32, bottom: 54 });
    context.save();
    context.fillStyle = "#171541";
    context.fillRect(0, 0, width, height);
    context.font = "700 11px system-ui, sans-serif";
    context.lineWidth = 1;
    context.textBaseline = "middle";
    for (let step = 0; step <= 4; step += 1) {
      const x = plot.left + plot.width * step / 4;
      const y = plot.bottom - plot.height * step / 4;
      context.strokeStyle = "rgba(255,255,255,0.09)";
      context.beginPath();
      context.moveTo(x, plot.top);
      context.lineTo(x, plot.bottom);
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.fillStyle = "rgba(255,255,255,0.66)";
      context.textAlign = "right";
      context.fillText(Lab.formatNumber(step / 4, 2), plot.left - 8, y);
    }

    if (points.length > degree && knots.length) {
      const effectiveCount = effectiveControl().points.length;
      const activeStart = knots[degree];
      const activeEnd = knots[effectiveCount];
      spanParameterSets().forEach(({ parameters }) => {
        const basisSamples = parameters.map((parameter) => rationalBasisValues(parameter));
        points.forEach((point, basisIndex) => {
          context.strokeStyle = Lab.palette[basisIndex % Lab.palette.length];
          context.lineWidth = basisIndex === selected ? 3 : 2;
          context.setLineDash(basisIndex >= Lab.palette.length ? [5, 3] : []);
          context.beginPath();
          parameters.forEach((parameter, sampleIndex) => {
            const x = plot.left + (parameter - activeStart) / (activeEnd - activeStart) * plot.width;
            const y = plot.bottom - basisSamples[sampleIndex][basisIndex] * plot.height;
            if (sampleIndex === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          });
          context.stroke();
        });
      });
      context.setLineDash([]);
      context.fillStyle = "rgba(255,255,255,0.68)";
      context.textAlign = "center";
      context.fillText(Lab.formatNumber(activeStart, 4), plot.left, plot.bottom + 18);
      context.fillText(Lab.formatNumber((activeStart + activeEnd) / 2, 4), plot.left + plot.width / 2, plot.bottom + 18);
      context.fillText(Lab.formatNumber(activeEnd, 4), plot.right, plot.bottom + 18);
    } else {
      context.fillStyle = "rgba(255,255,255,0.72)";
      context.textAlign = "center";
      context.fillText(`Add at least ${degree + 1} control points`, width / 2, height / 2);
    }

    context.strokeStyle = "rgba(255,255,255,0.4)";
    context.beginPath();
    context.moveTo(plot.left, plot.top);
    context.lineTo(plot.left, plot.bottom);
    context.lineTo(plot.right, plot.bottom);
    context.stroke();
    context.fillStyle = "rgba(255,255,255,0.82)";
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillText("parameter u", plot.left + plot.width / 2, height - 9);
    context.save();
    context.translate(14, plot.top + plot.height / 2);
    context.rotate(-Math.PI / 2);
    context.fillText("basis value", 0, 0);
    context.restore();
    context.restore();
  }

  const weightView = Lab.createCanvas(weightCanvas, drawWeightEditor);
  const basisView = Lab.createCanvas(basisCanvas, drawBasisFunctions);

  function pythonPoints() {
    if (!points.length) return "np.empty((0, 2), dtype=float)";
    return `np.array([\n    ${Lab.formatPointRows(points)}\n], dtype=float)`;
  }

  function matlabPoints() {
    if (!points.length) return "zeros(0, 2)";
    return `[\n    ${points.map((point) => `${Lab.formatNumber(point.x)} ${Lab.formatNumber(point.y)}`).join(";\n    ")}\n]`;
  }

  function weightVector() {
    return weights.map((value) => Lab.formatNumber(value, 5)).join(", ");
  }

  function knotVector() {
    return knots.map(String).join(", ");
  }

  function pythonCode() {
    return `import numpy as np
import matplotlib.pyplot as plt
from scipy.spatial import ConvexHull, QhullError

control = ${pythonPoints()}
weights = np.array([${weightVector()}], dtype=float)
degree = ${degree}
periodic = ${mode === "periodic" ? "True" : "False"}
show_local_hulls = ${showHulls.checked ? "True" : "False"}
color_spans = ${colorSpans.checked ? "True" : "False"}
show_basis = ${showBasis.checked ? "True" : "False"}
show_control_polygon = ${showPolygon.checked ? "True" : "False"}

if len(control) <= degree or np.any(weights <= 0):
    raise ValueError("Need more control points than the degree and positive weights")
if periodic:
    eval_control = np.vstack([control, control[:degree]])
    eval_weights = np.r_[weights, weights[:degree]]
else:
    eval_control, eval_weights = control, weights

knots = np.array([${knotVector()}], dtype=float)
expected = len(eval_control) + degree + 1
if len(knots) != expected or not np.all(np.isfinite(knots)) or np.any(np.diff(knots) < 0):
    raise ValueError(f"Expected {expected} finite, nondecreasing knots")
multiplicity = 1
for index in range(1, len(knots)):
    multiplicity = multiplicity + 1 if knots[index] == knots[index-1] else 1
    if multiplicity > degree + 1:
        raise ValueError(f"Knot multiplicity cannot exceed degree + 1 ({degree + 1})")
knot_range = abs(knots[-1] - knots[0])
minimum_span = max(1.0, knot_range) * 1e-12
knot_tolerance = max(1.0, knot_range) * 1e-8
if knots[len(eval_control)] - knots[degree] <= minimum_span:
    raise ValueError("The active parameter domain is too short for the knot tolerance")
if knots[degree + 1] - knots[degree] <= minimum_span:
    raise ValueError("The first active knot span is too short for the knot tolerance")
if knots[len(eval_control)] - knots[len(eval_control) - 1] <= minimum_span:
    raise ValueError("The last active knot span is too short for the knot tolerance")
if periodic:
    differences = np.diff(knots)
    base_count = len(control)
    for index in range(degree):
        left_matches = abs(differences[index] - differences[base_count + index]) <= knot_tolerance
        right_matches = abs(differences[base_count + degree + index] - differences[degree + index]) <= knot_tolerance
        if not left_matches or not right_matches:
            raise ValueError("Periodic knot spacings must wrap consistently at both ends")

def find_span(u):
    n = len(eval_control) - 1
    if u >= knots[n + 1]: return n
    if u <= knots[degree]: return degree
    low, high = degree, n + 1
    mid = (low + high) // 2
    while u < knots[mid] or u >= knots[mid + 1]:
        if u < knots[mid]: high = mid
        else: low = mid
        mid = (low + high) // 2
    return mid

def basis_functions(span, u):
    N = np.zeros(degree + 1); N[0] = 1.0
    left = np.zeros(degree + 1); right = np.zeros(degree + 1)
    for j in range(1, degree + 1):
        left[j] = u - knots[span + 1 - j]
        right[j] = knots[span + j] - u
        saved = 0.0
        for r in range(j):
            denominator = right[r + 1] + left[j - r]
            term = 0.0 if abs(denominator) < 1e-14 else N[r] / denominator
            N[r] = saved + right[r + 1] * term
            saved = left[j - r] * term
        N[j] = saved
    return N

def nurbs_point(u):
    span = find_span(u)
    N = basis_functions(span, u)
    indices = np.arange(span - degree, span + 1)
    rational = N * eval_weights[indices]
    return (rational @ eval_control[indices]) / rational.sum()

def rational_basis(u):
    span = find_span(u)
    N = basis_functions(span, u)
    values = np.zeros(len(control))
    denominator = 0.0
    for local, effective_index in enumerate(range(span-degree, span+1)):
        contribution = N[local] * eval_weights[effective_index]
        values[effective_index % len(control)] += contribution
        denominator += contribution
    return values / denominator

def hull_polyline(data):
    if len(data) < 3:
        return data
    try:
        ordered = data[ConvexHull(data).vertices]
    except QhullError:
        order = np.lexsort((data[:,1], data[:,0]))
        ordered = data[order[[0, -1]]]
    return np.vstack([ordered, ordered[0]])

spans = [k for k in range(degree, len(eval_control))
         if knots[k + 1] - knots[k] > minimum_span]
segments = []
parameter_segments = []
for position, k in enumerate(spans):
    parameters = np.linspace(knots[k], knots[k+1], 43)
    if position < len(spans) - 1 or periodic:
        span_length = knots[k+1] - knots[k]
        scale = max(1.0, abs(knots[k]), abs(knots[k+1]))
        epsilon = min(span_length/2, max(np.finfo(float).eps*scale*16, span_length*1e-8))
        parameters[-1] = knots[k+1] - epsilon
    segment = np.vstack([nurbs_point(u) for u in parameters])
    segments.append(segment)
    parameter_segments.append(parameters)
if periodic:
    segments[-1] = np.vstack([segments[-1], segments[0][0]])

for position, (k, segment) in enumerate(zip(spans, segments)):
    color = f"C{position % 10}" if color_spans else "C0"
    plt.plot(segment[:,0], segment[:,1], color=color, linewidth=2)
    if show_local_hulls:
        local = hull_polyline(eval_control[k-degree:k+1])
        plt.plot(local[:,0], local[:,1], "--", color=color, alpha=0.65)
if show_control_polygon:
    control_polygon = np.vstack([control, control[0]]) if periodic else control
    plt.plot(control_polygon[:,0], control_polygon[:,1], "o--", color="0.45")
else:
    plt.plot(control[:,0], control[:,1], "o", color="0.45")
plt.axis("equal"); plt.grid(True)

plt.figure()
point_indices = np.arange(1, len(control) + 1)
plt.plot(weights, point_indices, "o-")
plt.xlim(${minimumWeight}, ${maximumWeight}); plt.yticks(point_indices)
plt.xlabel("weight w"); plt.ylabel("point index"); plt.grid(True)

if show_basis:
    plt.figure()
    prefix = "N" if np.allclose(weights, 1.0) else "R"
    for basis_index in range(len(control)):
        for segment_index, parameters in enumerate(parameter_segments):
            values = np.vstack([rational_basis(u) for u in parameters])[:, basis_index]
            label = f"{prefix}_{basis_index+1}" if segment_index == 0 else None
            plt.plot(parameters, values, label=label)
    plt.ylim(0, 1.05); plt.xlabel("parameter u"); plt.ylabel("basis value")
    plt.grid(True); plt.legend()
plt.show()`;
  }

  function matlabCode() {
    return `control = ${matlabPoints()};
weights = [${weightVector()}];
degree = ${degree};
periodic = ${mode === "periodic" ? "true" : "false"};
showLocalHulls = ${showHulls.checked ? "true" : "false"};
colorSpans = ${colorSpans.checked ? "true" : "false"};
showBasis = ${showBasis.checked ? "true" : "false"};
showControlPolygon = ${showPolygon.checked ? "true" : "false"};

if size(control,1) <= degree || any(weights <= 0)
    error('Need more control points than the degree and positive weights');
end
if periodic
    evalControl = [control; control(1:degree,:)];
    evalWeights = [weights, weights(1:degree)];
else
    evalControl = control; evalWeights = weights;
end
knots = [${knotVector()}];
expected = size(evalControl,1) + degree + 1;
if numel(knots) ~= expected || any(~isfinite(knots)) || any(diff(knots) < 0)
    error('Expected %d finite, nondecreasing knots', expected);
end
multiplicity = 1;
for index = 2:numel(knots)
    if knots(index) == knots(index-1), multiplicity = multiplicity + 1;
    else, multiplicity = 1;
    end
    if multiplicity > degree + 1
        error('Knot multiplicity cannot exceed degree + 1 (%d)', degree + 1);
    end
end
minimumSpan = max(1, abs(knots(end)-knots(1))) * 1e-12;
knotTolerance = max(1, abs(knots(end)-knots(1))) * 1e-8;
if knots(size(evalControl,1)+1) - knots(degree+1) <= minimumSpan
    error('The active parameter domain is too short for the knot tolerance');
end
if knots(degree+2) - knots(degree+1) <= minimumSpan
    error('The first active knot span is too short for the knot tolerance');
end
if knots(size(evalControl,1)+1) - knots(size(evalControl,1)) <= minimumSpan
    error('The last active knot span is too short for the knot tolerance');
end
if periodic
    differences = diff(knots);
    baseCount = size(control,1);
    for index = 0:degree-1
        leftMatches = abs(differences(index+1) - differences(baseCount+index+1)) <= knotTolerance;
        rightMatches = abs(differences(baseCount+degree+index+1) - differences(degree+index+1)) <= knotTolerance;
        if ~leftMatches || ~rightMatches
            error('Periodic knot spacings must wrap consistently at both ends');
        end
    end
end

% Store span indices in the same zero-based convention as the equations.
spans = [];
for span = degree:size(evalControl,1)-1
    if knots(span+2) - knots(span+1) > minimumSpan
        spans(end+1) = span; %#ok<SAGROW>
    end
end
segments = cell(numel(spans),1);
parameterSegments = cell(numel(spans),1);
for s = 1:numel(spans)
    span = spans(s);
    parameters = linspace(knots(span+1), knots(span+2), 43);
    if s < numel(spans) || periodic
        spanLength = knots(span+2) - knots(span+1);
        scale = max([1, abs(knots(span+1)), abs(knots(span+2))]);
        epsilon = min(spanLength/2, max(16*eps*scale, spanLength*1e-8));
        parameters(end) = knots(span+2) - epsilon;
    end
    segment = zeros(numel(parameters),2);
    for q = 1:numel(parameters)
        segment(q,:) = nurbsPoint(parameters(q), degree, knots, evalControl, evalWeights);
    end
    segments{s} = segment;
    parameterSegments{s} = parameters;
end
if periodic
    segments{end}(end+1,:) = segments{1}(1,:);
end

hold on;
colors = lines(max(1,numel(spans)));
for s = 1:numel(spans)
    color = colors(s,:); if ~colorSpans, color = colors(1,:); end
    plot(segments{s}(:,1), segments{s}(:,2), 'Color', color, 'LineWidth', 2);
    if showLocalHulls
        span = spans(s);
        local = evalControl(span-degree+1:span+1,:);
        if size(local,1) >= 3
            try
                hull = convhull(local(:,1), local(:,2));
            catch
                [~, order] = sortrows(local, [1 2]);
                hull = order([1 end 1]);
            end
            local = local(hull,:);
        end
        plot(local(:,1), local(:,2), '--', 'Color', color);
    end
end
if showControlPolygon
    if periodic, controlPolygon = [control; control(1,:)]; else, controlPolygon = control; end
    plot(controlPolygon(:,1), controlPolygon(:,2), 'o--', 'Color', [0.45 0.45 0.45]);
else
    plot(control(:,1), control(:,2), 'o', 'Color', [0.45 0.45 0.45]);
end
axis equal; grid on;

figure;
pointIndices = 1:numel(weights);
plot(weights, pointIndices, 'o-');
xlim([${minimumWeight} ${maximumWeight}]); yticks(pointIndices);
xlabel('weight w'); ylabel('point index'); grid on;

if showBasis
    figure; hold on;
    if all(abs(weights-1) < 1e-12), prefix = 'N'; else, prefix = 'R'; end
    for basisIndex = 1:size(control,1)
        for s = 1:numel(parameterSegments)
            values = zeros(size(parameterSegments{s}));
            for q = 1:numel(parameterSegments{s})
                allValues = rationalBasis(parameterSegments{s}(q), degree, knots, evalWeights, size(control,1));
                values(q) = allValues(basisIndex);
            end
            if s == 1, label = sprintf('%s_%d', prefix, basisIndex); else, label = ''; end
            plot(parameterSegments{s}, values, 'DisplayName', label);
        end
    end
    ylim([0 1.05]); xlabel('parameter u'); ylabel('basis value'); grid on; legend show;
end

function point = nurbsPoint(u, p, U, P, weights)
    count = size(P,1);
    span = findSpan(u, p, U, count);
    N = basisFunctions(span, u, p, U);
    indices = (span-p:span) + 1;
    rational = N .* weights(indices);
    point = (rational * P(indices,:)) / sum(rational);
end

function values = rationalBasis(u, p, U, weights, originalCount)
    count = numel(weights);
    span = findSpan(u, p, U, count);
    N = basisFunctions(span, u, p, U);
    values = zeros(1,originalCount);
    denominator = 0;
    for local = 0:p
        effectiveIndex = span-p+local;
        contribution = N(local+1) * weights(effectiveIndex+1);
        originalIndex = mod(effectiveIndex, originalCount) + 1;
        values(originalIndex) = values(originalIndex) + contribution;
        denominator = denominator + contribution;
    end
    values = values / denominator;
end

function span = findSpan(u, p, U, count)
    last = count - 1;
    if u >= U(last+2), span = last; return; end
    if u <= U(p+1), span = p; return; end
    low = p; high = last + 1;
    span = floor((low + high) / 2);
    while u < U(span+1) || u >= U(span+2)
        if u < U(span+1), high = span; else, low = span; end
        span = floor((low + high) / 2);
    end
end

function N = basisFunctions(span, u, p, U)
    N = zeros(1,p+1); N(1) = 1;
    left = zeros(1,p+1); right = zeros(1,p+1);
    for column = 1:p
        left(column+1) = u - U(span+2-column);
        right(column+1) = U(span+column+1) - u;
        saved = 0;
        for row = 0:column-1
            denominator = right(row+2) + left(column-row+1);
            if abs(denominator) < 1e-14, term = 0;
            else, term = N(row+1) / denominator;
            end
            N(row+1) = saved + right(row+2) * term;
            saved = left(column-row+1) * term;
        end
        N(column+1) = saved;
    end
end`;
  }

  const codePane = Lab.createCodePane({ generators: { python: pythonCode, matlab: matlabCode }, pythonFilename: "nurbs.py", matlabFilename: "nurbs.m" });

  function updateWeightControls() {
    const enabled = selected >= 0 && selected < weights.length;
    weightNumber.disabled = !enabled;
    if (!enabled) {
      weightLabel.textContent = "Select a control point";
      weightNumber.value = "";
      weightSummary.textContent = "No control points. Add points in the curve plot or reset the example.";
      weightCanvas.setAttribute("aria-label", "Weight editor is empty. Add a control point in the curve plot.");
      return;
    }
    const value = Lab.formatNumber(weights[selected], 2);
    weightLabel.textContent = `Weight of P${selected + 1}`;
    weightNumber.value = value;
    weightSummary.textContent = `Selected P${selected + 1}: weight ${value}. Horizontal range ${minimumWeight} to ${maximumWeight}.`;
    weightCanvas.setAttribute("aria-label", `Weight editor with point indices on the vertical axis and weights on the horizontal axis. Selected P${selected + 1}, weight ${value}.`);
  }

  function updateBasisPanel() {
    const visible = showBasis.checked;
    basisPanel.hidden = !visible;
    plotGrid.classList.toggle("has-basis", visible);
    const rational = weights.some((weight) => Math.abs(weight - 1) > 1e-10);
    const prefix = rational ? "R" : "N";
    basisKind.textContent = rational ? "Rational basis" : "B-spline basis";
    const legendItems = points.map((point, index) => {
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      const label = document.createElement("span");
      swatch.className = `basis-key-swatch${index >= Lab.palette.length ? " is-dashed" : ""}`;
      swatch.style.setProperty("--basis-color", Lab.palette[index % Lab.palette.length]);
      swatch.setAttribute("aria-hidden", "true");
      label.textContent = `${prefix}${index + 1}`;
      item.append(swatch, label);
      return item;
    });
    basisKey.replaceChildren(...legendItems);
    if (points.length <= degree) {
      basisSummary.textContent = `Add at least ${degree + 1} control points to plot the basis.`;
    } else {
      const periodicNote = mode === "periodic" ? " Wrapped effective terms are combined by original control-point index." : "";
      basisSummary.textContent = `${prefix}1…${prefix}${points.length} over the active knot domain. Curves are separated at knot-span boundaries.${periodicNote}`;
    }
    basisCanvas.setAttribute("aria-label", `${rational ? "Rational" : "B-spline"} basis functions for ${points.length} control points and degree ${degree}.`);
  }

  function updateStatus(message = validationMessage) {
    status.classList.toggle("error", Boolean(message));
    if (message) {
      status.textContent = message;
      return;
    }
    if (!points.length) {
      status.textContent = "No control points. Click in the curve plot to start, or choose Reset example.";
      return;
    }
    if (points.length <= degree) {
      status.textContent = `Add ${degree + 1 - points.length} more control point${degree + 1 - points.length === 1 ? "" : "s"} for degree ${degree}.`;
      return;
    }
    const type = weights.some((weight) => Math.abs(weight - 1) > 1e-10) ? "NURBS" : "B-spline";
    const selectionText = selected >= 0 && weights[selected] !== undefined
      ? ` Selected P${selected + 1}, weight ${Lab.formatNumber(weights[selected], 2)}.`
      : " Select a point to edit its weight.";
    status.textContent = `${type}: ${points.length} control points, degree ${degree}, ${activeSpans().length} nonempty knot spans, ${mode} mode.${selectionText}`;
  }

  function render(message) {
    updateBasisPanel();
    view.redraw();
    weightView.redraw();
    if (showBasis.checked) basisView.redraw();
    codePane.render();
    updateWeightControls();
    updateKnotHelp();
    updateStatus(message);
  }

  function clearCurveDrag(releaseCapture = true) {
    const pointerId = activeCurvePointer;
    activeCurvePointer = null;
    dragging = -1;
    canvas.classList.remove("is-dragging");
    if (releaseCapture && pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  }

  function clearWeightDrag(releaseCapture = true) {
    const pointerId = activeWeightPointer;
    activeWeightPointer = null;
    weightDragging = -1;
    weightCanvas.classList.remove("is-dragging");
    if (releaseCapture && pointerId !== null && weightCanvas.hasPointerCapture(pointerId)) weightCanvas.releasePointerCapture(pointerId);
  }

  function rebuildForStructureChange() {
    clearCurveDrag();
    clearWeightDrag();
    updateDegreeOptions();
    resetKnots();
    render();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (activeCurvePointer !== null) return;
    const screen = Lab.eventPosition(canvas, event);
    const hit = Lab.nearestPoint(points, screen, currentPlot);
    if (hit >= 0) {
      selected = hit;
      dragging = hit;
    } else if (points.length < 14 && screen.x >= currentPlot.left && screen.x <= currentPlot.right && screen.y >= currentPlot.top && screen.y <= currentPlot.bottom) {
      points.push(Lab.screenToWorld(screen, currentPlot));
      weights.push(1);
      selected = points.length - 1;
      dragging = selected;
      updateDegreeOptions();
      resetKnots();
    } else return;
    activeCurvePointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
    render();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (dragging < 0 || event.pointerId !== activeCurvePointer) return;
    points[dragging] = Lab.screenToWorld(Lab.eventPosition(canvas, event), currentPlot);
    render();
  });

  function endDrag(event) {
    if (event.pointerId !== activeCurvePointer) return;
    clearCurveDrag();
    render();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId !== activeCurvePointer) return;
    clearCurveDrag(false);
    render();
  });

  Lab.bindCanvasKeyboard(canvas, {
    onMove(delta) {
      if (selected < 0 || !points[selected]) return;
      points[selected] = { x: Lab.clamp(points[selected].x + delta.x, 0, 1), y: Lab.clamp(points[selected].y + delta.y, 0, 1) };
      render();
    },
    onDelete() {
      if (activeCurvePointer !== null || activeWeightPointer !== null || dragging >= 0 || weightDragging >= 0 || selected < 0) return;
      points.splice(selected, 1);
      weights.splice(selected, 1);
      selected = points.length ? Math.min(selected, points.length - 1) : -1;
      rebuildForStructureChange();
    }
  });

  function nearestWeightHandle(screen, radius = 24) {
    let nearest = -1;
    let bestDistance = radius * radius;
    points.forEach((point, index) => {
      const handle = weightScreenPosition(index);
      if (!handle) return;
      const distance = (handle.x - screen.x) ** 2 + (handle.y - screen.y) ** 2;
      if (distance <= bestDistance) {
        bestDistance = distance;
        nearest = index;
      }
    });
    return nearest;
  }

  function setWeightAt(index, rawValue) {
    if (index < 0 || index >= weights.length) return;
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return;
    weights[index] = Math.round(Lab.clamp(numericValue, minimumWeight, maximumWeight) * 100) / 100;
    selected = index;
    render();
  }

  function dragWeightTo(event) {
    if (weightDragging < 0 || event.pointerId !== activeWeightPointer || !currentWeightPlot) return;
    const screen = Lab.eventPosition(weightCanvas, event);
    const proportion = Lab.clamp((screen.x - currentWeightPlot.left) / currentWeightPlot.width, 0, 1);
    setWeightAt(weightDragging, minimumWeight + proportion * (maximumWeight - minimumWeight));
  }

  weightCanvas.addEventListener("pointerdown", (event) => {
    if (activeWeightPointer !== null) return;
    const screen = Lab.eventPosition(weightCanvas, event);
    const hit = nearestWeightHandle(screen);
    if (hit < 0) return;
    selected = hit;
    weightDragging = hit;
    activeWeightPointer = event.pointerId;
    weightCanvas.setPointerCapture(event.pointerId);
    weightCanvas.classList.add("is-dragging");
    weightCanvas.focus();
    dragWeightTo(event);
  });
  weightCanvas.addEventListener("pointermove", (event) => {
    if (weightDragging >= 0 && event.pointerId === activeWeightPointer) dragWeightTo(event);
  });

  function endWeightDrag(event) {
    if (event.pointerId !== activeWeightPointer) return;
    clearWeightDrag();
    render();
  }
  weightCanvas.addEventListener("pointerup", endWeightDrag);
  weightCanvas.addEventListener("pointercancel", endWeightDrag);
  weightCanvas.addEventListener("lostpointercapture", (event) => {
    if (event.pointerId !== activeWeightPointer) return;
    clearWeightDrag(false);
    render();
  });
  weightCanvas.addEventListener("keydown", (event) => {
    if (!points.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const direction = event.key === "ArrowUp" ? 1 : -1;
      selected = Lab.clamp(selected < 0 ? 0 : selected + direction, 0, points.length - 1);
      render();
      return;
    }
    if (selected < 0) selected = 0;
    if (event.key === "Home") setWeightAt(selected, minimumWeight);
    else if (event.key === "End") setWeightAt(selected, maximumWeight);
    else {
      const step = event.shiftKey ? 0.5 : 0.1;
      setWeightAt(selected, weights[selected] + (event.key === "ArrowLeft" ? -step : step));
    }
  });

  modeControl.addEventListener("change", () => {
    mode = modeControl.value;
    resetKnots();
    render();
  });
  degreeControl.addEventListener("change", () => {
    degree = Number(degreeControl.value);
    resetKnots();
    render();
  });
  showPolygon.addEventListener("change", () => render());
  showHulls.addEventListener("change", () => render());
  colorSpans.addEventListener("change", () => render());
  showBasis.addEventListener("change", () => {
    render();
    if (showBasis.checked) window.requestAnimationFrame(() => basisView.redraw());
  });

  document.querySelector("[data-apply-knots]").addEventListener("click", () => {
    const parsed = parseKnots();
    if (parsed.error) {
      validationMessage = parsed.error;
      render(validationMessage);
      knotInput.focus();
      return;
    }
    knots = parsed.values;
    validationMessage = "";
    knotInput.value = knots.map(String).join(", ");
    render();
  });
  document.querySelector("[data-reset-knots]").addEventListener("click", () => {
    resetKnots();
    render();
  });

  weightNumber.addEventListener("change", () => setWeightAt(selected, weightNumber.value));

  document.querySelector("[data-undo]").addEventListener("click", () => {
    if (!points.length) return;
    points.pop();
    weights.pop();
    selected = points.length ? Math.min(selected, points.length - 1) : -1;
    rebuildForStructureChange();
  });
  document.querySelector("[data-reset-weights]").addEventListener("click", () => {
    weights = weights.map(() => 1);
    render();
  });
  document.querySelector("[data-clear]").addEventListener("click", () => {
    points = [];
    weights = [];
    selected = -1;
    dragging = -1;
    weightDragging = -1;
    rebuildForStructureChange();
    canvas.focus();
  });
  document.querySelector("[data-reset]").addEventListener("click", () => {
    points = defaults.map((point) => ({ ...point }));
    weights = points.map(() => 1);
    degree = 3;
    mode = "clamped";
    selected = 0;
    clearCurveDrag();
    clearWeightDrag();
    degreeControl.value = "3";
    modeControl.value = "clamped";
    updateDegreeOptions();
    resetKnots();
    render();
    canvas.focus();
  });

  updateDegreeOptions();
  resetKnots();
  render();
}());
