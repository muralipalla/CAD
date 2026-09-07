(function () {
  "use strict";
  const Math3 = window.SurfaceMath;
  const state = new Math3.Capture();
  const $ = (name) => document.querySelector(`[data-${name}]`);
  const canvas = $("xy"), ctx = canvas.getContext("2d");
  const view = new window.SurfaceThree($("three"), $("three-fallback"));
  const colors = ["#ff9986", "#76dcc1", "#b8a7f5", "#ffd166"];
  let language = "python", cursor = { x: 2, y: 2 }, drag = null, frame = 0;
  const cells = Array.from({ length: 16 }, (_, index) => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "point-cell";
    button.style.setProperty("--point-color", colors[Math.floor(index / 4)]);
    button.innerHTML = `<strong>${Math3.label(index)}</strong><span>Not placed</span>`;
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
    if (!state.pending && state.selected < 0 && state.points.length < 16) {
      const p = screen(cursor, bounds);
      ctx.strokeStyle = "#e2ddfa"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(p.x - 10, p.y); ctx.lineTo(p.x + 10, p.y);
      ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x, p.y + 10); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  function scheduleGraphics() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0; draw();
      view.update(state.points, state.selected, { net: $("net").checked, labels: $("labels").checked, wireframe: $("wireframe").checked });
    });
  }
  function updateCode() {
    $("code").textContent = window.SurfaceCode[language](state.points);
    $("filename").textContent = language === "python" ? "bspline_surface.py" : "bspline_surface.m";
    document.querySelectorAll("[data-language]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
  }
  function update() {
    const point = state.points[state.selected];
    $("count").textContent = `${state.confirmed} / 16`;
    const prompt = state.pending ? `Set z for ${Math3.label(state.selected)}, then confirm ${state.points.length === 16 ? "to finish" : `and place ${Math3.label(state.points.length)}`}.`
      : state.points.length === 16 ? "All 16 points confirmed. Select a point to edit its coordinates."
        : point ? `Editing ${Math3.label(state.selected)}. Click empty space to place ${Math3.label(state.points.length)} next.`
          : `Click ${Math3.label(state.points.length)} on the x–y plane.`;
    if ($("prompt").textContent !== prompt) $("prompt").textContent = prompt;
    $("x").value = (point || cursor).x.toFixed(2); $("y").value = (point || cursor).y.toFixed(2);
    $("z").disabled = !point; $("z").value = point?.z ?? 0;
    $("height-output").textContent = (point?.z ?? 0).toFixed(2);
    $("height-label").textContent = point ? `Height z · ${Math3.label(state.selected)}` : "Height z · select or place a point";
    $("confirm").disabled = !state.pending;
    $("confirm").textContent = state.points.length === 16 ? "Confirm P33 · finish surface" : state.pending ? `Confirm ${Math3.label(state.selected)} · next point` : "Confirm point";
    $("place").disabled = state.pending || state.points.length === 16;
    $("undo").disabled = $("clear").disabled = !state.points.length;
    $("three-empty").hidden = state.points.length === 16 || !$("three-fallback").hidden;
    $("surface-message").textContent = state.points.length === 16 ? (state.pending ? "Surface preview ready. Adjust P33’s height and confirm to finish." : "Uniform bicubic patch · 16 control points · u, v ∈ [0, 1].")
      : `${state.points.length} of 16 points placed. The 3D view shows the available control net.`;
    cells.forEach((button, index) => {
      const p = state.points[index];
      button.disabled = !p || (state.pending && index !== state.selected);
      button.dataset.placed = String(Boolean(p));
      button.dataset.next = String(index === state.points.length && !state.pending);
      button.setAttribute("aria-pressed", String(index === state.selected));
      button.setAttribute("aria-label", p ? `${Math3.label(index)}: x ${p.x}, y ${p.y}, z ${p.z}. Select to edit.` : `${Math3.label(index)}: not placed`);
      button.querySelector("span").textContent = p ? `${p.x.toFixed(1)}, ${p.y.toFixed(1)}\nz ${p.z.toFixed(2)}` : index === state.points.length ? "Next point" : "Not placed";
    });
    updateCode(); scheduleGraphics();
  }
  function nextCursor() {
    cursor = { x: 2 + (state.points.length % 4) * 2, y: 2 + Math.floor(state.points.length / 4) * 2 };
  }
  function confirm() {
    if (state.confirm()) { nextCursor(); update(); canvas.focus({ preventScroll: true }); }
  }
  $("confirm").addEventListener("click", confirm);
  $("z").addEventListener("input", () => { state.edit("z", Number($("z").value)); update(); });
  $("z").addEventListener("keydown", (event) => { if (event.key === "Enter" && state.pending) { event.preventDefault(); confirm(); } });
  for (const axis of ["x", "y"]) {
    $(axis).addEventListener("change", () => {
      const input = $(axis), value = input.valueAsNumber;
      if (Number.isFinite(value)) {
        if (state.selected >= 0) state.edit(axis, value);
        else cursor[axis] = Math.round(Math3.clamp(value, 0, 10) * 100) / 100;
      }
      update();
    });
  }
  $("place").addEventListener("click", () => {
    if (state.place(Number($("x").value), Number($("y").value))) { update(); $("z").focus({ preventScroll: true }); }
  });
  $("undo").addEventListener("click", () => { state.undo(); nextCursor(); update(); });
  $("clear").addEventListener("click", () => { state.clear(); nextCursor(); update(); canvas.focus({ preventScroll: true }); });
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
    let added = false;
    if (hit >= 0) {
      if (!state.select(hit)) return;
    } else {
      const q = world(p, bounds);
      if (!state.place(q.x, q.y)) return;
      added = true;
    }
    drag = { id: event.pointerId, added };
    canvas.setPointerCapture(event.pointerId);
    update();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const p = world(eventPoint(event), plot());
    state.edit("x", p.x); state.edit("y", p.y); update();
  });
  function stop(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const added = drag.added; drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (added) $("z").focus({ preventScroll: true });
  }
  canvas.addEventListener("pointerup", stop); canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("lostpointercapture", () => { drag = null; });
  canvas.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") { if (!state.pending && state.points.length < 16) { state.selected = -1; update(); } return; }
    if (event.key === "Enter") {
      if (state.pending) confirm();
      else if (state.selected >= 0) $("z").focus({ preventScroll: true });
      else if (state.place(cursor.x, cursor.y)) { update(); $("z").focus({ preventScroll: true }); }
      return;
    }
    const axis = ["ArrowLeft", "ArrowRight"].includes(event.key) ? "x" : "y";
    const change = (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1) * (event.shiftKey ? .5 : .1);
    if (state.selected >= 0) state.edit(axis, state.points[state.selected][axis] + change);
    else cursor[axis] = Math.round(Math3.clamp(cursor[axis] + change, 0, 10) * 100) / 100;
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
