(function () {
  "use strict";
  const M = window.MobiusMath;
  const find = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const widthInput = find("#segment-length"), radiusInput = find("#translation-distance");
  const twistInput = find("#twist-count"), lapInput = find("#normal-laps");
  const buildView = window.MobiusThree(find("[data-build-canvas]"), find("[data-build-fallback]"));
  const orientationView = window.MobiusThree(find("[data-orientation-canvas]"), find("[data-orientation-fallback]"));
  const state = { stage: 4, u: 0.5, v: Math.PI / 2, length: 2, distance: 10, twists: 1, translation: 1,
    fullSurface: true, showMarkers: false, showNormal: false, showAxes: true, showBoundary: true, orientation: false, laps: 0 };
  let walkFrame = 0;
  function number(value) { return (Math.abs(value) < 0.00005 ? 0 : value).toFixed(3).replace(/\.?0+$/, "") || "0"; }
  function vector(point) { return "(" + point.map(number).join(", ") + ")"; }
  function write(selector, value) { const node = find(selector); if (node && node.textContent !== value) node.textContent = value; }
  function renderShape() {
    const odd = state.twists % 2 === 1;
    const titles = ["Untwisted band", "Möbius strip", "Band with two half-twists", "Möbius strip with three half-twists"];
    write("[data-scene-title]", titles[state.twists]);
    write("[data-strip-type]", odd ? "Non-orientable" : "Orientable");
    write("[data-strip-summary]", odd ? "An odd number of half-twists gives a one-sided strip with one boundary curve."
      : "An even number of half-twists gives a two-sided band with two boundary curves.");
    const type = find("[data-strip-type]");
    if (type) type.dataset.orientable = String(!odd);
    write("[data-example-normal]", vector(M.derivatives(0.5, Math.PI / 2, state).normal));
    write("[data-size-summary]", "Width " + number(state.length) + " · Radius " + number(state.distance) + " · " + state.twists + (state.twists === 1 ? " half-twist" : " half-twists") + ".");
    buildView.update(state);
  }
  function syncParameters() {
    const width = Number(widthInput.value), minimumRadius = width / 2 + 0.25;
    const previousRadius = Number(radiusInput.value);
    radiusInput.min = String(minimumRadius);
    radiusInput.value = String(Math.max(minimumRadius, previousRadius));
    state.length = width; state.distance = Number(radiusInput.value); state.twists = Number(twistInput.value);
    write("#length-output", number(width)); write("#distance-output", number(state.distance));
    const adjusted = previousRadius < minimumRadius ? "Radius adjusted to " + number(minimumRadius) + ". " : "";
    write("[data-geometry-status]", adjusted + "The radius must exceed half the width. Minimum radius for this width: " + number(minimumRadius) + ".");
  }
  function renderOrientation() {
    const laps = Number(lapInput.value), followed = M.orientation(laps, state), odd = state.twists % 2 === 1;
    write("[data-orientation-heading]", odd ? "One lap reverses the normal" : "One lap restores the normal");
    write("[data-orientability-description]", odd
      ? "With an odd number of half-twists, a normal followed continuously around the strip comes back reversed. A consistent unit normal cannot be chosen over the whole strip, so it is non-orientable."
      : "With an even number of half-twists, a normal followed continuously around the band returns to its starting direction. The normals agree across the join, so the band is orientable.");
    write("#lap-output", laps.toFixed(2) + " laps");
    write("[data-travel-point]", vector(followed.point)); write("[data-travel-normal]", vector(followed.normal));
    let title, message, badge, returned = "";
    if (Math.abs(laps) < 1e-8) {
      title = "Start: choose a normal."; message = "The gold and violet arrows agree at the starting point."; badge = "Start"; returned = "same";
    } else if (Math.abs(laps - 1) < 1e-8) {
      title = odd ? "One lap: the normal is reversed." : "One lap: the normal returns.";
      message = "The point is back at (" + number(state.distance) + ", 0, 0). " + (odd
        ? "The gold normal is (1, 0, 0), opposite to the starting normal."
        : "The gold normal is (−1, 0, 0), agreeing with the starting normal.");
      badge = odd ? "One lap · reversed" : "One lap · unchanged"; returned = odd ? "opposite" : "same";
    } else if (Math.abs(laps - 2) < 1e-8) {
      title = odd ? "Two laps: the original direction returns." : "Two laps: the normals still agree.";
      message = odd ? "A second circuit restores the followed normal to (−1, 0, 0). One circuit was not enough."
        : "With an even number of half-twists, the normal agrees after every complete circuit.";
      badge = odd ? "Two laps · restored" : "Two laps · unchanged"; returned = "same";
    } else {
      title = laps < 1 ? "First lap: follow the normal continuously." : "Second lap: continue through the seam.";
      message = "Compare the gold arrow with the violet starting arrow when the moving point completes a lap.";
      badge = laps < 1 ? "First lap" : "Second lap";
    }
    write("[data-orientation-status]", title); write("[data-orientation-message]", message); write("[data-lap-tag]", badge);
    find(".orientation-result").dataset.return = returned;
    all("[data-laps]").forEach(button => button.setAttribute("aria-pressed", String(Math.abs(Number(button.dataset.laps) - laps) < 1e-8)));
    orientationView.update({ ...state, orientation: true, showNormal: true, showMarkers: true, laps });
  }
  function stopWalk() {
    if (walkFrame) cancelAnimationFrame(walkFrame);
    walkFrame = 0; write("[data-walk]", "Animate two laps");
  }
  function parametersChanged() { stopWalk(); syncParameters(); renderShape(); renderOrientation(); }
  [widthInput, radiusInput].forEach(input => input.addEventListener("input", parametersChanged));
  twistInput.addEventListener("change", parametersChanged);
  all("[data-build-view]").forEach(button => button.addEventListener("click", () => buildView.reset()));
  all("[data-build-zoom]").forEach(button => button.addEventListener("click", () => buildView.zoom(Number(button.dataset.buildZoom))));
  lapInput.addEventListener("input", () => { stopWalk(); renderOrientation(); });
  all("[data-laps]").forEach(button => button.addEventListener("click", () => { stopWalk(); lapInput.value = button.dataset.laps; renderOrientation(); }));
  find("[data-walk]").addEventListener("click", () => {
    if (walkFrame) { stopWalk(); return; }
    const startLap = Number(lapInput.value) >= 2 ? 0 : Number(lapInput.value), start = performance.now();
    write("[data-walk]", "Pause walk");
    function frame(now) {
      const laps = Math.min(2, startLap + (now - start) / 7000);
      lapInput.value = String(laps); renderOrientation();
      if (laps < 2) walkFrame = requestAnimationFrame(frame);
      else stopWalk();
    }
    walkFrame = requestAnimationFrame(frame);
  });
  find("[data-orientation-reset]").addEventListener("click", () => orientationView.reset());
  all("[data-orientation-zoom]").forEach(button => button.addEventListener("click", () => orientationView.zoom(Number(button.dataset.orientationZoom))));
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopWalk(); });
  window.addEventListener("pagehide", event => { stopWalk(); if (!event.persisted) { buildView.dispose(); orientationView.dispose(); } });
  syncParameters(); renderShape(); renderOrientation();
})();
