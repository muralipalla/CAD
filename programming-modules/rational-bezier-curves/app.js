(function () {
  "use strict";
  const M = window.RationalBezierMath;
  const find = selector => document.querySelector(selector);
  const radiusInput = find("#radius"), thetaInput = find("#theta"), uInput = find("#parameter-u");
  const canvas = find("[data-projection-canvas]"), ctx = canvas.getContext("2d");
  const view = window.RationalBezierThree(find("[data-three-canvas]"), find("[data-three-fallback]"));
  let model, samples, showLabels = false;
  const format = value => value !== 0 && Math.abs(value) < 0.0001 ? value.toExponential(3) : value.toFixed(4);
  const coordinates = point => point ? "(" + point.map(format).join(", ") + ")" : "Undefined at the apex (W = 0)";
  function drawProjection() {
    if (!model || !ctx) return;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const r = model.radius, right = 1.3 * r, left = -1.3 * r;
    const padding = width < 340 ? 34 : 43;
    const scale = Math.min((width - padding * 2) / (right - left), (height - padding * 2) / (2.35 * r));
    const xOrigin = (width - (right + left) * scale) / 2, yOrigin = height / 2;
    const pixel = point => [xOrigin + point[0] * scale, yOrigin - point[1] * scale];
    function path(points, color, lineWidth = 1, dash = []) {
      ctx.beginPath(); points.forEach((p, i) => { const [x, y] = pixel(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    }
    function text(label, p, dx = 8, dy = -9, color = "#eae8ff") {
      const [x, y] = pixel(p); ctx.fillStyle = color; ctx.font = "600 14px system-ui, sans-serif"; ctx.textAlign = "left";
      if (x < 0 || x > width || y < 0 || y > height) return;
      ctx.fillText(label, Math.max(5, Math.min(width - ctx.measureText(label).width - 5, x + dx)), Math.max(17, Math.min(height - 5, y + dy)));
    }
    function point(p, color, label, dx, dy) {
      const [x, y] = pixel(p); ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      if (label && showLabels) text(label, p, dx, dy, color);
    }
    path([[left, 0], [right + 0.08 * r, 0]], "#555179");
    path([[0, -1.15 * r], [0, 1.15 * r]], "#555179");
    text("x", [right + 0.08 * r, 0], 8, 22); text("y", [0, 1.15 * r], -20, 0);
    text("0", [0, 0], -18, 18, "#c9c6e4");
    const circle = Array.from({ length: 161 }, (_, i) => [r * Math.cos(i * Math.PI / 80), r * Math.sin(i * Math.PI / 80)]);
    path(circle, "#a6a3c6", 1.5);
    path([[0, 0], model.projected[0]], "#777299", 1, [3, 4]); path([[0, 0], model.projected[2]], "#777299", 1, [3, 4]);
    if (model.projected[1]) {
      path(model.projected, "#76dcc1", 1.5, [6, 5]);
      point(model.projected[1], "#76dcc1", "p₁", 8, -12);
    } else {
      for (const p of [model.projected[0], model.projected[2]]) path([p, [4 * r, p[1], 1]], "#76dcc1", 1.5, [6, 5]);
    }
    path(samples.arc, "#76dcc1", 3);
    point(model.projected[0], "#eae8ff", "p₀", 8, 20);
    point(model.projected[2], "#eae8ff", "p₂", 8, -10);
    text("C", [-0.78 * r, 0.78 * r], -18, -6, "#c9c6e4");
    const angleArc = Array.from({ length: 31 }, (_, i) => [0.28 * r * Math.cos(model.theta * i / 30), 0.28 * r * Math.sin(model.theta * i / 30)]);
    path(angleArc, "#b8a7f5", 1); text("θ", [0.33 * r * Math.cos(model.theta / 2), 0.33 * r * Math.sin(model.theta / 2)], 0, -3, "#b8a7f5");
    const p = M.rational(model, Number(uInput.value));
    if (p) point(p, "#ff9986", "r(u)", -27, 24);
  }
  function updateParameter() {
    const u = Number(uInput.value), h = M.lifted(model, u), p = M.rational(model, u);
    find("#u-value").textContent = u.toFixed(3);
    find("[data-lifted]").textContent = coordinates(h);
    find("[data-projected]").textContent = coordinates(p);
    find("[data-denominator]").textContent = format(h[2]);
    if (view) view.updateParameter(u);
    drawProjection();
  }
  function updateConstruction() {
    model = M.construction(Number(radiusInput.value), Number(thetaInput.value));
    samples = M.sample(model);
    find("#radius-value").textContent = model.radius.toFixed(2);
    find("#theta-value").textContent = model.degrees + "°";
    find("[data-arc-angle]").textContent = 2 * model.degrees + "°";
    find("[data-weights]").textContent = "(1, " + format(model.c) + ", 1)";
    const note = model.degrees === 0 ? "0°: the selected arc collapses to one point. The reference circle remains visible."
      : model.degrees === 90 ? "90°: a semicircle. The middle control p₁ is at infinity (w₁ = 0); homogeneous evaluation keeps the curve finite."
      : model.degrees === 180 ? "180°: the 360° limit is singular for a single quadratic. The cone section collapses to a generator; its projection is one point, undefined at u = 0.5. C remains the reference circle."
      : model.degrees > 90 ? "Major arc: w₁ is negative. P₁ lies below w = 0; its projection lies on the opposite extension of the line through O."
      : "Minor arc: all three weights are positive.";
    find("[data-construction-note]").textContent = note;
    find("[data-control-note]").textContent = !model.projected[1] ? "p₁ is at infinity; the endpoint tangents are parallel."
      : Math.abs(model.projected[1][0]) > 1.3 * model.radius ? "p₁ is outside the fixed circle frame. Its coordinates remain in the table below."
      : model.degrees === 0 || model.degrees === 180 ? "The control configuration is degenerate at this endpoint angle."
      : "p₁ is the intersection of the endpoint tangents and lies outside the circle.";
    find("[data-vertex]").textContent = coordinates(model.vertex);
    find("[data-controls-table]").replaceChildren(...model.controls.map((p, i) => {
      const row = document.createElement("tr");
      [String(i), coordinates(p), model.projected[i] ? coordinates(model.projected[i]) : "At infinity (w₁ = 0)", format(model.weights[i])].forEach((value, j) => {
        const cell = document.createElement(j === 0 ? "th" : "td");
        if (j === 0) cell.scope = "row";
        cell.textContent = value; row.appendChild(cell);
      }); return row;
    }));
    if (view) view.update(model, Number(uInput.value));
    updateParameter();
    if (window.RationalBezierCode) window.RationalBezierCode.update(model);
  }
  radiusInput.addEventListener("input", updateConstruction); thetaInput.addEventListener("input", updateConstruction); uInput.addEventListener("input", updateParameter);
  document.querySelectorAll("[data-layer]").forEach(input => input.addEventListener("change", () => view?.setLayer(input.dataset.layer, input.checked)));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => view?.setView(button.dataset.view)));
  document.querySelectorAll("[data-zoom]").forEach(button => button.addEventListener("click", () => view?.zoom(Number(button.dataset.zoom))));
  find("[data-show-labels]").addEventListener("change", event => { showLabels = event.target.checked; view?.setLabels(showLabels); drawProjection(); });
  find("[data-reset]").addEventListener("click", () => {
    radiusInput.value = 2; thetaInput.value = 60; uInput.value = 0.5;
    showLabels = false; find("[data-show-labels]").checked = false; view?.setLabels(false);
    document.querySelectorAll("[data-layer]").forEach(input => { input.checked = input.dataset.layer !== "rays"; view?.setLayer(input.dataset.layer, input.checked); });
    updateConstruction(); view?.setView("orbit");
  });
  if (!view) document.querySelectorAll("[data-layer], [data-view], [data-zoom]").forEach(element => { element.disabled = true; });
  const observer = new ResizeObserver(drawProjection); observer.observe(canvas);
  updateConstruction();
  window.addEventListener("pagehide", event => { if (!event.persisted) { observer.disconnect(); view?.dispose(); } });
})();
