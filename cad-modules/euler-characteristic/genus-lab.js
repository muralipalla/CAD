(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EulerGenusLab = api;

  if (root.document) {
    const start = function () { api.mountAll(root.document); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else root.setTimeout(start, 0);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const EPSILON = 1e-9;
  const mountedLabs = typeof WeakMap === "function" ? new WeakMap() : null;
  const CUBE_CORNERS = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];
  const CUBE_TETRAHEDRA = [
    [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
    [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]
  ];
  const cache = new Map();

  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
  function edgeKey(a, b) { return a < b ? a + ":" + b : b + ":" + a; }
  function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function centroid(a, b, c) { return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]; }

  function tunnelCenters(genus) {
    const count = clamp(Math.round(Number(genus) || 0), 0, 3);
    if (count === 0) return [];
    if (count === 1) return [0];
    if (count === 2) return [-0.52, 0.52];
    return [-0.7, 0, 0.7];
  }

  function fieldParameters(genus) {
    const handles = clamp(Math.round(Number(genus) || 0), 0, 3);
    return {
      genus: handles,
      sphereRadius: 1.45,
      tunnelRadius: handles < 3 ? 0.285 : 0.235,
      centers: tunnelCenters(handles)
    };
  }

  function genusField(point, genus) {
    const parameters = fieldParameters(genus);
    const x = point[0], y = point[1], z = point[2];
    const sphere = Math.hypot(x, y, z) - parameters.sphereRadius;
    if (!parameters.centers.length) return sphere;
    let cutter = Infinity;
    parameters.centers.forEach(function (center) {
      cutter = Math.min(cutter, Math.hypot(x - center, z) - parameters.tunnelRadius);
    });
    return Math.max(sphere, -cutter);
  }

  function surfaceKind(point, genus) {
    const parameters = fieldParameters(genus);
    if (!parameters.centers.length) return "exterior";
    const sphereDistance = Math.abs(Math.hypot(point[0], point[1], point[2]) - parameters.sphereRadius);
    let tunnelDistance = Infinity;
    parameters.centers.forEach(function (center) {
      tunnelDistance = Math.min(tunnelDistance, Math.abs(Math.hypot(point[0] - center, point[2]) - parameters.tunnelRadius));
    });
    return tunnelDistance < sphereDistance ? "tunnel" : "exterior";
  }

  function fieldGradient(point, genus) {
    const step = 1e-4;
    return [0, 1, 2].map(function (axis) {
      const before = point.slice(), after = point.slice();
      before[axis] -= step; after[axis] += step;
      return (genusField(after, genus) - genusField(before, genus)) / (2 * step);
    });
  }

  function buildGenusMesh(genus, resolution) {
    const handles = clamp(Math.round(Number(genus) || 0), 0, 3);
    const divisions = clamp(Math.round(Number(resolution) || 28), 18, 42);
    const key = handles + ":" + divisions;
    if (cache.has(key)) return cache.get(key);

    const minimum = -1.62, maximum = 1.62;
    const size = divisions + 1;
    const step = (maximum - minimum) / divisions;
    const values = new Float64Array(size * size * size);
    const gridIndex = function (i, j, k) { return i + size * (j + size * k); };
    const gridPoint = function (i, j, k) { return [minimum + i * step, minimum + j * step, minimum + k * step]; };

    for (let k = 0; k < size; k += 1) {
      for (let j = 0; j < size; j += 1) {
        for (let i = 0; i < size; i += 1) values[gridIndex(i, j, k)] = genusField(gridPoint(i, j, k), handles);
      }
    }

    const vertices = [], faces = [], faceKinds = [], intersections = new Map();
    function intersection(aId, bId, aPoint, bPoint, aValue, bValue) {
      const cacheKey = edgeKey(aId, bId);
      if (intersections.has(cacheKey)) return intersections.get(cacheKey);
      const denominator = aValue - bValue;
      const amount = Math.abs(denominator) <= EPSILON ? 0.5 : clamp(aValue / denominator, 0, 1);
      const vertex = [
        aPoint[0] + amount * (bPoint[0] - aPoint[0]),
        aPoint[1] + amount * (bPoint[1] - aPoint[1]),
        aPoint[2] + amount * (bPoint[2] - aPoint[2])
      ];
      const index = vertices.length;
      vertices.push(vertex);
      intersections.set(cacheKey, index);
      return index;
    }

    function addFace(indices) {
      if (new Set(indices).size < 3) return;
      let face = indices.slice();
      const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
      const normal = cross(subtract(b, a), subtract(c, a));
      const center = centroid(a, b, c);
      if (dot(normal, fieldGradient(center, handles)) < 0) face = [face[0], face[2], face[1]];
      faces.push(face);
      faceKinds.push(surfaceKind(center, handles));
    }

    for (let k = 0; k < divisions; k += 1) {
      for (let j = 0; j < divisions; j += 1) {
        for (let i = 0; i < divisions; i += 1) {
          const ids = CUBE_CORNERS.map(function (corner) { return gridIndex(i + corner[0], j + corner[1], k + corner[2]); });
          const points = CUBE_CORNERS.map(function (corner) { return gridPoint(i + corner[0], j + corner[1], k + corner[2]); });
          const cubeValues = ids.map(function (id) { return values[id]; });
          CUBE_TETRAHEDRA.forEach(function (tetra) {
            const inside = tetra.filter(function (local) { return cubeValues[local] <= 0; });
            const outside = tetra.filter(function (local) { return cubeValues[local] > 0; });
            const cut = function (localA, localB) {
              return intersection(ids[localA], ids[localB], points[localA], points[localB], cubeValues[localA], cubeValues[localB]);
            };
            if (inside.length === 1) {
              addFace([cut(inside[0], outside[0]), cut(inside[0], outside[1]), cut(inside[0], outside[2])]);
            } else if (inside.length === 3) {
              addFace([cut(outside[0], inside[0]), cut(outside[0], inside[2]), cut(outside[0], inside[1])]);
            } else if (inside.length === 2) {
              const a = cut(inside[0], outside[0]), b = cut(inside[0], outside[1]);
              const c = cut(inside[1], outside[0]), d = cut(inside[1], outside[1]);
              addFace([a, b, d]);
              addFace([a, d, c]);
            }
          });
        }
      }
    }

    const mesh = { genus: handles, resolution: divisions, vertices: vertices, faces: faces, faceKinds: faceKinds };
    cache.set(key, mesh);
    return mesh;
  }

  function collectEdges(faces, omittedFaces) {
    const omitted = omittedFaces instanceof Set ? omittedFaces : new Set(omittedFaces || []);
    const edges = new Map();
    faces.forEach(function (face, faceIndex) {
      if (omitted.has(faceIndex)) return;
      [[face[0], face[1]], [face[1], face[2]], [face[2], face[0]]].forEach(function (pair) {
        const key = edgeKey(pair[0], pair[1]);
        const edge = edges.get(key);
        if (edge) edge.count += 1;
        else edges.set(key, { a: pair[0], b: pair[1], count: 1 });
      });
    });
    return Array.from(edges.values());
  }

  function topologyCounts(mesh, omittedFaces) {
    const omitted = omittedFaces instanceof Set ? omittedFaces : new Set(omittedFaces || []);
    const used = new Set();
    let faceCount = 0;
    mesh.faces.forEach(function (face, index) {
      if (omitted.has(index)) return;
      faceCount += 1;
      face.forEach(function (vertex) { used.add(vertex); });
    });
    const edgeCount = collectEdges(mesh.faces, omitted).length;
    return { V: used.size, E: edgeCount, F: faceCount, chi: used.size - edgeCount + faceCount };
  }

  function selectBoundaryFaces(mesh, count) {
    const requested = clamp(Math.round(Number(count) || 0), 0, 3);
    const directions = [[0, 0.25, 1], [-0.78, 0.38, 0.55], [0.78, 0.38, 0.55]];
    const chosen = [], usedVertices = new Set();
    for (let targetIndex = 0; targetIndex < requested; targetIndex += 1) {
      const target = directions[targetIndex];
      let bestIndex = -1, bestScore = -Infinity;
      mesh.faces.forEach(function (face, faceIndex) {
        if (mesh.faceKinds[faceIndex] !== "exterior" || face.some(function (vertex) { return usedVertices.has(vertex); })) return;
        const center = centroid(mesh.vertices[face[0]], mesh.vertices[face[1]], mesh.vertices[face[2]]);
        const length = Math.hypot(center[0], center[1], center[2]) || 1;
        const score = (center[0] * target[0] + center[1] * target[1] + center[2] * target[2]) / length;
        if (score > bestScore) { bestScore = score; bestIndex = faceIndex; }
      });
      if (bestIndex >= 0) {
        chosen.push(bestIndex);
        mesh.faces[bestIndex].forEach(function (vertex) { usedVertices.add(vertex); });
      }
    }
    return chosen;
  }

  function boundaryComponentCount(mesh, omittedFaces) {
    const boundaryEdges = collectEdges(mesh.faces, new Set(omittedFaces || [])).filter(function (edge) { return edge.count === 1; });
    const adjacency = new Map();
    boundaryEdges.forEach(function (edge) {
      if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
      if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
      adjacency.get(edge.a).push(edge.b); adjacency.get(edge.b).push(edge.a);
    });
    const visited = new Set();
    let components = 0;
    adjacency.forEach(function (_, start) {
      if (visited.has(start)) return;
      components += 1;
      const stack = [start]; visited.add(start);
      while (stack.length) {
        const vertex = stack.pop();
        (adjacency.get(vertex) || []).forEach(function (next) {
          if (!visited.has(next)) { visited.add(next); stack.push(next); }
        });
      }
    });
    return components;
  }

  function genusFromEuler(chi, boundaryComponents) {
    const value = (2 - Number(boundaryComponents || 0) - Number(chi)) / 2;
    return Math.abs(value - Math.round(value)) <= 1e-7 ? Math.round(value) : value;
  }

  function connectedSumEuler(firstChi, secondChi) { return Number(firstChi) + Number(secondChi) - 2; }

  function setText(node, value) { if (node && node.textContent !== String(value)) node.textContent = String(value); }

  function createView(lab, canvas, fallback) {
    const T = root.THREE;
    if (!canvas || !T) {
      if (fallback) { fallback.hidden = false; setText(fallback, "The genus viewer needs WebGL. The formulas and counts remain available."); }
      return null;
    }
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false }); }
    catch (_) {
      if (fallback) { fallback.hidden = false; setText(fallback, "The genus viewer needs WebGL. The formulas and counts remain available."); }
      return null;
    }
    if (fallback) fallback.hidden = true;
    if ("outputColorSpace" in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene();
    scene.background = new T.Color(0x10182d);
    const camera = new T.PerspectiveCamera(35, 1, 0.01, 100);
    scene.add(new T.HemisphereLight(0xe8f7ff, 0x251a3d, 1.2));
    const key = new T.DirectionalLight(0xffffff, 1.4); key.position.set(4, 5, 6); scene.add(key);
    const rim = new T.DirectionalLight(0xff9f43, 0.45); rim.position.set(-4, 1, -5); scene.add(rim);
    const model = new T.Group(); scene.add(model);
    let azimuth = 0.72, elevation = 0.35, distance = 5.5, pending = false, disposed = false, pointer = null;
    let objects = [];
    const listeners = [];
    const listen = function (target, name, handler, options) { target.addEventListener(name, handler, options); listeners.push([target, name, handler, options]); };

    function render() {
      pending = false;
      if (disposed) return;
      const width = canvas.clientWidth || canvas.width || 640, height = canvas.clientHeight || canvas.height || 480;
      renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1)); renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
      const cosine = Math.cos(elevation);
      camera.position.set(distance * cosine * Math.sin(azimuth), distance * Math.sin(elevation), distance * cosine * Math.cos(azimuth));
      camera.lookAt(0, 0, 0); renderer.render(scene, camera);
    }
    function requestRender() { if (!pending && !disposed) { pending = true; root.requestAnimationFrame(render); } }
    function disposeObjects() {
      objects.forEach(function (object) {
        model.remove(object);
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
      objects = [];
    }
    function geometryFor(mesh, faceIndices) {
      const positions = new Float32Array(mesh.vertices.length * 3);
      mesh.vertices.forEach(function (point, index) { positions[index * 3] = point[0]; positions[index * 3 + 1] = point[1]; positions[index * 3 + 2] = point[2]; });
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
      const indices = [];
      faceIndices.forEach(function (index) { indices.push.apply(indices, mesh.faces[index]); });
      geometry.setIndex(indices); geometry.computeVertexNormals();
      return geometry;
    }
    function lineGeometry(mesh, edges) {
      const values = new Float32Array(edges.length * 6);
      edges.forEach(function (edge, index) {
        const a = mesh.vertices[edge.a], b = mesh.vertices[edge.b], offset = index * 6;
        values[offset] = a[0]; values[offset + 1] = a[1]; values[offset + 2] = a[2];
        values[offset + 3] = b[0]; values[offset + 4] = b[1]; values[offset + 5] = b[2];
      });
      const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.BufferAttribute(values, 3)); return geometry;
    }
    function update(mesh, omittedFaces, showEdges) {
      disposeObjects();
      const omitted = new Set(omittedFaces);
      const exterior = [], tunnels = [];
      mesh.faces.forEach(function (_, index) {
        if (omitted.has(index)) return;
        (mesh.faceKinds[index] === "tunnel" ? tunnels : exterior).push(index);
      });
      const exteriorObject = new T.Mesh(geometryFor(mesh, exterior), new T.MeshPhongMaterial({
        color: 0x8fd3ff,
        emissive: 0x10293d,
        specular: 0xd9f3ff,
        shininess: 30,
        side: T.DoubleSide,
        flatShading: true,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
      }));
      exteriorObject.renderOrder = 1;
      model.add(exteriorObject); objects.push(exteriorObject);
      if (tunnels.length) {
        const tunnelObject = new T.Mesh(geometryFor(mesh, tunnels), new T.MeshPhongMaterial({ color: 0xf28c28, emissive: 0x4d1b00, specular: 0xffc27a, shininess: 26, side: T.DoubleSide, flatShading: true }));
        tunnelObject.renderOrder = 2;
        model.add(tunnelObject); objects.push(tunnelObject);
      }
      const edges = collectEdges(mesh.faces, omitted);
      const edgeObject = new T.LineSegments(lineGeometry(mesh, edges), new T.LineBasicMaterial({ color: 0xc91f37, transparent: true, opacity: showEdges ? 0.42 : 0 }));
      edgeObject.renderOrder = 5; model.add(edgeObject); objects.push(edgeObject);
      const boundaryEdges = edges.filter(function (edge) { return edge.count === 1; });
      if (boundaryEdges.length) {
        const boundaryObject = new T.LineSegments(lineGeometry(mesh, boundaryEdges), new T.LineBasicMaterial({ color: 0x54e3ff }));
        boundaryObject.renderOrder = 7; model.add(boundaryObject); objects.push(boundaryObject);
      }
      requestRender();
    }
    function resetCamera() { azimuth = 0.72; elevation = 0.35; distance = 5.5; requestRender(); }
    listen(canvas, "pointerdown", function (event) { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
    listen(canvas, "pointermove", function (event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      azimuth -= (event.clientX - pointer.x) * 0.009; elevation = clamp(elevation + (event.clientY - pointer.y) * 0.009, -1.3, 1.3);
      pointer.x = event.clientX; pointer.y = event.clientY; requestRender();
    });
    const release = function (event) { if (pointer && pointer.id === event.pointerId) pointer = null; };
    listen(canvas, "pointerup", release); listen(canvas, "pointercancel", release);
    listen(canvas, "wheel", function (event) { event.preventDefault(); distance = clamp(distance * Math.exp(event.deltaY * 0.001), 3.3, 9); requestRender(); }, { passive: false });
    listen(canvas, "keydown", function (event) {
      if (event.key === "Home") { event.preventDefault(); resetCamera(); return; }
      if (event.key === "+" || event.key === "=") distance = clamp(distance * 0.9, 3.3, 9);
      else if (event.key === "-" || event.key === "_") distance = clamp(distance * 1.1, 3.3, 9);
      else if (event.key === "ArrowLeft") azimuth += 0.12;
      else if (event.key === "ArrowRight") azimuth -= 0.12;
      else if (event.key === "ArrowUp") elevation = clamp(elevation + 0.1, -1.3, 1.3);
      else if (event.key === "ArrowDown") elevation = clamp(elevation - 0.1, -1.3, 1.3);
      else return;
      event.preventDefault(); requestRender();
    });
    const observer = typeof root.ResizeObserver === "function" ? new root.ResizeObserver(requestRender) : null;
    if (observer) { observer.observe(canvas); listeners.push([observer, "disconnect"]); }
    requestRender();
    return {
      update: update,
      resetCamera: resetCamera,
      dispose: function () {
        disposed = true; disposeObjects();
        listeners.forEach(function (entry) { if (entry[1] === "disconnect") entry[0].disconnect(); else entry[0].removeEventListener(entry[1], entry[2], entry[3]); });
        renderer.dispose();
      }
    };
  }

  function mount(lab) {
    if (!lab || typeof lab.querySelector !== "function") return null;
    if (mountedLabs && mountedLabs.has(lab)) return mountedLabs.get(lab);
    const canvas = lab.querySelector("[data-genus-canvas]");
    const fallback = lab.querySelector("[data-genus-fallback]");
    const genusInput = lab.querySelector("[data-genus-input]");
    const boundaryInput = lab.querySelector("[data-boundary-input]");
    const edgeInput = lab.querySelector("[data-genus-option='edges']");
    const status = lab.querySelector("[data-genus-live]");
    const view = createView(lab, canvas, fallback);
    const state = { genus: Number(genusInput && genusInput.value) || 0, boundaries: Number(boundaryInput && boundaryInput.value) || 0, showEdges: !edgeInput || edgeInput.checked };
    const removers = [];
    const on = function (target, name, handler) { if (!target) return; target.addEventListener(name, handler); removers.push(function () { target.removeEventListener(name, handler); }); };
    function connectedSumLabel(genus) {
      if (genus === 0) return "S²";
      return Array.from({ length: genus }, function () { return "T²"; }).join(" # ");
    }
    function renderState() {
      const mesh = buildGenusMesh(state.genus, 28);
      const omitted = selectBoundaryFaces(mesh, state.boundaries);
      const counts = topologyCounts(mesh, omitted);
      const boundaryCount = boundaryComponentCount(mesh, omitted);
      setText(lab.querySelector("[data-genus-v]"), counts.V);
      setText(lab.querySelector("[data-genus-e]"), counts.E);
      setText(lab.querySelector("[data-genus-f]"), counts.F);
      setText(lab.querySelector("[data-genus-chi]"), counts.chi);
      Array.from(lab.querySelectorAll("[data-genus-value]")).forEach(function (node) { setText(node, state.genus); });
      Array.from(lab.querySelectorAll("[data-boundary-value]")).forEach(function (node) { setText(node, boundaryCount); });
      setText(lab.querySelector("[data-genus-formula]"), "χ = 2 − 2(" + state.genus + ") − " + boundaryCount + " = " + counts.chi);
      setText(lab.querySelector("[data-connected-sum]"), connectedSumLabel(state.genus));
      setText(status, "Genus " + state.genus + " with " + boundaryCount + " boundary component" + (boundaryCount === 1 ? "" : "s") + ". The mesh gives V − E + F = " + counts.chi + ", so g = (2 − b − χ)/2 = " + genusFromEuler(counts.chi, boundaryCount) + ".");
      if (view) view.update(mesh, omitted, state.showEdges);
    }
    on(genusInput, "input", function () { state.genus = Number(genusInput.value); renderState(); });
    on(boundaryInput, "input", function () { state.boundaries = Number(boundaryInput.value); renderState(); });
    on(edgeInput, "change", function () { state.showEdges = edgeInput.checked; renderState(); });
    Array.from(lab.querySelectorAll("[data-genus-action]")).forEach(function (button) {
      on(button, "click", function () {
        const action = button.getAttribute("data-genus-action");
        if (action === "add-handle") state.genus = Math.min(3, state.genus + 1);
        else if (action === "remove-handle") state.genus = Math.max(0, state.genus - 1);
        else if (action === "reset-view" && view) { view.resetCamera(); return; }
        if (genusInput) genusInput.value = String(state.genus);
        renderState();
      });
    });
    const controller = { render: renderState, dispose: function () { removers.forEach(function (remove) { remove(); }); if (view) view.dispose(); if (mountedLabs) mountedLabs.delete(lab); } };
    if (mountedLabs) mountedLabs.set(lab, controller);
    renderState();
    return controller;
  }

  function mountAll(scope) {
    const documentRoot = scope && typeof scope.querySelectorAll === "function" ? scope : root.document;
    if (!documentRoot) return [];
    return Array.from(documentRoot.querySelectorAll("[data-genus-lab]")).map(mount).filter(Boolean);
  }

  return {
    EPSILON: EPSILON,
    fieldParameters: fieldParameters,
    genusField: genusField,
    surfaceKind: surfaceKind,
    buildGenusMesh: buildGenusMesh,
    collectEdges: collectEdges,
    topologyCounts: topologyCounts,
    selectBoundaryFaces: selectBoundaryFaces,
    boundaryComponentCount: boundaryComponentCount,
    genusFromEuler: genusFromEuler,
    connectedSumEuler: connectedSumEuler,
    mount: mount,
    mountAll: mountAll
  };
});
