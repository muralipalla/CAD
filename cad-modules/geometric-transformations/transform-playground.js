(function () {
  "use strict";

  const Math2 = window.Transform2DMath;
  const root = document.querySelector("[data-transform-lab]");
  if (!root || !Math2) return;

  const $ = (name) => root.querySelector(`[data-${name}]`);
  const canvas = $("canvas");
  const context = canvas && canvas.getContext("2d");
  if (!canvas || !context) return;

  const matrixInputs = [...root.querySelectorAll("[data-matrix-cell]")];
  const GRID_MARKER = [[[.75, .65], [2.15, .65], [2.15, 1.1], [1.35, 1.1], [1.35, 2.25], [.75, 2.25], [.75, .65]]];
  const COLORS = {
    background: "#171541",
    grid: "#353153",
    axis: "#8e87ad",
    original: "#8d86aa",
    gridResult: "#76c9e8",
    curveResult: "#ff8d78",
    marker: "#f5c451",
    reference: "#f2b84b",
    referenceGhost: "#8f7749",
    xBasis: "#ff9986",
    yBasis: "#76dcc1"
  };

  let baseMatrix = Math2.identity();
  let geometryName = "grid";
  let referenceMode = "origin";
  let referencePoint = [1.5, -1];
  let lineAngle = 30;
  let showOriginal = true;
  let zoomPercent = 100;
  let matrixValid = true;
  let referenceValid = true;
  let matrixError = "";
  let referenceError = "";
  let stages = [];
  let activeStep = 0;
  let frame = 0;

  function cleanNumber(value) {
    if (value === 0 || Object.is(value, -0)) return "0";
    const absolute = Math.abs(value);
    if (absolute < 1e-5 || absolute >= 1e7) {
      return value.toExponential(5).replace(/\.0+e/, "e").replace(/(\.\d*?)0+e/, "$1e").replace("e+", "e");
    }
    return Number(value.toPrecision(7)).toString();
  }

  function matrixBlock(matrix) {
    return [0, 1, 2]
      .map((row) => `[ ${matrix.slice(3 * row, 3 * row + 3).map(cleanNumber).join("   ")} ]`)
      .join("\n");
  }

  function matricesNear(left, right, tolerance = 1e-9) {
    return left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) <= tolerance);
  }

  function buildStages() {
    if (referenceMode === "origin") {
      const operators = [[...baseMatrix]];
      const states = Math2.cumulativeMatrices(operators);
      return [
        { label: "Original", action: "Start with the original geometry", factor: "I", expression: "C₀ = I", matrix: states[0], operator: null },
        { label: "Apply A", action: "Apply the base matrix A", factor: "A", expression: "C₁ = A", matrix: states[1], operator: operators[0] }
      ];
    }

    if (referenceMode === "point") {
      const result = Math2.aboutPointStages(baseMatrix, referencePoint);
      return [
        { label: "Original", action: "Start with the original geometry", factor: "I", expression: "C₀ = I", matrix: result.states[0], operator: null },
        { label: "Move P to O", action: "Translate the reference point P to the origin", factor: "T(−P)", expression: "C₁ = T(−P)", matrix: result.states[1], operator: result.operators[0] },
        { label: "Apply A", action: "Apply A in the recentered frame", factor: "A", expression: "C₂ = A T(−P)", matrix: result.states[2], operator: result.operators[1] },
        { label: "Move P back", action: "Translate the reference frame back to P", factor: "T(P)", expression: "C₃ = T(P) A T(−P)", matrix: result.states[3], operator: result.operators[2] }
      ];
    }

    const result = Math2.referenceFrameStages(baseMatrix, referencePoint, lineAngle);
    return [
      { label: "Original", action: "Start with the original geometry and line L", factor: "I", expression: "C₀ = I", matrix: result.states[0], operator: null },
      { label: "Move P₀ to O", action: "Translate point P₀ on L to the origin", factor: "T(−P₀)", expression: "C₁ = T(−P₀)", matrix: result.states[1], operator: result.operators[0] },
      { label: "Align L", action: `Rotate by −${cleanNumber(lineAngle)}° so L coincides with the x-axis`, factor: "R(−φ)", expression: "C₂ = R(−φ) T(−P₀)", matrix: result.states[2], operator: result.operators[1] },
      { label: "Apply A", action: "Apply A in the aligned local frame", factor: "A", expression: "C₃ = A R(−φ) T(−P₀)", matrix: result.states[3], operator: result.operators[2] },
      { label: "Undo alignment", action: `Rotate back by +${cleanNumber(lineAngle)}°`, factor: "R(φ)", expression: "C₄ = R(φ) A R(−φ) T(−P₀)", matrix: result.states[4], operator: result.operators[3] },
      { label: "Move P₀ back", action: "Translate the reference frame back to P₀", factor: "T(P₀)", expression: "C₅ = T(P₀) R(φ) A R(−φ) T(−P₀)", matrix: result.states[5], operator: result.operators[4] }
    ];
  }

  function rebuildStages() {
    stages = buildStages();
    activeStep = stages.length - 1;
    updateInterface();
  }

  function selectedMatrix() {
    return stages[activeStep] ? stages[activeStep].matrix : Math2.identity();
  }

  function updateStepState() {
    const stage = stages[activeStep];
    $("step-prev").disabled = activeStep === 0;
    $("step-next").disabled = activeStep === stages.length - 1;
    $("step-count").value = `Step ${activeStep + 1} of ${stages.length}`;
    $("step-count").textContent = `Step ${activeStep + 1} of ${stages.length}`;
    $("step-title").textContent = stage.label;
    $("figure-stage").textContent = `Step ${activeStep + 1} of ${stages.length} · ${stage.label}`;
    const lines = [stage.action, stage.expression];
    if (stage.operator) lines.push(`Action matrix ${stage.factor}:\n${matrixBlock(stage.operator)}`);
    lines.push(`Cumulative matrix C${activeStep}:\n${matrixBlock(stage.matrix)}`);
    $("composition").textContent = lines.join("\n\n");
  }

  function selectStep(index, shouldAnnounce = false) {
    activeStep = Math.max(0, Math.min(stages.length - 1, index));
    updateStepState();
    updateSummary();
    scheduleDraw();
    if (shouldAnnounce) announceStatus();
  }

  function updateReferenceControls() {
    $("reference-settings").hidden = referenceMode === "origin";
    $("line-settings").hidden = referenceMode !== "line";
    $("reference-legend").hidden = referenceMode === "origin";
    $("reference-key").textContent = referenceMode === "line" ? "working line L" : "reference point P";
    $("reference-angle-output").value = `${cleanNumber(lineAngle)}°`;
    $("reference-angle-output").textContent = `${cleanNumber(lineAngle)}°`;
    $("reference-angle").setAttribute("aria-valuetext", `${cleanNumber(lineAngle)} degrees`);
    const reflectOption = $("preset").querySelector('option[value="reflectX"]');
    reflectOption.textContent = referenceMode === "line" ? "Reflect in line L" : "Reflect in local x-axis";

    if (referenceMode === "origin") {
      $("reference-note").textContent = "The base matrix acts in the global frame, so the final matrix is C = A.";
    } else if (referenceMode === "point") {
      $("reference-note").textContent = "The frame is recentered at P: C = T(P) A T(−P). P stays fixed only when A fixes the local origin.";
    } else {
      $("reference-note").textContent = "The line L passes through P₀ at angle φ. Use C = T(P₀) R(φ) A R(−φ) T(−P₀); with local x-axis reflection, L is the reflection axis.";
    }
  }

  function updateBaseFormula() {
    const m = baseMatrix.map(cleanNumber);
    $("formula").textContent = `xₕ′ = ${m[0]}x + ${m[1]}y + ${m[2]}\nyₕ′ = ${m[3]}x + ${m[4]}y + ${m[5]}\nw′  = ${m[6]}x + ${m[7]}y + ${m[8]}\n(x′, y′) = (xₕ′/w′, yₕ′/w′)`;
  }

  function updateGeometryDescription(info) {
    const geometryLabel = $("geometry").selectedOptions[0].textContent;
    $("geometry-key").textContent = geometryName === "grid" ? "current grid" : "current circle";
    $("geometry-swatch").style.setProperty("--swatch", geometryName === "grid" ? COLORS.gridResult : COLORS.curveResult);
    $("marker-legend").hidden = geometryName !== "grid";
    const referenceDescription = referenceMode === "origin"
      ? "the global origin"
      : referenceMode === "point"
        ? `point P at (${cleanNumber(referencePoint[0])}, ${cleanNumber(referencePoint[1])})`
        : `line L through (${cleanNumber(referencePoint[0])}, ${cleanNumber(referencePoint[1])}) at ${cleanNumber(lineAngle)} degrees`;
    canvas.setAttribute("aria-label", `${geometryLabel}, step ${activeStep + 1} of ${stages.length}: ${stages[activeStep].action}, using ${referenceDescription}; original ${showOriginal ? "shown" : "hidden"}, ${info.kind} cumulative matrix, view zoom ${zoomPercent} percent.`);
  }

  function updateSummary() {
    const matrix = selectedMatrix();
    const info = Math2.classify(matrix);
    updateGeometryDescription(info);
    if (!matrixValid || (referenceMode !== "origin" && !referenceValid)) {
      $("status").dataset.kind = "invalid";
      $("status").textContent = matrixError || referenceError;
      return;
    }

    const determinant = cleanNumber(info.determinant);
    const prefix = `Step ${activeStep + 1} of ${stages.length} — ${stages[activeStep].action}. `;
    $("status").dataset.kind = info.singular ? "singular" : info.kind;
    if (info.singular) {
      $("status").textContent = `${prefix}${info.kind === "affine" ? "Affine" : "Projective"} · determinant ${determinant} · singular: area collapses to a line or point.`;
    } else if (info.kind === "affine") {
      $("status").textContent = `${prefix}Affine · determinant ${determinant} · orientation ${info.orientation} · area scale ${cleanNumber(Math.abs(info.determinant))}.`;
    } else {
      $("status").textContent = `${prefix}Projective · determinant ${determinant} · divide by w′; points with w′ = 0 are not drawn.`;
    }
    if (referenceMode === "line" && activeStep === stages.length - 1 && matricesNear(baseMatrix, Math2.preset("reflectX"))) {
      $("status").textContent += " This final matrix reflects in the arbitrary line L.";
    }
  }

  function updateInterface() {
    updateReferenceControls();
    updateBaseFormula();
    updateStepState();
    $("zoom").value = String(zoomPercent);
    $("zoom").setAttribute("aria-valuetext", `${zoomPercent} percent`);
    $("zoom-output").value = `${zoomPercent}%`;
    $("zoom-output").textContent = `${zoomPercent}%`;
    updateSummary();
    scheduleDraw();
  }

  function setMatrix(next, presetName = "custom", shouldAnnounce = false) {
    baseMatrix = [...next];
    matrixValid = true;
    matrixError = "";
    matrixInputs.forEach((input, index) => {
      input.value = cleanNumber(baseMatrix[index]);
      input.removeAttribute("aria-invalid");
    });
    $("preset").value = presetName;
    rebuildStages();
    if (shouldAnnounce) announceStatus();
  }

  function readMatrix() {
    const values = matrixInputs.map((input) => input.valueAsNumber);
    const invalid = values.some((value) => !Number.isFinite(value));
    matrixInputs.forEach((input) => input.toggleAttribute("aria-invalid", !Number.isFinite(input.valueAsNumber)));
    if (invalid) {
      matrixValid = false;
      matrixError = "Every matrix cell needs a finite number. The last valid transformation remains on the canvas.";
      updateSummary();
      return;
    }
    matrixValid = true;
    matrixError = "";
    baseMatrix = values;
    $("preset").value = "custom";
    rebuildStages();
  }

  function readReferencePoint() {
    const controls = [$("reference-x"), $("reference-y")];
    const values = controls.map((input) => input.valueAsNumber);
    const invalid = values.some((value) => !Number.isFinite(value));
    controls.forEach((input) => input.toggleAttribute("aria-invalid", !Number.isFinite(input.valueAsNumber)));
    if (invalid) {
      referenceValid = false;
      referenceError = "Both reference coordinates must be finite numbers. The last valid point or line remains on the canvas.";
      updateSummary();
      return;
    }
    referenceValid = true;
    referenceError = "";
    referencePoint = values;
    rebuildStages();
  }

  function setZoom(nextZoom) {
    zoomPercent = Math.min(200, Math.max(10, Number(nextZoom) || 100));
    updateInterface();
  }

  function announceStatus() {
    $("announcer").textContent = $("status").textContent;
  }

  function worldToScreen(point, plot) {
    return { x: plot.cx + point[0] * plot.scale, y: plot.cy - point[1] * plot.scale };
  }

  function drawAxes(plot) {
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, plot.width, plot.height);
    const xSpan = plot.width / (2 * plot.scale);
    const ySpan = plot.height / (2 * plot.scale);
    context.lineWidth = 1;
    for (let n = Math.ceil(-xSpan); n <= Math.floor(xSpan); n += 1) {
      const point = worldToScreen([n, 0], plot);
      context.strokeStyle = n === 0 ? COLORS.axis : COLORS.grid;
      context.beginPath();
      context.moveTo(point.x, 0);
      context.lineTo(point.x, plot.height);
      context.stroke();
    }
    for (let n = Math.ceil(-ySpan); n <= Math.floor(ySpan); n += 1) {
      const point = worldToScreen([0, n], plot);
      context.strokeStyle = n === 0 ? COLORS.axis : COLORS.grid;
      context.beginPath();
      context.moveTo(0, point.y);
      context.lineTo(plot.width, point.y);
      context.stroke();
    }
    context.fillStyle = "#d8d3e9";
    context.font = "14px system-ui, sans-serif";
    context.fillText("x", plot.width - 18, plot.cy - 8);
    context.fillText("y", plot.cx + 8, 16);
  }

  function drawPaths(paths, plot, color, width, dash = []) {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = width;
    context.setLineDash(dash);
    for (const path of paths) {
      if (path.length < 2) continue;
      context.beginPath();
      path.forEach((point, index) => {
        const screen = worldToScreen(point, plot);
        if (index) context.lineTo(screen.x, screen.y);
        else context.moveTo(screen.x, screen.y);
      });
      context.stroke();
    }
    context.restore();
  }

  function drawPoint(point, plot, color, label, radius = 4.5) {
    if (!point) return;
    const screen = worldToScreen(point, plot);
    context.save();
    context.fillStyle = color;
    context.strokeStyle = COLORS.background;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(screen.x, screen.y, radius, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
    context.font = "800 13px system-ui, sans-serif";
    context.fillText(label, screen.x + 7, screen.y - 7);
    context.restore();
  }

  function drawArrow(start, end, plot, color, label) {
    if (!start || !end) return;
    const a = worldToScreen(start, plot);
    const b = worldToScreen(end, plot);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
    context.beginPath();
    context.moveTo(b.x, b.y);
    context.lineTo(b.x - 9 * Math.cos(angle - Math.PI / 7), b.y - 9 * Math.sin(angle - Math.PI / 7));
    context.lineTo(b.x - 9 * Math.cos(angle + Math.PI / 7), b.y - 9 * Math.sin(angle + Math.PI / 7));
    context.closePath();
    context.fill();
    context.font = "800 13px system-ui, sans-serif";
    context.fillText(label, b.x + 7, b.y - 7);
    context.restore();
  }

  function referenceLine() {
    const radians = lineAngle * Math.PI / 180;
    const direction = [Math.cos(radians), Math.sin(radians)];
    return [Array.from({ length: 161 }, (_, index) => {
      const parameter = -64 + 128 * index / 160;
      return [referencePoint[0] + parameter * direction[0], referencePoint[1] + parameter * direction[1]];
    })];
  }

  function drawReferenceGeometry(plot, matrix) {
    if (referenceMode === "origin") return;
    const currentPoint = Math2.transformPoint(matrix, referencePoint);
    if (referenceMode === "point") {
      drawPoint(referencePoint, plot, COLORS.referenceGhost, "P", 4);
      const unchanged = currentPoint && Math.hypot(currentPoint[0] - referencePoint[0], currentPoint[1] - referencePoint[1]) < 1e-8;
      drawPoint(currentPoint, plot, COLORS.reference, unchanged ? "P" : "P′", 5);
      return;
    }

    const originalLine = referenceLine();
    drawPaths(originalLine, plot, COLORS.referenceGhost, 1.5, [8, 6]);
    drawPaths(originalLine.flatMap((path) => Math2.transformPath(matrix, path)), plot, COLORS.reference, 2.5);
    drawPoint(referencePoint, plot, COLORS.referenceGhost, "P₀", 3.5);
    drawPoint(currentPoint, plot, COLORS.reference, "L", 4.5);
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const matrix = selectedMatrix();
    const source = Math2.geometry(geometryName);
    const transformed = source.flatMap((path) => Math2.transformPath(matrix, path));
    const plot = Math2.makeViewport(width, height, zoomPercent);
    drawAxes(plot);
    if (showOriginal) drawPaths(source, plot, COLORS.original, geometryName === "grid" ? 1 : 2.2, [6, 5]);
    drawPaths(transformed, plot, geometryName === "grid" ? COLORS.gridResult : COLORS.curveResult, geometryName === "grid" ? 1.25 : 3);

    if (geometryName === "grid") {
      if (showOriginal) drawPaths(GRID_MARKER, plot, COLORS.original, 2.5, [6, 5]);
      drawPaths(GRID_MARKER.flatMap((path) => Math2.transformPath(matrix, path)), plot, COLORS.marker, 3.5);
    }

    drawReferenceGeometry(plot, matrix);
    const origin = Math2.transformPoint(matrix, [0, 0]);
    const xBasis = Math2.transformPoint(matrix, [1, 0]);
    const yBasis = Math2.transformPoint(matrix, [0, 1]);
    drawArrow(origin, xBasis, plot, COLORS.xBasis, "C e₁");
    drawArrow(origin, yBasis, plot, COLORS.yBasis, "C e₂");
  }

  function scheduleDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  $("preset").addEventListener("change", () => {
    if ($("preset").value !== "custom") setMatrix(Math2.preset($("preset").value), $("preset").value, true);
  });
  $("geometry").addEventListener("change", () => {
    geometryName = $("geometry").value;
    updateInterface();
    announceStatus();
  });
  $("reference-mode").addEventListener("change", () => {
    referenceMode = $("reference-mode").value;
    updateReferenceControls();
    if (referenceMode === "origin") {
      referenceValid = true;
      referenceError = "";
      rebuildStages();
    } else {
      readReferencePoint();
    }
    announceStatus();
  });
  $("show-original").addEventListener("change", () => {
    showOriginal = $("show-original").checked;
    updateInterface();
    announceStatus();
  });
  $("zoom").addEventListener("input", () => setZoom($("zoom").valueAsNumber));
  $("zoom").addEventListener("change", announceStatus);
  $("step-prev").addEventListener("click", () => selectStep(activeStep - 1, true));
  $("step-next").addEventListener("click", () => selectStep(activeStep + 1, true));

  matrixInputs.forEach((input) => {
    input.addEventListener("input", readMatrix);
    input.addEventListener("change", announceStatus);
  });
  [$("reference-x"), $("reference-y")].forEach((input) => {
    input.addEventListener("input", readReferencePoint);
    input.addEventListener("change", announceStatus);
  });
  $("reference-angle").addEventListener("input", () => {
    lineAngle = $("reference-angle").valueAsNumber;
    rebuildStages();
  });
  $("reference-angle").addEventListener("change", announceStatus);

  const observer = new ResizeObserver(scheduleDraw);
  observer.observe(canvas);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    }
  });

  setMatrix(baseMatrix, "identity");
  setZoom(100);
})();
