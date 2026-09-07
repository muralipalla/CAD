(function () {
  "use strict";
  const Math3 = window.SurfaceMath;
  const state = new Math3.Grid();
  const $ = (name) => document.querySelector(`[data-${name}]`);
  const canvas = $("xy"), ctx = canvas.getContext("2d");
  const view = new window.SurfaceThree($("three"), $("three-fallback"), (index) => { if (state.select(index)) update(); });
  const colors = ["#ff9986", "#76dcc1", "#b8a7f5", "#ffd166"];
  let language = "python", drag = null, frame = 0;
  const cells = Array.from({ length: 16 }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "point-cell";
    button.style.setProperty("--point-color", colors[Math.floor(index / 4)]);
    button.innerHTML = `<strong>${Math3.label(index)}</strong><span></span>`;
    button.addEventListener("click", () => { if (state.select(index)) update(); });
    $("point-grid").append(button);
    return button;
  });
  function plot() {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    return { width, height, left: 42, right: width - 22, top: 24, bottom: height - 36 };
  }
  function screen(p, bounds) {
    return { x: bounds.left + p.x / 10 * (bounds.right - bounds.left), y: bounds.bottom - p.y / 10 * (bounds.bottom - bounds.top) };
  }
  function world(p, bounds) {
    return { x: Math3.clamp((p.x - bounds.left) / (bounds.right - bounds.left) * 10, 0, 10),
      y: Math3.clamp((bounds.bottom - p.y) / (bounds.bottom - bounds.top) * 10, 0, 10) };
  }
  function draw() {
    const bounds = plot();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * ratio), height = Math.round(bounds.height * ratio);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#171541"; ctx.fillRect(0, 0, bounds.width, bounds.height);
    ctx.lineWidth = 1; ctx.font = "12px sans-serif";
    for (let n = 0; n <= 10; n += 1) {
      const a = screen({ x: n, y: 0 }, bounds), b = screen({ x: 0, y: n }, bounds);
      ctx.strokeStyle = n === 0 ? "#9790b7" : "#39345b";
      ctx.beginPath(); ctx.moveTo(a.x, bounds.top); ctx.lineTo(a.x, bounds.bottom);
      ctx.moveTo(bounds.left, b.y); ctx.lineTo(bounds.right, b.y); ctx.stroke();
      if (n % 2 === 0) {
        ctx.fillStyle = "#c8c1e3"; ctx.textAlign = "center"; ctx.fillText(String(n), a.x, bounds.bottom + 19);
        ctx.textAlign = "right"; ctx.fillText(String(n), bounds.left - 10, b.y + 4);
      }
    }
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "right"; ctx.fillText("x", bounds.right + 15, bounds.bottom + 19);
    ctx.textAlign = "left"; ctx.fillText("y", bounds.left - 22, bounds.top - 9);
    ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 1.5;
    for (const [a, b] of Math3.netEdges(state.points.length)) {
      const p = screen(state.points[a], bounds), q = screen(state.points[b], bounds);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    state.points.forEach((point, index) => {
      const p = screen(point, bounds);
      ctx.beginPath(); ctx.arc(p.x, p.y, index === state.selected ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = colors[Math.floor(index / 4)]; ctx.fill();
      ctx.lineWidth = index === state.selected ? 3 : 1.5; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.font = "bold 13px sans-serif"; ctx.textAlign = p.x > bounds.right - 45 ? "right" : "left";
      const dx = ctx.textAlign === "right" ? -11 : 11;
      ctx.strokeStyle = "#171541"; ctx.lineWidth = 4;
      ctx.strokeText(Math3.label(index), p.x + dx, p.y - 10);
      ctx.fillStyle = "#fff"; ctx.fillText(Math3.label(index), p.x + dx, p.y - 10);
    });
  }
  function scheduleGraphics() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0; draw();
      view.update(state.points, state.selected, { mode: state.mode, net: $("net").checked, labels: $("labels").checked, wireframe: $("wireframe").checked });
    });
  }
  function updateCode() {
    $("code").textContent = window.SurfaceCode[language](state.points, state.mode);
    $("filename").textContent = language === "python" ? "bspline_surface.py" : "bspline_surface.m";
    document.querySelectorAll("[data-language]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
  }
  function update() {
    const point = state.points[state.selected];
    const prompt = `Selected ${Math3.label(state.selected)} · drag to move, or edit its coordinates.`;
    if ($("prompt").textContent !== prompt) $("prompt").textContent = prompt;
    $("x").value = point.x.toFixed(2); $("y").value = point.y.toFixed(2);
    $("z").value = point.z;
    $("height-output").textContent = point.z.toFixed(2);
    $("height-label").textContent = `Height z · ${Math3.label(state.selected)}`;
    $("z").setAttribute("aria-label", `Height z of ${Math3.label(state.selected)}`);
    $("mode").value = state.mode;
    $("mode-help").textContent = state.mode === "clamped" ? "Clamped: the surface interpolates the four corner points." : "Open (unclamped): uniform knots; the surface generally does not interpolate the corner points.";
    $("knots").textContent = `U = V = [${Math3.KNOTS[state.mode].join(", ")}]`;
    $("surface-message").textContent = `${state.mode === "clamped" ? "Clamped" : "Open (unclamped)"} bicubic patch · 16 control points · u, v ∈ [0, 1].`;
    cells.forEach((button, index) => {
      const p = state.points[index];
      button.setAttribute("aria-pressed", String(index === state.selected));
      button.setAttribute("aria-label", `${Math3.label(index)}: x ${p.x}, y ${p.y}, z ${p.z}. Select to edit.`);
      button.querySelector("span").textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}\nz ${p.z.toFixed(2)}`;
    });
    updateCode(); scheduleGraphics();
  }
  $("z").addEventListener("input", () => { state.edit("z", Number($("z").value)); update(); });
  $("mode").addEventListener("change", () => { state.setMode($("mode").value); update(); });
  for (const axis of ["x", "y"]) {
    $(axis).addEventListener("change", () => {
      const input = $(axis), value = input.valueAsNumber;
      if (Number.isFinite(value)) {
        state.edit(axis, value);
      }
      update();
    });
  }
  $("reset-grid").addEventListener("click", () => { state.reset(); update(); canvas.focus({ preventScroll: true }); });
  function eventPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const bounds = plot(), p = eventPoint(event);
    if (p.x < bounds.left || p.x > bounds.right || p.y < bounds.top || p.y > bounds.bottom) return;
    canvas.focus({ preventScroll: true });
    let hit = -1, distance = 14;
    state.points.forEach((point, index) => {
      const q = screen(point, bounds), d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < distance) { hit = index; distance = d; }
    });
    if (hit < 0 || !state.select(hit)) return;
    const center = screen(state.points[hit], bounds);
    drag = { id: event.pointerId, offsetX: p.x - center.x, offsetY: p.y - center.y };
    canvas.setPointerCapture(event.pointerId);
    update();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const pointer = eventPoint(event);
    const p = world({ x: pointer.x - drag.offsetX, y: pointer.y - drag.offsetY }, plot());
    state.edit("x", p.x); state.edit("y", p.y); update();
  });
  function stop(event) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener("pointerup", stop); canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("lostpointercapture", () => { drag = null; });
  canvas.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "[", "]"].includes(event.key)) return;
    event.preventDefault();
    if (["[", "]"].includes(event.key)) { state.select((state.selected + (event.key === "[" ? 15 : 1)) % 16); update(); return; }
    if (event.key === "Enter") {
      $("z").focus({ preventScroll: true });
      return;
    }
    const axis = ["ArrowLeft", "ArrowRight"].includes(event.key) ? "x" : "y";
    const change = (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? .5 : .1);
    state.edit(axis, state.points[state.selected][axis] + change);
    update();
  });
  for (const name of ["net", "labels", "wireframe"]) $(name).addEventListener("change", scheduleGraphics);
  $("reset-view").addEventListener("click", () => view.reset());
  $("zoom-in").addEventListener("click", () => view.zoom(.85));
  $("zoom-out").addEventListener("click", () => view.zoom(1.18));
  document.querySelectorAll("[data-language]").forEach((button) => button.addEventListener("click", () => { language = button.dataset.language; updateCode(); }));
  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("code").textContent);
      $("copy-status").textContent = "Code copied.";
    } catch {
      const selection = window.getSelection(), range = document.createRange();
      range.selectNodeContents($("code")); selection.removeAllRanges(); selection.addRange(range);
      $("copy-status").textContent = "Code selected. Press Ctrl+C or use your device’s Copy command.";
    }
  });
  const observer = new ResizeObserver(draw); observer.observe(canvas);
  window.addEventListener("pagehide", (event) => { if (!event.persisted) { observer.disconnect(); if (frame) cancelAnimationFrame(frame); view.dispose(); } });
  update();
})();
