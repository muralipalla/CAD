(function () {
  "use strict";

  const M = window.SurfaceGeometryMath;
  const find = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const write = (selector, value) => { const node = find(selector); if (node) node.textContent = value; };
  const number = value => (Math.abs(value) < 0.00005 ? 0 : value).toFixed(3).replace(/\.000$/, "");
  const vector = values => `(${values.map(number).join(", ")})`;

  const gaussU = find("#gauss-u"), gaussV = find("#gauss-v"), gaussArea = find("#gauss-area"), gaussSurface = find("#gauss-surface");
  const torusU = find("#torus-u"), torusV = find("#torus-v");
  const sphereAngle = find("#sphere-plane-angle");
  if (!M || !gaussU || !gaussV || !gaussArea || !gaussSurface || !torusU || !sphereAngle) return;

  const sphereView = window.SphereCurveCurvatureThree(find("[data-sphere-curvature-canvas]"), find("[data-sphere-curvature-fallback]"));
  const gaussView = window.GaussMapThree(find("[data-gauss-map-canvas]"), find("[data-gauss-map-fallback]"));
  const torusView = window.TorusCurvatureThree(find("[data-torus-curvature-canvas]"), find("[data-torus-curvature-fallback]"));
  const torusOptions = { u: Number(torusU.value), v: Number(torusV.value), showPlane: true, showIsolines: true };
  let gaussFrame = 0, torusFrame = 0;

  function renderSphereCurvature() {
    const angle = Number(sphereAngle.value), data = M.spherePlaneCurvature(angle);
    write("#sphere-plane-angle-output", `${angle.toFixed(0)}°`);
    write("[data-sphere-circle-radius]", number(data.circleRadius));
    write("[data-sphere-kappa-n]", number(data.normalCurvatureMagnitude));
    write("[data-sphere-kappa]", data.singular ? "∞ (limiting)" : number(data.curvatureMagnitude));
    write("[data-sphere-kappa-g]", data.singular ? "∞ (limiting)" : number(data.geodesicCurvatureMagnitude));
    const status = data.circleType === "great"
      ? "Great circle · κg = 0"
      : data.circleType === "tangent"
        ? "Tangent plane · point contact"
        : `Small circle · κg = ${number(data.geodesicCurvatureMagnitude)}`;
    write("[data-sphere-curvature-status]", status);
    sphereView.update({ angle });
  }
  sphereAngle.addEventListener("input", renderSphereCurvature);
  find("[data-reset-sphere-view]").addEventListener("click", () => sphereView.reset());
  find("[data-zoom-in-sphere]").addEventListener("click", () => sphereView.zoomIn());
  find("[data-zoom-out-sphere]").addEventListener("click", () => sphereView.zoomOut());

  function renderGauss() {
    const u = Number(gaussU.value), v = Number(gaussV.value), areaFraction = Number(gaussArea.value) / 100;
    const surfaceType = gaussSurface.value, surface = M.GAUSS_SURFACE_TYPES[surfaceType];
    const data = M.gaussSurfaceDerivatives(u, v, surfaceType);
    write("#gauss-u-output", number(u)); write("#gauss-v-output", number(v));
    write("#gauss-area-output", `${gaussArea.value}%`);
    write("[data-gauss-point]", vector(data.point)); write("[data-gauss-normal]", vector(data.normal)); write("[data-gauss-image]", vector(data.normal));
    write("[data-gauss-status]", `${surface.label} · ${surface.curvature} curvature · ${gaussArea.value}% mapped`);
    gaussView.update({ u, v, areaFraction, surfaceType });
  }
  function stopGauss() {
    if (gaussFrame) cancelAnimationFrame(gaussFrame);
    gaussFrame = 0; write("[data-animate-gauss]", "Animate point");
  }
  [gaussU, gaussV, gaussArea].forEach(input => input.addEventListener("input", () => { stopGauss(); renderGauss(); }));
  gaussSurface.addEventListener("change", () => { stopGauss(); renderGauss(); });
  find("[data-animate-gauss]").addEventListener("click", () => {
    if (gaussFrame) { stopGauss(); return; }
    const start = performance.now(); write("[data-animate-gauss]", "Pause animation");
    function step(now) {
      const phase = (now - start) / 6500;
      gaussU.value = String(0.5 + 0.38 * Math.sin(M.TAU * phase));
      gaussV.value = String(0.5 + 0.34 * Math.sin(M.TAU * phase * 1.7 + 0.7));
      renderGauss(); gaussFrame = requestAnimationFrame(step);
    }
    gaussFrame = requestAnimationFrame(step);
  });
  find("[data-reset-gauss-view]").addEventListener("click", () => gaussView.reset());

  function renderTorus() {
    torusOptions.u = Number(torusU.value); torusOptions.v = Number(torusV.value);
    const data = M.torusGeometry(torusOptions.u, torusOptions.v), angle = data.phi * 180 / Math.PI;
    write("#torus-u-output", `${number(torusOptions.u)} · ${(torusOptions.u * 360).toFixed(1)}°`);
    write("#torus-v-output", `${number(torusOptions.v)} · ${(torusOptions.v * 360).toFixed(1)}°`);
    write("[data-gaussian-curvature]", number(data.gaussian)); write("[data-torus-phi]", `${angle.toFixed(1)}°`);
    write("[data-torus-point]", vector(data.point)); write("[data-torus-normal]", vector(data.normal));
    const label = data.classification === "positive" ? "Positive" : data.classification === "negative" ? "Negative" : "Zero";
    write("[data-curvature-sign]", label);
    const badge = find("[data-curvature-kind]"); if (badge) badge.dataset.curvatureKind = data.classification;
    all("[data-curvature-preset]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.curvaturePreset === data.classification)));
    torusView.update(torusOptions);
  }
  function stopTorus() {
    if (torusFrame) cancelAnimationFrame(torusFrame);
    torusFrame = 0; write("[data-animate-torus]", "Animate point");
  }
  [torusU, torusV].forEach(input => input.addEventListener("input", () => { stopTorus(); renderTorus(); }));
  all("[data-curvature-preset]").forEach(button => button.addEventListener("click", () => {
    stopTorus();
    torusV.value = button.dataset.curvaturePreset === "positive" ? "0" : button.dataset.curvaturePreset === "zero" ? "0.25" : "0.5";
    renderTorus();
  }));
  all("[data-torus-option]").forEach(input => input.addEventListener("change", () => {
    torusOptions[input.dataset.torusOption] = input.checked; torusView.update(torusOptions);
  }));
  find("[data-reset-torus-view]").addEventListener("click", () => torusView.reset());
  find("[data-animate-torus]").addEventListener("click", () => {
    if (torusFrame) { stopTorus(); return; }
    const moving = find('input[name="torus-motion"]:checked').value;
    const input = moving === "u" ? torusU : torusV, startValue = Number(input.value), start = performance.now();
    write("[data-animate-torus]", "Pause animation");
    function step(now) {
      input.value = String((startValue + (now - start) / 7000) % 1);
      renderTorus(); torusFrame = requestAnimationFrame(step);
    }
    torusFrame = requestAnimationFrame(step);
  });
  all('input[name="torus-motion"]').forEach(input => input.addEventListener("change", stopTorus));

  document.addEventListener("visibilitychange", () => { if (document.hidden) { stopGauss(); stopTorus(); } });
  window.addEventListener("pagehide", event => {
    stopGauss(); stopTorus();
    if (!event.persisted) { sphereView.dispose(); gaussView.dispose(); torusView.dispose(); }
  });
  renderSphereCurvature(); renderGauss(); renderTorus();
})();
