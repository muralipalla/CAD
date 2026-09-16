(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CADWorkflowLab = api;
  if (root && root.document) {
    const start = function () { api.mountAll(root.document); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";

  const STAGES = Object.freeze([
    Object.freeze({ label: "Nominal model", description: "Begin with the theoretically exact plate and hole." }),
    Object.freeze({ label: "Datum features", description: "Identify the physical faces used to establish A, B, and C." }),
    Object.freeze({ label: "Datum reference frame", description: "Derive the ideal reference planes and coordinate frame in datum order." }),
    Object.freeze({ label: "PMI association", description: "Associate the position requirement with the hole and its datum references." }),
    Object.freeze({ label: "Tolerance zone", description: "Locate the cylindrical position-tolerance zone from basic dimensions." }),
    Object.freeze({ label: "Inspection result", description: "Compare the measured hole axis with the permitted cylindrical zone." })
  ]);

  function finite(value, name) {
    if (!Number.isFinite(value)) throw new RangeError(name + " must be finite.");
    return value;
  }

  function positionResult(offsetX, offsetY, diameterTolerance) {
    finite(offsetX, "offsetX");
    finite(offsetY, "offsetY");
    finite(diameterTolerance, "diameterTolerance");
    if (diameterTolerance <= 0) throw new RangeError("diameterTolerance must be positive.");
    const radialOffset = Math.hypot(offsetX, offsetY);
    const diametricalDeviation = 2 * radialOffset;
    const margin = diameterTolerance - diametricalDeviation;
    return {
      radialOffset,
      diametricalDeviation,
      diameterTolerance,
      margin,
      pass: diametricalDeviation <= diameterTolerance + 1e-12
    };
  }

  function stageState(index) {
    if (!Number.isInteger(index) || index < 0 || index >= STAGES.length) throw new RangeError("Unknown workflow stage.");
    return {
      index,
      label: STAGES[index].label,
      description: STAGES[index].description,
      showDatumFeatures: index >= 1,
      showDatumFrame: index >= 2,
      showPmi: index >= 3,
      showToleranceZone: index >= 4,
      showInspection: index >= 5
    };
  }

  function makePlateShape(T, centerX, centerY) {
    const shape = new T.Shape();
    shape.moveTo(-3, -1.8);
    shape.lineTo(3, -1.8);
    shape.lineTo(3, 1.8);
    shape.lineTo(-3, 1.8);
    shape.closePath();
    const controlledHole = new T.Path();
    controlledHole.absarc(centerX, centerY, 0.52, 0, Math.PI * 2, true);
    shape.holes.push(controlledHole);
    [[-1.7, -0.8], [-1.7, 0.8]].forEach(function (center) {
      const hole = new T.Path();
      hole.absarc(center[0], center[1], 0.3, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    });
    return shape;
  }

  function makePlateGeometry(T, offsetX, offsetY, showInspection) {
    const visualScale = 0.8;
    const centerX = 0.8 + (showInspection ? offsetX * visualScale : 0);
    const centerY = 0.25 + (showInspection ? offsetY * visualScale : 0);
    const shape = makePlateShape(T, centerX, centerY);
    const geometry = new T.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: false, curveSegments: 48, steps: 1 });
    geometry.translate(0, 0, -0.36);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createViewer(canvas, fallback) {
    const T = root && root.THREE;
    const unavailable = { available: false, update: function () {}, dispose: function () {} };
    function fail(message) {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = message || "The Three.js MBD viewer could not be loaded. The GD&T and workflow explanation remains available.";
      }
      canvas.tabIndex = -1;
      return unavailable;
    }
    if (!T) return fail();

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (_) {
      return fail();
    }
    if (fallback) fallback.hidden = true;

    const scene = new T.Scene();
    scene.background = new T.Color(0x10182d);
    const camera = new T.PerspectiveCamera(36, 1, 0.05, 100);
    const target = new T.Vector3(0, 0, 0);
    const modelGroup = new T.Group();
    const grid = new T.GridHelper(10, 20, 0x63728e, 0x283650);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.62;
    scene.add(grid, modelGroup);
    scene.add(new T.HemisphereLight(0xcfe9ff, 0x24304b, 1.4));
    const key = new T.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, -4, 7);
    scene.add(key);
    const fill = new T.DirectionalLight(0x8da9ff, 0.65);
    fill.position.set(-5, 3, 2);
    scene.add(fill);

    const listeners = [];
    const pointers = new Map();
    let radius = 8.8;
    let azimuth = -0.78;
    let elevation = 0.5;
    let lastPairDistance = 0;
    let pending = 0;
    let observer = null;
    let disposed = false;

    function on(targetNode, name, listener, options) {
      targetNode.addEventListener(name, listener, options);
      listeners.push([targetNode, name, listener, options]);
    }

    function clearGroup(group) {
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      group.traverse(function (object) {
        if (object.geometry) geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.filter(Boolean).forEach(function (material) {
          materials.add(material);
          if (material.map) textures.add(material.map);
        });
      });
      while (group.children.length) group.remove(group.children[0]);
      geometries.forEach(function (geometry) { geometry.dispose(); });
      textures.forEach(function (texture) { texture.dispose(); });
      materials.forEach(function (material) { material.dispose(); });
    }

    function updateCamera() {
      const horizontal = radius * Math.cos(elevation);
      camera.position.set(
        target.x + horizontal * Math.cos(azimuth),
        target.y + horizontal * Math.sin(azimuth),
        target.z + radius * Math.sin(elevation)
      );
      camera.up.set(0, 0, 1);
      camera.lookAt(target);
    }

    function render() {
      pending = 0;
      if (!disposed) renderer.render(scene, camera);
    }

    function schedule() {
      if (!pending && !disposed) pending = root.requestAnimationFrame(render);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      schedule();
    }

    function labelSprite(text, color) {
      const labelCanvas = root.document.createElement("canvas");
      labelCanvas.width = 128;
      labelCanvas.height = 64;
      const context = labelCanvas.getContext("2d");
      context.fillStyle = "rgba(16,24,45,.92)";
      context.fillRect(4, 4, 120, 56);
      context.strokeStyle = color;
      context.lineWidth = 5;
      context.strokeRect(4, 4, 120, 56);
      context.fillStyle = "#ffffff";
      context.font = "bold 34px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 64, 32);
      const texture = new T.CanvasTexture(labelCanvas);
      texture.colorSpace = T.SRGBColorSpace;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
      sprite.scale.set(0.8, 0.4, 1);
      return sprite;
    }

    function addDatumFeatures(state, offsetX, offsetY) {
      if (!state.showDatumFeatures) return;
      const visualScale = 0.8;
      const centerX = 0.8 + (state.showInspection ? offsetX * visualScale : 0);
      const centerY = 0.25 + (state.showInspection ? offsetY * visualScale : 0);
      const materialA = new T.MeshBasicMaterial({ color: 0x64d7ff, transparent: true, opacity: 0.42, side: T.DoubleSide, depthWrite: false });
      const materialB = new T.MeshBasicMaterial({ color: 0x7ce8b2, transparent: true, opacity: 0.4, side: T.DoubleSide, depthWrite: false });
      const materialC = new T.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.38, side: T.DoubleSide, depthWrite: false });

      const featureA = new T.Mesh(new T.ShapeGeometry(makePlateShape(T, centerX, centerY), 48), materialA);
      featureA.position.z = -0.371;
      const featureB = new T.Mesh(new T.PlaneGeometry(0.72, 3.6), materialB);
      featureB.rotation.y = Math.PI / 2;
      featureB.position.set(-3.011, 0, 0);
      const featureC = new T.Mesh(new T.PlaneGeometry(6, 0.72), materialC);
      featureC.rotation.x = Math.PI / 2;
      featureC.position.set(0, -1.811, 0);
      modelGroup.add(featureA, featureB, featureC);

      const labelA = labelSprite("A", "#64d7ff");
      labelA.position.set(2.7, 1.65, -0.62);
      const labelB = labelSprite("B", "#7ce8b2");
      labelB.position.set(-3.4, 1.5, 0.7);
      const labelC = labelSprite("C", "#ffd76a");
      labelC.position.set(2.6, -2.08, 0.7);
      modelGroup.add(labelA, labelB, labelC);
    }

    function addDatumFrame(state) {
      if (!state.showDatumFrame) return;
      const planeOptions = { transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false };
      const datumA = new T.Mesh(new T.PlaneGeometry(7.1, 4.5), new T.MeshBasicMaterial({ ...planeOptions, color: 0x64d7ff }));
      datumA.position.z = -0.405;
      const datumB = new T.Mesh(new T.PlaneGeometry(1.55, 4.4), new T.MeshBasicMaterial({ ...planeOptions, color: 0x7ce8b2 }));
      datumB.rotation.y = Math.PI / 2;
      datumB.position.set(-3.075, 0, 0.16);
      const datumC = new T.Mesh(new T.PlaneGeometry(6.5, 1.55), new T.MeshBasicMaterial({ ...planeOptions, color: 0xffd76a }));
      datumC.rotation.x = Math.PI / 2;
      datumC.position.set(0, -1.875, 0.16);
      const origin = new T.Vector3(-2.78, -1.58, -0.37);
      modelGroup.add(
        datumA,
        datumB,
        datumC,
        new T.ArrowHelper(new T.Vector3(1, 0, 0), origin, 1.25, 0xff7868, 0.18, 0.1),
        new T.ArrowHelper(new T.Vector3(0, 1, 0), origin, 1.25, 0x7ce8b2, 0.18, 0.1),
        new T.ArrowHelper(new T.Vector3(0, 0, 1), origin, 1.25, 0x64d7ff, 0.18, 0.1)
      );
    }

    function addPmiLink(state) {
      if (!state.showPmi) return;
      const points = [new T.Vector3(0.8, 0.25, 0.44), new T.Vector3(1.65, 1.35, 1.1), new T.Vector3(2.55, 1.35, 1.1)];
      modelGroup.add(new T.Line(new T.BufferGeometry().setFromPoints(points), new T.LineBasicMaterial({ color: 0xbba5ff })));
      const marker = new T.Mesh(new T.SphereGeometry(0.1, 18, 12), new T.MeshBasicMaterial({ color: 0xbba5ff }));
      marker.position.copy(points[0]);
      modelGroup.add(marker);
    }

    function addToleranceAndInspection(state, result, offsetX, offsetY) {
      if (!state.showToleranceZone) return;
      const visualScale = 0.8;
      const nominalX = 0.8;
      const nominalY = 0.25;
      const zoneRadius = result.diameterTolerance * visualScale / 2;
      const zoneColor = state.showInspection && !result.pass ? 0xff7868 : 0x7ce8b2;
      const zone = new T.Mesh(
        new T.CylinderGeometry(zoneRadius, zoneRadius, 1.7, 40, 1, true),
        new T.MeshBasicMaterial({ color: zoneColor, transparent: true, opacity: 0.26, side: T.DoubleSide, depthWrite: false })
      );
      zone.rotation.x = Math.PI / 2;
      zone.position.set(nominalX, nominalY, 0);
      modelGroup.add(zone);

      const nominalAxis = new T.Line(
        new T.BufferGeometry().setFromPoints([new T.Vector3(nominalX, nominalY, -1), new T.Vector3(nominalX, nominalY, 1)]),
        new T.LineDashedMaterial({ color: 0x7ce8b2, dashSize: 0.14, gapSize: 0.09 })
      );
      nominalAxis.computeLineDistances();
      modelGroup.add(nominalAxis);

      if (!state.showInspection) return;
      const actualX = nominalX + offsetX * visualScale;
      const actualY = nominalY + offsetY * visualScale;
      const actualAxis = new T.Line(
        new T.BufferGeometry().setFromPoints([new T.Vector3(actualX, actualY, -1), new T.Vector3(actualX, actualY, 1)]),
        new T.LineBasicMaterial({ color: 0xff7868 })
      );
      modelGroup.add(actualAxis);
      [-0.72, -0.36, 0, 0.36, 0.72].forEach(function (z) {
        const point = new T.Mesh(new T.SphereGeometry(0.065, 14, 10), new T.MeshBasicMaterial({ color: 0xffd76a }));
        point.position.set(actualX, actualY, z);
        modelGroup.add(point);
      });
    }

    function update(stageIndex, offsetX, offsetY, diameterTolerance) {
      const state = stageState(stageIndex);
      const result = positionResult(offsetX, offsetY, diameterTolerance);
      clearGroup(modelGroup);
      const geometry = makePlateGeometry(T, offsetX, offsetY, state.showInspection);
      const part = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: 0x72d3ef, roughness: 0.42, metalness: 0.08 }));
      modelGroup.add(part);
      modelGroup.add(new T.LineSegments(new T.EdgesGeometry(geometry, 20), new T.LineBasicMaterial({ color: 0xd9efff, transparent: true, opacity: 0.85 })));
      addDatumFeatures(state, offsetX, offsetY);
      addDatumFrame(state);
      addPmiLink(state);
      addToleranceAndInspection(state, result, offsetX, offsetY);
      schedule();
    }

    function pairDistance() {
      const points = [...pointers.values()];
      return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
    on(canvas, "pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      lastPairDistance = pairDistance();
    });
    on(canvas, "pointermove", function (event) {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        azimuth -= (event.clientX - previous.x) * 0.008;
        elevation = Math.max(-1.25, Math.min(1.35, elevation + (event.clientY - previous.y) * 0.007));
      } else if (pointers.size === 2) {
        const distance = pairDistance();
        if (lastPairDistance > 0 && distance > 0) radius = Math.max(5, Math.min(15, radius * lastPairDistance / distance));
        lastPairDistance = distance;
      }
      updateCamera();
      schedule();
    });
    function release(event) {
      pointers.delete(event.pointerId);
      lastPairDistance = pairDistance();
    }
    on(canvas, "pointerup", release);
    on(canvas, "pointercancel", release);
    on(canvas, "lostpointercapture", release);
    on(canvas, "wheel", function (event) {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      const delta = Math.max(-1000, Math.min(1000, event.deltaY * unit));
      radius = Math.max(5, Math.min(15, radius * Math.exp(delta * 0.001)));
      updateCamera();
      schedule();
    }, { passive: false });
    on(canvas, "keydown", function (event) {
      const key = event.key;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_", "Home"].includes(key)) return;
      event.preventDefault();
      if (key === "ArrowLeft") azimuth += 0.12;
      if (key === "ArrowRight") azimuth -= 0.12;
      if (key === "ArrowUp") elevation = Math.min(1.35, elevation + 0.1);
      if (key === "ArrowDown") elevation = Math.max(-1.25, elevation - 0.1);
      if (key === "+" || key === "=") radius = Math.max(5, radius * 0.9);
      if (key === "-" || key === "_") radius = Math.min(15, radius * 1.1);
      if (key === "Home") { radius = 8.8; azimuth = -0.78; elevation = 0.5; }
      updateCamera();
      schedule();
    });
    on(canvas, "webglcontextlost", function (event) {
      event.preventDefault();
      if (fallback) { fallback.hidden = false; fallback.textContent = "The 3D context was lost. Reload the page to restore the MBD view."; }
    });
    on(canvas, "webglcontextrestored", function () {
      if (fallback) fallback.hidden = true;
      schedule();
    });

    updateCamera();
    if (root.ResizeObserver) {
      observer = new root.ResizeObserver(resize);
      observer.observe(canvas);
    } else on(root, "resize", resize);
    resize();

    return {
      available: true,
      update,
      dispose: function () {
        disposed = true;
        if (pending) root.cancelAnimationFrame(pending);
        if (observer) observer.disconnect();
        listeners.forEach(function (entry) { entry[0].removeEventListener(entry[1], entry[2], entry[3]); });
        clearGroup(modelGroup);
        if (grid.geometry) grid.geometry.dispose();
        (Array.isArray(grid.material) ? grid.material : [grid.material]).filter(Boolean).forEach(function (material) { material.dispose(); });
        renderer.dispose();
      }
    };
  }

  function numberText(value) {
    return Math.abs(value) < 0.0005 ? "0.000" : value.toFixed(3);
  }

  function mountLab(lab) {
    if (lab.dataset.workflowMounted === "true") return;
    lab.dataset.workflowMounted = "true";
    const find = function (name) { return lab.querySelector(`[data-${name}]`); };
    const canvas = find("mbd-canvas");
    const fallback = find("mbd-fallback");
    const offsetX = find("offset-x");
    const offsetY = find("offset-y");
    const tolerance = find("position-tolerance");
    if (!canvas || !offsetX || !offsetY || !tolerance) return;
    const viewer = createViewer(canvas, fallback);
    let activeStage = 0;

    function update(announce) {
      const state = stageState(activeStage);
      const x = offsetX.valueAsNumber;
      const y = offsetY.valueAsNumber;
      const diameter = tolerance.valueAsNumber;
      const result = positionResult(x, y, diameter);
      find("workflow-step-count").value = `Step ${activeStage + 1} of ${STAGES.length}`;
      find("workflow-step-count").textContent = `Step ${activeStage + 1} of ${STAGES.length}`;
      find("workflow-step-title").textContent = state.label;
      find("workflow-step-description").textContent = state.description;
      find("workflow-prev").disabled = activeStage === 0;
      find("workflow-next").disabled = activeStage === STAGES.length - 1;
      find("offset-x-output").value = `${numberText(x)} mm`;
      find("offset-x-output").textContent = `${numberText(x)} mm`;
      find("offset-y-output").value = `${numberText(y)} mm`;
      find("offset-y-output").textContent = `${numberText(y)} mm`;
      find("position-tolerance-output").value = `⌀${diameter.toFixed(2)} mm`;
      find("position-tolerance-output").textContent = `⌀${diameter.toFixed(2)} mm`;
      find("radial-offset").textContent = `${numberText(result.radialOffset)} mm`;
      find("diametrical-deviation").textContent = `${numberText(result.diametricalDeviation)} mm`;
      find("inspection-result").textContent = result.pass ? "Pass" : "Fail";
      find("mbd-overlay-title").textContent = state.label;
      find("mbd-overlay-text").textContent = state.description;
      find("feature-control-frame").textContent = `⌖ | ⌀${diameter.toFixed(2)} | A | B | C`;
      find("feature-control-frame").hidden = !state.showPmi;

      const status = find("mbd-status");
      if (state.showInspection) {
        status.dataset.result = result.pass ? "pass" : "fail";
        status.textContent = `${result.pass ? "Pass" : "Fail"}: diametrical axis deviation ${numberText(result.diametricalDeviation)} mm ${result.pass ? "does not exceed" : "exceeds"} the ⌀${diameter.toFixed(2)} mm position tolerance. The visual deviation is enlarged for teaching.`;
      } else {
        delete status.dataset.result;
        status.textContent = state.description;
      }
      const resultLabel = state.showInspection ? ` Simplified inspection result ${result.pass ? "pass" : "fail"}.` : "";
      canvas.setAttribute("aria-label", `${state.label} for a plate with a position-controlled hole.${resultLabel}`);
      viewer.update(activeStage, x, y, diameter);
      if (announce) {
        const live = find("mbd-live");
        if (live) live.textContent = state.showInspection ? `${state.label}. ${status.textContent}` : `${state.label}. ${state.description}`;
      }
    }

    find("workflow-prev").addEventListener("click", function () { activeStage = Math.max(0, activeStage - 1); update(true); });
    find("workflow-next").addEventListener("click", function () { activeStage = Math.min(STAGES.length - 1, activeStage + 1); update(true); });
    [offsetX, offsetY, tolerance].forEach(function (input) {
      input.addEventListener("input", function () { update(false); });
      input.addEventListener("change", function () { update(true); });
    });
    update(false);
    if (root) root.addEventListener("pagehide", function (event) { if (!event.persisted) viewer.dispose(); }, { once: true });
  }

  function mountAll(documentObject) {
    [...documentObject.querySelectorAll("[data-mbd-lab]")].forEach(mountLab);
  }

  return { STAGES, positionResult, stageState, mountAll };
});
