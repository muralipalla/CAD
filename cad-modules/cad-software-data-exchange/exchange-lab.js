(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CADExchangeLab = api;
  if (root && root.document) {
    const start = function () { api.mountAll(root.document); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : null, function (root) {
  "use strict";

  const FORMAT_PROFILES = Object.freeze({
    native: Object.freeze({
      label: "Native CAD model",
      view: "native",
      geometry: "Exact, application-native",
      topology: "Preserved",
      history: "Preserved",
      assemblies: "Preserved",
      pmi: "System-specific",
      units: "Preserved",
      purpose: "Continue editing in the authoring system",
      summary: "The native model normally retains the richest design intent, but depends on application and release compatibility."
    }),
    step: Object.freeze({
      label: "STEP AP242",
      view: "exact",
      geometry: "Exact B-Rep/NURBS",
      topology: "Preserved",
      history: "Usually lost",
      assemblies: "Supported",
      pmi: "Supported when configured",
      units: "Explicit",
      purpose: "Mechanical solids, assemblies, and managed product data",
      summary: "STEP AP242 is a strong neutral choice for exact mechanical geometry; receiving translators still determine which assembly and PMI semantics survive."
    }),
    parasolid: Object.freeze({
      label: "Parasolid XT",
      view: "exact",
      geometry: "Exact kernel geometry",
      topology: "Preserved",
      history: "Lost",
      assemblies: "Limited",
      pmi: "Not the main purpose",
      units: "Explicit",
      purpose: "High-fidelity geometry between compatible kernels",
      summary: "Parasolid exchange can reduce geometric translation between same-kernel systems, but it is not a complete application feature model."
    }),
    iges: Object.freeze({
      label: "IGES",
      view: "surface",
      geometry: "Exact curves and surfaces",
      topology: "Often weak",
      history: "Lost",
      assemblies: "Weak or absent",
      pmi: "Not reliable",
      units: "Defined, but verify",
      purpose: "Legacy curve and surface exchange",
      summary: "IGES remains useful for legacy surface workflows, but transferred faces may arrive as a quilt that needs sewing or healing."
    }),
    jt: Object.freeze({
      label: "JT",
      view: "lightweight",
      geometry: "Tessellation; precise B-Rep optional",
      topology: "Depends on content",
      history: "Lost",
      assemblies: "Supported",
      pmi: "Can be included",
      units: "Supported",
      purpose: "Digital mock-up, PLM visualization, and review",
      summary: "A JT file may contain lightweight triangles, precise geometry, PMI, or a combination. The delivery profile must be agreed explicitly."
    }),
    stl: Object.freeze({
      label: "STL",
      view: "mesh",
      geometry: "Triangle surface",
      topology: "No explicit topology; adjacency may be inferred",
      history: "Lost",
      assemblies: "Flattened or separated",
      pmi: "Absent",
      units: "Not defined by the format",
      purpose: "Simple additive or mesh handoff",
      summary: "STL communicates only a tessellated surface. Record units and mesh tolerance, then check watertightness, normals, and thin features."
    }),
    threeMf: Object.freeze({
      label: "3MF",
      view: "mesh",
      geometry: "Triangle mesh",
      topology: "Watertight mesh model",
      history: "Lost",
      assemblies: "Components supported",
      pmi: "Not design PMI",
      units: "Defined; materials optional",
      purpose: "Additive manufacturing package",
      summary: "3MF adds defined units, packaging, and extensible manufacturing metadata to a mesh workflow, provided the complete toolchain supports those features."
    }),
    dxf: Object.freeze({
      label: "DXF",
      view: "drawing",
      geometry: "2D/3D drawing entities",
      topology: "Entity-based",
      history: "Lost",
      assemblies: "Not a mechanical assembly model",
      pmi: "Drawing annotations only",
      units: "Agree before exchange",
      purpose: "2D profiles, drawings, and cutting paths",
      summary: "DXF is effective for drawings and planar manufacturing profiles. Agree on units, layers, spline conversion, and model-space expectations."
    }),
    gltf: Object.freeze({
      label: "glTF / GLB",
      view: "lightweight",
      geometry: "Runtime triangle meshes",
      topology: "Rendering topology",
      history: "Lost",
      assemblies: "Scene graph supported",
      pmi: "Not manufacturing PMI",
      units: "Metres by specification; verify application scale",
      purpose: "Web, real-time, and presentation delivery",
      summary: "glTF is an efficient publishing format for rendered 3D assets, not a replacement for an editable manufacturing CAD model."
    })
  });

  const DETAIL_LEVELS = Object.freeze([
    Object.freeze({ label: "Coarse", segments: 6 }),
    Object.freeze({ label: "Medium", segments: 12 }),
    Object.freeze({ label: "Fine", segments: 24 }),
    Object.freeze({ label: "Very fine", segments: 48 })
  ]);

  function formatProfile(name) {
    if (!Object.prototype.hasOwnProperty.call(FORMAT_PROFILES, name)) throw new RangeError("Unknown exchange format.");
    return { ...FORMAT_PROFILES[name] };
  }

  function detailLevel(index) {
    if (!Number.isInteger(index) || index < 0 || index >= DETAIL_LEVELS.length) throw new RangeError("Unknown tessellation detail level.");
    return { ...DETAIL_LEVELS[index] };
  }

  function meshDependent(name) {
    const view = formatProfile(name).view;
    return view === "mesh" || view === "lightweight";
  }

  function makePlateShape(T, segments) {
    const shape = new T.Shape();
    shape.moveTo(-2.7, -1.35);
    shape.lineTo(2.35, -1.35);
    shape.lineTo(2.7, -1);
    shape.lineTo(2.7, 1.35);
    shape.lineTo(-2.35, 1.35);
    shape.lineTo(-2.7, 1);
    shape.closePath();
    [[-1.25, 0, 0.38], [0.25, 0, 0.62], [1.75, 0, 0.38]].forEach(function (holeData) {
      const hole = new T.Path();
      hole.absarc(holeData[0], holeData[1], holeData[2], 0, Math.PI * 2, true);
      shape.holes.push(hole);
    });
    return new T.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: false, curveSegments: segments, steps: 1 });
  }

  function createViewer(canvas, fallback) {
    const T = root && root.THREE;
    const unavailable = { available: false, update: function () {}, dispose: function () {} };
    function fail(message) {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = message || "The Three.js exchange viewer could not be loaded. The format comparison remains available.";
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
    const grid = new T.GridHelper(9, 18, 0x63728e, 0x283650);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.5;
    scene.add(grid, modelGroup);
    scene.add(new T.HemisphereLight(0xcfe9ff, 0x24304b, 1.35));
    const key = new T.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, -4, 7);
    scene.add(key);
    const fill = new T.DirectionalLight(0x8da9ff, 0.7);
    fill.position.set(-5, 2, 3);
    scene.add(fill);

    const listeners = [];
    const pointers = new Map();
    let radius = 8.1;
    let azimuth = -0.82;
    let elevation = 0.48;
    let lastPairDistance = 0;
    let pending = 0;
    let observer = null;
    let disposed = false;
    let activeView = "exact";

    function on(targetNode, name, listener, options) {
      targetNode.addEventListener(name, listener, options);
      listeners.push([targetNode, name, listener, options]);
    }

    function clearGroup(group) {
      const geometries = new Set();
      const materials = new Set();
      group.traverse(function (object) {
        if (object.geometry) geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.filter(Boolean).forEach(function (material) { materials.add(material); });
      });
      while (group.children.length) group.remove(group.children[0]);
      geometries.forEach(function (geometry) { geometry.dispose(); });
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
      const ratio = Math.min(root.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(ratio);
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      schedule();
    }

    function makeDrawing() {
      const material = new T.LineBasicMaterial({ color: 0x64d7ff });
      const loops = [
        [[-2.7,-1.35,0], [2.35,-1.35,0], [2.7,-1,0], [2.7,1.35,0], [-2.35,1.35,0], [-2.7,1,0]],
      ];
      [[-1.25, 0, 0.38], [0.25, 0, 0.62], [1.75, 0, 0.38]].forEach(function (item) {
        loops.push(Array.from({ length: 65 }, function (_, index) {
          const angle = Math.PI * 2 * index / 64;
          return [item[0] + item[2] * Math.cos(angle), item[1] + item[2] * Math.sin(angle), 0];
        }));
      });
      loops.forEach(function (points, index) {
        const vectors = points.map(function (point) { return new T.Vector3(point[0], point[1], point[2]); });
        const geometry = new T.BufferGeometry().setFromPoints(vectors);
        modelGroup.add(index === 0 ? new T.LineLoop(geometry, material) : new T.Line(geometry, material));
      });
      const centerLines = new T.LineSegments(
        new T.BufferGeometry().setFromPoints([
          new T.Vector3(-3.2, 0, -0.01), new T.Vector3(3.2, 0, -0.01),
          new T.Vector3(0.25, -1.85, -0.01), new T.Vector3(0.25, 1.85, -0.01)
        ]),
        new T.LineDashedMaterial({ color: 0xffd76a, dashSize: 0.16, gapSize: 0.1 })
      );
      centerLines.computeLineDistances();
      modelGroup.add(centerLines);
    }

    function resetCamera() {
      if (activeView === "drawing") {
        azimuth = -Math.PI / 2;
        elevation = 1.35;
        radius = 7.7;
      } else {
        azimuth = -0.82;
        elevation = 0.48;
        radius = 8.1;
      }
      updateCamera();
      schedule();
    }

    function update(name, detailIndex) {
      const profile = formatProfile(name);
      const detail = detailLevel(detailIndex);
      activeView = profile.view;
      clearGroup(modelGroup);

      if (profile.view === "drawing") {
        makeDrawing();
        resetCamera();
        return;
      }

      const segments = meshDependent(name) ? detail.segments : 48;
      const geometry = makePlateShape(T, segments);
      geometry.translate(0, 0, -0.36);
      geometry.computeVertexNormals();
      const isMesh = profile.view === "mesh";
      const isSurface = profile.view === "surface";
      const isLightweight = profile.view === "lightweight";
      const material = new T.MeshStandardMaterial({
        color: isSurface ? 0x7f8cff : isMesh ? 0x57b9d8 : isLightweight ? 0x8ea8c9 : 0x72d3ef,
        roughness: 0.42,
        metalness: 0.08,
        transparent: isSurface,
        opacity: isSurface ? 0.78 : 1,
        side: isSurface ? T.DoubleSide : T.FrontSide,
        flatShading: isMesh || isLightweight
      });
      const solid = new T.Mesh(geometry, material);
      modelGroup.add(solid);

      if (profile.view !== "lightweight" || detailIndex < 2) {
        const edgeGeometry = isMesh || isLightweight ? new T.WireframeGeometry(geometry) : new T.EdgesGeometry(geometry, 20);
        const edges = new T.LineSegments(edgeGeometry, new T.LineBasicMaterial({
          color: isSurface ? 0xff8d78 : isMesh ? 0xf6c85f : 0xd9efff,
          transparent: true,
          opacity: isMesh ? 0.62 : 0.82
        }));
        modelGroup.add(edges);
      }

      if (profile.view === "native") {
        const featureAxis = new T.LineSegments(
          new T.BufferGeometry().setFromPoints([
            new T.Vector3(0.25, 0, -1), new T.Vector3(0.25, 0, 1),
            new T.Vector3(-1.25, 0, -0.8), new T.Vector3(-1.25, 0, 0.8),
            new T.Vector3(1.75, 0, -0.8), new T.Vector3(1.75, 0, 0.8)
          ]),
          new T.LineDashedMaterial({ color: 0xffd76a, dashSize: 0.14, gapSize: 0.09 })
        );
        featureAxis.computeLineDistances();
        modelGroup.add(featureAxis);
      }

      resetCamera();
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
        if (lastPairDistance > 0 && distance > 0) radius = Math.max(4.5, Math.min(14, radius * lastPairDistance / distance));
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
      radius = Math.max(4.5, Math.min(14, radius * Math.exp(delta * 0.001)));
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
      if (key === "+" || key === "=") radius = Math.max(4.5, radius * 0.9);
      if (key === "-" || key === "_") radius = Math.min(14, radius * 1.1);
      if (key === "Home") { resetCamera(); return; }
      updateCamera();
      schedule();
    });
    on(canvas, "webglcontextlost", function (event) {
      event.preventDefault();
      if (fallback) { fallback.hidden = false; fallback.textContent = "The 3D context was lost. Reload the page to restore the exchange view."; }
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

  function mountLab(lab) {
    if (lab.dataset.exchangeMounted === "true") return;
    lab.dataset.exchangeMounted = "true";
    const find = function (name) { return lab.querySelector(`[data-${name}]`); };
    const format = find("exchange-format");
    const detail = find("mesh-detail");
    const detailOutput = find("mesh-detail-output");
    const canvas = find("exchange-canvas");
    const fallback = find("exchange-fallback");
    const status = find("exchange-status");
    const overlayTitle = find("exchange-overlay-title");
    const overlayText = find("exchange-overlay-text");
    if (!format || !detail || !canvas) return;
    const viewer = createViewer(canvas, fallback);

    function update(announce) {
      const profile = formatProfile(format.value);
      const detailInfo = detailLevel(Number(detail.value));
      detail.disabled = !meshDependent(format.value);
      detailOutput.value = detailInfo.label;
      detailOutput.textContent = detailInfo.label;
      overlayTitle.textContent = profile.label;
      overlayText.textContent = profile.purpose;
      ["geometry", "topology", "history", "assemblies", "pmi", "units"].forEach(function (key) {
        const output = find(`retain-${key}`);
        if (output) output.textContent = profile[key];
      });
      status.textContent = profile.summary + " The rendering is a conceptual comparison; Three.js displays triangles even when the source format can carry exact surfaces.";
      canvas.setAttribute("aria-label", `${profile.label} representation of a machined plate. ${profile.geometry}; ${profile.topology}.`);
      viewer.update(format.value, Number(detail.value));
      if (announce) {
        const live = find("exchange-live");
        if (live) live.textContent = `${profile.label} selected. ${profile.summary}`;
      }
    }

    format.addEventListener("change", function () { update(true); });
    detail.addEventListener("input", function () { update(false); });
    detail.addEventListener("change", function () { update(true); });
    update(false);
    if (root) root.addEventListener("pagehide", function (event) { if (!event.persisted) viewer.dispose(); }, { once: true });
  }

  function mountAll(documentObject) {
    [...documentObject.querySelectorAll("[data-exchange-lab]")].forEach(mountLab);
  }

  return { FORMAT_PROFILES, DETAIL_LEVELS, formatProfile, detailLevel, meshDependent, mountAll };
});
