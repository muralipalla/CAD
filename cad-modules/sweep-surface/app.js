(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const M = window.SweepMath;
  const pathFields = ["path-x", "path-y", "path-z"].map($);
  const profileFields = ["profile-a", "profile-b"].map($);
  const pathPresets = {
    helix: ["3*cos(3*pi*u)", "3*sin(3*pi*u)", "6*(u-0.5)"],
    circle: ["3*cos(2*pi*u)", "3*sin(2*pi*u)", "0"],
    wave: ["8*(u-0.5)", "1.5*sin(2*pi*u)", "sin(4*pi*u)"],
    line: ["0", "0", "8*(u-0.5)"]
  };
  const profilePresets = {
    circle: ["cos(2*pi*v)", "sin(2*pi*v)"],
    ellipse: ["1.4*cos(2*pi*v)", "0.65*sin(2*pi*v)"],
    segment: ["2*v-1", "0"],
    flower: ["(1+0.25*cos(10*pi*v))*cos(2*pi*v)", "(1+0.25*cos(10*pi*v))*sin(2*pi*v)"]
  };
  let model, applied = null, dirty = false, playing = false, animation = 0, previousTime = 0;
  let buildPending = false, animationU = 0, lastProbe = { u: 0.65, v: 0.2 };
  let intersectionTriangles = [], checkVersion = 0, checking = false;
  const status = $("curve-status");
  if (!M || !window.SweepThree) {
    status.dataset.state = "error";
    status.textContent = "The module could not load. Keep the HTML, JavaScript and local assets together, then reload.";
    $("view-fallback").hidden = false;
    return;
  }
  const viewer = window.SweepThree($("sweep-canvas"), $("view-fallback"));
  const exportHelp = "Download the current view and visible layers. SVG uses flat vector shading and approximate depth ordering.";
  if (!viewer.available) {
    $("download-png").disabled = true; $("download-svg").disabled = true;
    $("export-status").textContent = "Image downloads require a working 3D view.";
  }
  const fixed = n => Math.abs(n) < 0.0005 ? "0.000" : n.toFixed(3);
  const vectorText = p => "(" + p.map(fixed).join(", ") + ")";
  function announce(message, state = "ok") { status.textContent = message; status.dataset.state = state; }
  function shape() {
    return { mode: $("frame-mode").value, scale: Number($("profile-scale").value), twist: Number($("twist").value), taper: Number($("taper").value) };
  }
  function labels() {
    $("u-output").value = Number($("sweep-u").value).toFixed(3);
    $("v-output").value = Number($("profile-v").value).toFixed(3);
    $("scale-output").value = Number($("profile-scale").value).toFixed(2);
    $("twist-output").value = $("twist").value + "°";
    $("taper-output").value = Number($("taper").value).toFixed(2);
  }
  function render() {
    labels();
    if (!model) return;
    const u = Number($("sweep-u").value), v = Number($("profile-v").value);
    try {
    const probe = model.point(u, v);
    viewer.update(model, {
      u, v, progress: $("reveal").checked ? u : 1,
      showSurface: $("show-surface").checked, showWireframe: $("show-wireframe").checked,
      showPath: $("show-path").checked, showProfile: $("show-profile").checked,
      showFrame: $("show-frame").checked, showAxes: $("show-axes").checked,
      surfaceColor: $("surface-color").value === "custom" ? $("custom-color").value : $("surface-color").value,
      intersections: intersectionTriangles, showIntersections: $("show-intersections").checked
    });
    $("surface-swatch").style.background = $("surface-color").value === "custom" ? $("custom-color").value : $("surface-color").value;
    $("intersection-legend").hidden = !intersectionTriangles.length || !$("show-intersections").checked || !$("show-surface").checked;
    $("point-output").value = vectorText(probe);
    updatePreviewMarker($("path-preview"), projectPath(model.frame(u).point), "#ffdc66");
    updatePreviewMarker($("profile-preview"), model.profileAt(v), "#ff8cdc");
    lastProbe = { u, v };
    } catch (error) {
      pause();
      $("sweep-u").value = lastProbe.u; $("profile-v").value = lastProbe.v; labels();
      announce("Cannot evaluate this profile position: " + error.message + " Edit the curves to remove the singularity.", "error");
    }
  }
  function projectPath(p) { return [p[0] - 0.65 * p[1], 0.35 * p[0] + 0.35 * p[1] - 0.8 * p[2]]; }
  const svgNS = "http://www.w3.org/2000/svg";
  const previewTransforms = new WeakMap();
  function svgElement(name, attrs) {
    const element = document.createElementNS(svgNS, name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }
  function preview(svg, points, color, flipY) {
    const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    points.forEach(p => p.forEach((x, i) => { min[i] = Math.min(min[i], x); max[i] = Math.max(max[i], x); }));
    const factor = Math.min(94 / Math.max(0.0001, max[0] - min[0]), 65 / Math.max(0.0001, max[1] - min[1]));
    const center = min.map((x, i) => (x + max[i]) / 2);
    const transform = p => [60 + factor * (p[0] - center[0]), 45 + (flipY ? -1 : 1) * factor * (p[1] - center[1])];
    previewTransforms.set(svg, transform);
    svg.replaceChildren();
    const origin = transform([0, 0]);
    if (origin[0] >= 0 && origin[0] <= 120) svg.append(svgElement("path", { d: `M${origin[0]},5V85`, stroke: "#4c5e7a", "stroke-width": 0.8 }));
    if (origin[1] >= 0 && origin[1] <= 90) svg.append(svgElement("path", { d: `M5,${origin[1]}H115`, stroke: "#4c5e7a", "stroke-width": 0.8 }));
    svg.append(svgElement("path", { d: points.map((p, i) => (i ? "L" : "M") + transform(p).map(x => x.toFixed(2)).join(",")).join(" "), stroke: color, "stroke-width": 2, fill: "none" }));
  }
  function updatePreviewMarker(svg, p, color) {
    const transform = previewTransforms.get(svg);
    if (!transform) return;
    let marker = svg.querySelector("circle");
    if (!marker) { marker = svgElement("circle", { r: 3.8, fill: "#10182d", stroke: color, "stroke-width": 2 }); svg.append(marker); }
    const [x, y] = transform(p); marker.setAttribute("cx", x); marker.setAttribute("cy", y);
  }
  function pause() {
    playing = false; cancelAnimationFrame(animation);
    $("animate").textContent = "Animate sweep";
    $("animate").setAttribute("aria-pressed", "false");
  }
  function checkStatus(message, state) {
    $("intersection-status").textContent = message;
    $("intersection-status").dataset.state = state;
  }
  function cancelCheck(message = "Check cancelled. Run it again to inspect the entire surface.") {
    checkVersion++; checking = false;
    $("check-intersections").disabled = !window.SweepIntersections;
    $("cancel-intersections").hidden = true;
    if (message) checkStatus(message, "unchecked");
  }
  function invalidateCheck() {
    cancelCheck("This surface has not been checked.");
    intersectionTriangles = [];
    $("intersection-legend").hidden = true;
  }
  function buildCurves(useDraft = true) {
    pause();
    const fields = [...pathFields, ...profileFields];
    fields.forEach(field => field.removeAttribute("aria-invalid"));
    const next = useDraft ? {
      path: pathFields.map(field => field.value.trim()), profile: profileFields.map(field => field.value.trim()),
      pathName: $("path-preset").selectedOptions[0].textContent.replace(" equations", " path"),
      profileName: $("profile-preset").selectedOptions[0].textContent.replace(" equations", " profile")
    } : applied;
    if (!next) return;
    try {
      if (useDraft) fields.forEach((field, i) => {
        try { M.compile(field.value.trim(), i < 3 ? "u" : "v"); }
        catch (error) { field.setAttribute("aria-invalid", "true"); throw new Error(field.labels[0].textContent.trim() + ": " + error.message); }
      });
      const nextShape = shape();
      const built = M.build({ ...next, ...nextShape, pathSegments: 192, profileSegments: 80 });
      built.point(Number($("sweep-u").value), Number($("profile-v").value));
      model = built;
      invalidateCheck();
      applied = { ...next, shape: nextShape };
      if (useDraft) dirty = false;
      $("scene-title").textContent = next.pathName + " × " + next.profileName;
      $("geometry-status").textContent = (model.closedPath ? "Closed path" : "Open path") + " · " + (model.closedProfile ? "Closed profile" : "Open profile") + ". " + model.warnings.join(" ");
      $("frame-description").textContent = nextShape.mode === "transport"
        ? "T follows the path tangent. Nθ and Bθ span the moving profile plane, including twist."
        : "Nθ and Bθ are the global X and Y directions rotated by the current twist. T shows the path tangent.";
      preview($("path-preview"), model.path.map(projectPath), "#ffdc66", false);
      preview($("profile-preview"), model.profile, "#ff8cdc", true);
      announce(dirty ? "Equations edited. Apply curves to update the surface." : "Curves applied. Change u and v to explore the surface.", dirty ? "dirty" : "ok");
      render();
    } catch (error) {
      announce(error.message + (model ? " The last valid surface is still displayed." : " Check the curves and apply again."), "error");
      if (!useDraft && applied) {
        $("frame-mode").value = applied.shape.mode;
        $("profile-scale").value = applied.shape.scale;
        $("twist").value = applied.shape.twist;
        $("taper").value = applied.shape.taper;
      }
      labels();
    }
  }
  $("curve-form").addEventListener("submit", event => { event.preventDefault(); buildCurves(); });
  [["path", pathFields, pathPresets], ["profile", profileFields, profilePresets]].forEach(([name, fields, presets]) => {
    $(name + "-preset").addEventListener("change", () => {
      const preset = presets[$(name + "-preset").value];
      if (preset) { fields.forEach((field, i) => { field.value = preset[i]; }); buildCurves(); }
      else { fields[0].focus(); }
    });
    fields.forEach(field => field.addEventListener("input", () => {
      pause(); dirty = true; $(name + "-preset").value = "custom"; field.removeAttribute("aria-invalid");
      announce("Equations edited. Apply curves to update the surface.", "dirty");
    }));
  });
  ["profile-scale", "twist", "taper", "frame-mode"].forEach(id => $(id).addEventListener(id === "frame-mode" ? "change" : "input", () => {
    pause(); labels();
    if (buildPending) return;
    buildPending = true;
    requestAnimationFrame(() => { buildPending = false; buildCurves(false); });
  }));
  ["sweep-u", "profile-v"].forEach(id => $(id).addEventListener("input", () => { pause(); render(); }));
  ["reveal", "show-surface", "show-wireframe", "show-path", "show-profile", "show-frame", "show-axes", "show-intersections"].forEach(id => $(id).addEventListener("change", render));
  $("surface-color").addEventListener("change", () => {
    const custom = $("surface-color").value === "custom";
    $("custom-color-label").hidden = !custom;
    if (!custom) $("custom-color").value = $("surface-color").value;
    render();
  });
  $("custom-color").addEventListener("input", render);
  ["png", "svg"].forEach(format => $("download-" + format).addEventListener("click", async () => {
    pause();
    $("download-png").disabled = true; $("download-svg").disabled = true;
    $("export-status").textContent = "Preparing " + format.toUpperCase() + "…";
    try {
      const blob = await (format === "png" ? viewer.exportPNG() : viewer.exportSVG());
      if (!(blob instanceof Blob) || !blob.size) throw new Error("The image could not be generated.");
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "sweep-surface." + format;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      $("export-status").textContent = format.toUpperCase() + " download ready. " + exportHelp;
    } catch (error) {
      $("export-status").textContent = "Download failed: " + error.message;
    } finally {
      $("download-png").disabled = !viewer.available; $("download-svg").disabled = !viewer.available;
    }
  }));
  $("cancel-intersections").addEventListener("click", () => cancelCheck());
  $("check-intersections").addEventListener("click", async () => {
    if (!model || checking || !window.SweepIntersections) return;
    pause();
    const version = ++checkVersion, checkedModel = model;
    checking = true; intersectionTriangles = []; render();
    $("check-intersections").disabled = true; $("cancel-intersections").hidden = false;
    checkStatus("Checking the entire sampled surface…", "checking");
    let lastProgress = 0;
    try {
      const result = await window.SweepIntersections.check(checkedModel, {
        isCancelled: () => version !== checkVersion,
        onProgress: progress => {
          if (version !== checkVersion || performance.now() - lastProgress < 400) return;
          lastProgress = performance.now();
          checkStatus("Checking sampled surface… " + Math.round(progress.progress * 100) + "% · " + progress.testedPairs.toLocaleString() + " triangle pairs tested.", "checking");
        }
      });
      if (version !== checkVersion || checkedModel !== model || result.cancelled) return;
      intersectionTriangles = result.triangleIds;
      const skipped = result.degenerateCount > 0 ? " " + result.degenerateCount.toLocaleString() + " degenerate triangles were skipped; those areas need separate inspection." : "";
      const limited = result.complete ? "" : " The check reached its work limit; it is incomplete.";
      if (result.pairCount > 0) {
        checkStatus((result.complete ? "Detected " : "Detected at least ") + result.pairCount.toLocaleString() + " intersecting triangle pairs in the sampled mesh (" + result.triangleIds.length.toLocaleString() + " highlighted triangles)." + limited + skipped, "found");
      } else if (result.complete && !result.degenerateCount) {
        checkStatus("No non-neighboring triangle intersections detected in the sampled mesh.", "clear");
      } else {
        checkStatus("No intersections found among the triangle pairs tested." + limited + skipped + " This is not a clear result for the entire surface.", "incomplete");
      }
      render();
    } catch (error) {
      if (version === checkVersion) checkStatus("The check could not finish: " + error.message, "error");
    } finally {
      if (version === checkVersion) {
        checking = false; $("check-intersections").disabled = false; $("cancel-intersections").hidden = true;
      }
    }
  });
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => viewer.setView(button.dataset.view)));
  document.querySelectorAll("[data-zoom]").forEach(button => button.addEventListener("click", () => viewer.zoom(Number(button.dataset.zoom))));
  $("animate").addEventListener("click", () => {
    if (playing) { pause(); return; }
    if (!model || !viewer.available) return;
    playing = true; $("reveal").checked = true;
    if (Number($("sweep-u").value) >= 0.999) $("sweep-u").value = 0;
    $("animate").textContent = "Pause sweep"; $("animate").setAttribute("aria-pressed", "true");
    previousTime = performance.now(); animationU = Number($("sweep-u").value);
    function tick(time) {
      if (!playing) return;
      const next = Math.min(1, animationU + Math.min(0.1, (time - previousTime) / 1000) / 10);
      animationU = next;
      previousTime = time;
      $("sweep-u").value = next.toFixed(3);
      render();
      if (next >= 1) pause();
      else if (playing) animation = requestAnimationFrame(tick);
    }
    animation = requestAnimationFrame(tick);
  });
  $("reset-all").addEventListener("click", () => {
    pause();
    $("path-preset").value = "helix"; $("profile-preset").value = "circle";
    pathFields.forEach((field, i) => { field.value = pathPresets.helix[i]; });
    profileFields.forEach((field, i) => { field.value = profilePresets.circle[i]; });
    $("frame-mode").value = "transport";
    $("profile-scale").value = 0.65; $("twist").value = 0; $("taper").value = 1;
    $("sweep-u").value = 0.65; $("profile-v").value = 0.2;
    $("reveal").checked = false;
    ["surface", "wireframe", "path", "profile", "axes"].forEach(name => { $("show-" + name).checked = true; });
    $("show-frame").checked = false;
    $("surface-color").value = "#36d2e4"; $("custom-color").value = "#36d2e4";
    $("custom-color-label").hidden = true; $("show-intersections").checked = true;
    $("export-status").textContent = viewer.available ? exportHelp : "Image downloads require a working 3D view.";
    buildCurves(); viewer.reset();
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("pagehide", event => { pause(); if (checking) cancelCheck(); if (!event.persisted) viewer.dispose(); });
  buildCurves();
  if (!window.SweepIntersections) {
    $("check-intersections").disabled = true;
    checkStatus("The intersection checker could not load. Reload with all module files present.", "error");
  }
})();
