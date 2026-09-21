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
  function unit(vector) {
    const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
    return [vector[0] / length, vector[1] / length, vector[2] / length];
  }
  function smoothMinimum(a, b, radius) {
    const blend = Math.max(0, Number(radius) || 0);
    if (!blend) return Math.min(a, b);
    const h = Math.max(blend - Math.abs(a - b), 0) / blend;
    return Math.min(a, b) - h * h * blend * 0.25;
  }
  function smoothMaximum(a, b, radius) { return -smoothMinimum(-a, -b, radius); }

  function connectionAngles(stage) {
    const count = clamp(Math.round(Number(stage) || 0), 0, 2);
    return [0, Math.PI / 3].slice(0, count);
  }

  function fieldParameters(stage) {
    const connections = clamp(Math.round(Number(stage) || 0), 0, 2);
    return {
      stage: connections,
      sphereRadius: 1.45,
      torusMajorRadius: 0.78,
      torusMinorRadius: 0.24,
      passageRadius: 0.14,
      passageStart: 0.86,
      passageEnd: 1.62,
      blendRadius: 0.065,
      angles: connectionAngles(connections)
    };
  }

  function torusDistance(point, parameters) {
    return Math.hypot(Math.hypot(point[0], point[1]) - parameters.torusMajorRadius, point[2]) - parameters.torusMinorRadius;
  }

  function passageDistance(point, angle, parameters) {
    const direction = [Math.cos(angle), Math.sin(angle), 0];
    const start = direction.map(function (value) { return value * parameters.passageStart; });
    const end = direction.map(function (value) { return value * parameters.passageEnd; });
    const segment = subtract(end, start);
    const relative = subtract(point, start);
    const amount = clamp(dot(relative, segment) / dot(segment, segment), 0, 1);
    const closest = [start[0] + amount * segment[0], start[1] + amount * segment[1], 0];
    return Math.hypot(point[0] - closest[0], point[1] - closest[1], point[2]) - parameters.passageRadius;
  }

  function genusField(point, stage) {
    const parameters = fieldParameters(stage);
    const x = point[0], y = point[1], z = point[2];
    const sphere = Math.hypot(x, y, z) - parameters.sphereRadius;
    let cutter = torusDistance(point, parameters);
    parameters.angles.forEach(function (angle) {
      cutter = smoothMinimum(cutter, passageDistance(point, angle, parameters), parameters.blendRadius);
    });
    return smoothMaximum(sphere, -cutter, parameters.blendRadius);
  }

  function surfaceKind(point, stage) {
    const parameters = fieldParameters(stage);
    const sphereDistance = Math.abs(Math.hypot(point[0], point[1], point[2]) - parameters.sphereRadius);
    const innerTorusDistance = Math.abs(torusDistance(point, parameters));
    let passageWallDistance = Infinity;
    parameters.angles.forEach(function (angle) {
      passageWallDistance = Math.min(passageWallDistance, Math.abs(passageDistance(point, angle, parameters)));
    });
    if (sphereDistance <= innerTorusDistance && sphereDistance <= passageWallDistance) return "outer";
    return innerTorusDistance <= passageWallDistance ? "inner-torus" : "connection";
  }

  function fieldGradient(point, stage) {
    const step = 1e-4;
    return [0, 1, 2].map(function (axis) {
      const before = point.slice(), after = point.slice();
      before[axis] -= step; after[axis] += step;
      return (genusField(after, stage) - genusField(before, stage)) / (2 * step);
    });
  }

  function buildGenusMesh(stage, resolution) {
    const connections = clamp(Math.round(Number(stage) || 0), 0, 2);
    const divisions = clamp(Math.round(Number(resolution) || 28), 18, 42);
    const key = connections + ":" + divisions;
    if (cache.has(key)) return cache.get(key);

    const minimum = -1.62, maximum = 1.62;
    const size = divisions + 1;
    const step = (maximum - minimum) / divisions;
    const values = new Float64Array(size * size * size);
    const gridIndex = function (i, j, k) { return i + size * (j + size * k); };
    const gridPoint = function (i, j, k) { return [minimum + i * step, minimum + j * step, minimum + k * step]; };

    for (let k = 0; k < size; k += 1) {
      for (let j = 0; j < size; j += 1) {
        for (let i = 0; i < size; i += 1) values[gridIndex(i, j, k)] = genusField(gridPoint(i, j, k), connections);
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
      if (dot(normal, fieldGradient(center, connections)) < 0) face = [face[0], face[2], face[1]];
      faces.push(face);
      faceKinds.push(surfaceKind(center, connections));
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

    const normals = vertices.map(function (point) { return unit(fieldGradient(point, connections)); });
    const mesh = { stage: connections, genus: connections, resolution: divisions, vertices: vertices, normals: normals, faces: faces, faceKinds: faceKinds };
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

  function componentTopologies(mesh, omittedFaces) {
    const omitted = omittedFaces instanceof Set ? omittedFaces : new Set(omittedFaces || []);
    const vertexFaces = new Map();
    mesh.faces.forEach(function (face, faceIndex) {
      if (omitted.has(faceIndex)) return;
      face.forEach(function (vertex) {
        if (!vertexFaces.has(vertex)) vertexFaces.set(vertex, []);
        vertexFaces.get(vertex).push(faceIndex);
      });
    });
    const visited = new Set(), components = [];
    mesh.faces.forEach(function (_, startFace) {
      if (omitted.has(startFace) || visited.has(startFace)) return;
      const stack = [startFace], faceIndices = [];
      visited.add(startFace);
      while (stack.length) {
        const faceIndex = stack.pop();
        faceIndices.push(faceIndex);
        mesh.faces[faceIndex].forEach(function (vertex) {
          (vertexFaces.get(vertex) || []).forEach(function (neighbor) {
            if (!visited.has(neighbor)) { visited.add(neighbor); stack.push(neighbor); }
          });
        });
      }
      const vertices = new Set(), edges = new Set();
      faceIndices.forEach(function (faceIndex) {
        const face = mesh.faces[faceIndex];
        face.forEach(function (vertex) { vertices.add(vertex); });
        edges.add(edgeKey(face[0], face[1]));
        edges.add(edgeKey(face[1], face[2]));
        edges.add(edgeKey(face[2], face[0]));
      });
      const chi = vertices.size - edges.size + faceIndices.length;
      components.push({ V: vertices.size, E: edges.size, F: faceIndices.length, chi: chi, genus: (2 - chi) / 2, faces: faceIndices });
    });
    return components.sort(function (a, b) { return b.chi - a.chi; });
  }

  function totalGenusFromEuler(chi, connectedComponents) {
    const value = Number(connectedComponents) - Number(chi) / 2;
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
    let objects = [], exteriorMaterial = null;
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
      exteriorMaterial = null;
    }
    function geometryFor(mesh, faceIndices) {
      const positions = new Float32Array(mesh.vertices.length * 3);
      mesh.vertices.forEach(function (point, index) { positions[index * 3] = point[0]; positions[index * 3 + 1] = point[1]; positions[index * 3 + 2] = point[2]; });
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
      if (mesh.normals) {
        const normals = new Float32Array(mesh.normals.length * 3);
        mesh.normals.forEach(function (normal, index) { normals[index * 3] = normal[0]; normals[index * 3 + 1] = normal[1]; normals[index * 3 + 2] = normal[2]; });
        geometry.setAttribute("normal", new T.BufferAttribute(normals, 3));
      }
      const indices = [];
      faceIndices.forEach(function (index) { indices.push.apply(indices, mesh.faces[index]); });
      geometry.setIndex(indices);
      if (!mesh.normals) geometry.computeVertexNormals();
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
    function update(mesh, showEdges, exteriorTransparency) {
      disposeObjects();
      const outerFaces = [], cavityFaces = [];
      mesh.faces.forEach(function (_, index) {
        (mesh.faceKinds[index] === "outer" ? outerFaces : cavityFaces).push(index);
      });
      const shellTransparency = clamp(Number(exteriorTransparency), 0, 0.9);
      if (cavityFaces.length) {
        const cavityObject = new T.Mesh(geometryFor(mesh, cavityFaces), new T.MeshPhongMaterial({ color: 0xf28c28, emissive: 0x4d1b00, specular: 0xffc27a, shininess: 28, side: T.DoubleSide, flatShading: false }));
        cavityObject.renderOrder = 1;
        model.add(cavityObject); objects.push(cavityObject);
      }
      exteriorMaterial = new T.MeshPhongMaterial({ color: 0x8fd3ff, emissive: 0x10293d, specular: 0xd9f3ff, shininess: 30, side: T.DoubleSide, flatShading: false, transparent: true, opacity: 1 - shellTransparency, depthWrite: false });
      const exteriorObject = new T.Mesh(geometryFor(mesh, outerFaces), exteriorMaterial);
      exteriorObject.renderOrder = 1;
      model.add(exteriorObject); objects.push(exteriorObject);
      const parameters = fieldParameters(mesh.stage);
      parameters.angles.forEach(function (angle) {
        const direction = new T.Vector3(Math.cos(angle), Math.sin(angle), 0);
        const across = new T.Vector3(-Math.sin(angle), Math.cos(angle), 0);
        const center = direction.clone().multiplyScalar(Math.sqrt(parameters.sphereRadius * parameters.sphereRadius - parameters.passageRadius * parameters.passageRadius));
        const points = Array.from({ length: 96 }, function (_, index) {
          const around = 2 * Math.PI * index / 96;
          return center.clone().addScaledVector(across, parameters.passageRadius * Math.cos(around)).add(new T.Vector3(0, 0, parameters.passageRadius * Math.sin(around)));
        });
        const collar = new T.Mesh(
          new T.TubeGeometry(new T.CatmullRomCurve3(points, true, "centripetal"), 96, 0.018, 8, true),
          new T.MeshPhongMaterial({ color: 0xf28c28, emissive: 0x4d1b00, specular: 0xffc27a, shininess: 28 })
        );
        collar.renderOrder = 2;
        model.add(collar); objects.push(collar);
      });
      const edges = collectEdges(mesh.faces, []);
      const edgeObject = new T.LineSegments(lineGeometry(mesh, edges), new T.LineBasicMaterial({ color: 0xc91f37, transparent: true, opacity: showEdges ? 0.42 : 0 }));
      edgeObject.renderOrder = 5; model.add(edgeObject); objects.push(edgeObject);
      requestRender();
    }
    function setExteriorTransparency(transparency) {
      if (!exteriorMaterial) return;
      exteriorMaterial.opacity = 1 - clamp(Number(transparency), 0, 0.9);
      exteriorMaterial.needsUpdate = true;
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
      setExteriorTransparency: setExteriorTransparency,
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
    const connectionInput = lab.querySelector("[data-connection-input]");
    const transparencyInput = lab.querySelector("[data-genus-transparency]");
    const transparencyOutput = lab.querySelector("[data-genus-transparency-value]");
    const edgeInput = lab.querySelector("[data-genus-option='edges']");
    const status = lab.querySelector("[data-genus-live]");
    const view = createView(lab, canvas, fallback);
    const initialTransparency = Number(transparencyInput && transparencyInput.value);
    const state = {
      stage: clamp(Number(connectionInput && connectionInput.value) || 0, 0, 2),
      transparency: clamp(Number.isFinite(initialTransparency) ? initialTransparency / 100 : 0.62, 0, 0.9),
      showEdges: !edgeInput || edgeInput.checked
    };
    const removers = [];
    const on = function (target, name, handler) { if (!target) return; target.addEventListener(name, handler); removers.push(function () { target.removeEventListener(name, handler); }); };
    const stageNames = ["Separate shells", "Single connection", "Double connection"];
    const stageNotations = ["S² ⊔ T²", "S² # T² ≅ T²", "(S² # T²) # T² ≅ T² # T²"];
    function renderState() {
      const mesh = buildGenusMesh(state.stage, 42);
      const counts = topologyCounts(mesh, []);
      const components = componentTopologies(mesh, []);
      const shellCount = components.length;
      const totalGenus = totalGenusFromEuler(counts.chi, shellCount);
      setText(lab.querySelector("[data-genus-v]"), counts.V);
      setText(lab.querySelector("[data-genus-e]"), counts.E);
      setText(lab.querySelector("[data-genus-f]"), counts.F);
      setText(lab.querySelector("[data-genus-chi]"), counts.chi);
      Array.from(lab.querySelectorAll("[data-connection-value]")).forEach(function (node) { setText(node, state.stage); });
      setText(lab.querySelector("[data-stage-name]"), stageNames[state.stage]);
      setText(lab.querySelector("[data-shell-count]"), shellCount);
      setText(lab.querySelector("[data-total-genus]"), totalGenus);
      setText(transparencyOutput, Math.round(state.transparency * 100) + "%");
      setText(lab.querySelector("[data-genus-formula]"), "χ = 2(" + shellCount + ") − 2(" + totalGenus + ") = " + counts.chi);
      setText(lab.querySelector("[data-connected-sum]"), stageNotations[state.stage]);
      if (state.stage === 0) setText(status, "Two closed boundary shells: an outer sphere (χ = 2) and an inner torus (χ = 0). Their total is χ = " + counts.chi + ".");
      else if (state.stage === 1) setText(status, "One passage joins the two shells by connected sum. The boundary is now one torus with χ = " + counts.chi + ".");
      else setText(status, "The second passage adds a handle to the connected boundary. The result has total genus 2 and χ = " + counts.chi + ".");
      Array.from(lab.querySelectorAll("[data-genus-action]" )).forEach(function (button) {
        const action = button.getAttribute("data-genus-action");
        if (action === "add-connection") button.disabled = state.stage >= 2;
        if (action === "remove-connection") button.disabled = state.stage <= 0;
      });
      if (view) view.update(mesh, state.showEdges, state.transparency);
    }
    on(connectionInput, "input", function () { state.stage = Number(connectionInput.value); renderState(); });
    on(transparencyInput, "input", function () {
      state.transparency = clamp(Number(transparencyInput.value) / 100, 0, 0.9);
      setText(transparencyOutput, Math.round(state.transparency * 100) + "%");
      transparencyInput.setAttribute("aria-valuetext", Math.round(state.transparency * 100) + "% transparent");
      if (view) view.setExteriorTransparency(state.transparency);
    });
    on(edgeInput, "change", function () { state.showEdges = edgeInput.checked; renderState(); });
    Array.from(lab.querySelectorAll("[data-genus-action]")).forEach(function (button) {
      on(button, "click", function () {
        const action = button.getAttribute("data-genus-action");
        if (action === "add-connection") state.stage = Math.min(2, state.stage + 1);
        else if (action === "remove-connection") state.stage = Math.max(0, state.stage - 1);
        else if (action === "reset-view" && view) { view.resetCamera(); return; }
        if (connectionInput) connectionInput.value = String(state.stage);
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
    boundaryField: genusField,
    genusField: genusField,
    surfaceKind: surfaceKind,
    buildBoundaryMesh: buildGenusMesh,
    buildGenusMesh: buildGenusMesh,
    collectEdges: collectEdges,
    topologyCounts: topologyCounts,
    componentTopologies: componentTopologies,
    totalGenusFromEuler: totalGenusFromEuler,
    connectedSumEuler: connectedSumEuler,
    mount: mount,
    mountAll: mountAll
  };
});
