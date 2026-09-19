(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EulerSphereLab = api;

  if (root.document) {
    const start = function () { api.mountAll(root.document); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else root.setTimeout(start, 0);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const EPSILON = 1e-10;
  const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
  const BASE_VERTICES = [
    [-1, GOLDEN_RATIO, 0], [1, GOLDEN_RATIO, 0], [-1, -GOLDEN_RATIO, 0], [1, -GOLDEN_RATIO, 0],
    [0, -1, GOLDEN_RATIO], [0, 1, GOLDEN_RATIO], [0, -1, -GOLDEN_RATIO], [0, 1, -GOLDEN_RATIO],
    [GOLDEN_RATIO, 0, -1], [GOLDEN_RATIO, 0, 1], [-GOLDEN_RATIO, 0, -1], [-GOLDEN_RATIO, 0, 1]
  ];
  const BASE_FACES = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  const mountedLabs = typeof WeakMap === "function" ? new WeakMap() : null;

  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, factor) { return [a[0] * factor, a[1] * factor, a[2] * factor]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  function length(a) { return Math.hypot(a[0], a[1], a[2]); }
  function normalize(a, radius) {
    const magnitude = length(a);
    if (magnitude < EPSILON) throw new RangeError("Cannot normalize a zero vector.");
    return scale(a, (radius == null ? 1 : radius) / magnitude);
  }
  function average3(a, b, c) { return scale(add(add(a, b), c), 1 / 3); }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function edgeKey(a, b) { return a < b ? a + ":" + b : b + ":" + a; }

  function orientFacesOutward(vertices, faces) {
    return faces.map(function (face) {
      const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
      const normal = cross(subtract(b, a), subtract(c, a));
      return dot(normal, average3(a, b, c)) < 0 ? [face[0], face[2], face[1]] : face.slice();
    });
  }

  function collectEdges(faces, omittedFaceIndex) {
    const edgeMap = new Map();
    faces.forEach(function (face, faceIndex) {
      if (faceIndex === omittedFaceIndex) return;
      [[face[0], face[1]], [face[1], face[2]], [face[2], face[0]]].forEach(function (pair) {
        const a = Math.min(pair[0], pair[1]), b = Math.max(pair[0], pair[1]);
        const key = edgeKey(a, b);
        const existing = edgeMap.get(key);
        if (existing) {
          existing.count += 1;
          existing.faces.push(faceIndex);
        } else edgeMap.set(key, { a: a, b: b, count: 1, faces: [faceIndex] });
      });
    });
    return Array.from(edgeMap.values());
  }

  function buildIcosphere(detail, radius) {
    const level = detail == null ? 1 : detail;
    const sphereRadius = radius == null ? 1 : radius;
    if (!Number.isInteger(level) || level < 0 || level > 5) throw new RangeError("detail must be an integer from 0 through 5.");
    if (!Number.isFinite(sphereRadius) || sphereRadius <= 0) throw new RangeError("radius must be positive.");

    let vertices = BASE_VERTICES.map(function (point) { return normalize(point, sphereRadius); });
    let faces = BASE_FACES.map(function (face) { return face.slice(); });

    for (let subdivision = 0; subdivision < level; subdivision += 1) {
      const midpointCache = new Map();
      const midpoint = function (a, b) {
        const key = edgeKey(a, b);
        if (midpointCache.has(key)) return midpointCache.get(key);
        const point = normalize(add(vertices[a], vertices[b]), sphereRadius);
        const index = vertices.length;
        vertices.push(point);
        midpointCache.set(key, index);
        return index;
      };
      const nextFaces = [];
      faces.forEach(function (face) {
        const a = face[0], b = face[1], c = face[2];
        const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      });
      faces = nextFaces;
    }

    faces = orientFacesOutward(vertices, faces);
    const edges = collectEdges(faces).map(function (edge) { return [edge.a, edge.b]; });
    return { detail: level, radius: sphereRadius, vertices: vertices, faces: faces, edges: edges };
  }

  function topologyCounts(mesh, omittedFaceIndex) {
    if (!mesh || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) throw new TypeError("A mesh with vertices and faces is required.");
    const usedVertices = new Set();
    let faceCount = 0;
    mesh.faces.forEach(function (face, faceIndex) {
      if (faceIndex === omittedFaceIndex) return;
      faceCount += 1;
      face.forEach(function (index) { usedVertices.add(index); });
    });
    const edgeCount = collectEdges(mesh.faces, omittedFaceIndex).length;
    const vertexCount = usedVertices.size;
    return { V: vertexCount, E: edgeCount, F: faceCount, chi: vertexCount - edgeCount + faceCount };
  }

  function outwardPlane(vertices, face) {
    const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
    let normal = normalize(cross(subtract(b, a), subtract(c, a)));
    if (dot(normal, average3(a, b, c)) < 0) normal = scale(normal, -1);
    return { normal: normal, offset: dot(normal, a) };
  }

  function prepareSchlegel(mesh, removedFaceIndex) {
    const faceIndex = removedFaceIndex == null ? 0 : removedFaceIndex;
    if (!mesh || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) throw new TypeError("A mesh with vertices and faces is required.");
    if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= mesh.faces.length) throw new RangeError("removedFaceIndex is out of range.");

    const boundary = mesh.faces[faceIndex].slice();
    const a = mesh.vertices[boundary[0]], b = mesh.vertices[boundary[1]], c = mesh.vertices[boundary[2]];
    const origin = average3(a, b, c);
    let normal = normalize(cross(subtract(b, a), subtract(c, a)));
    if (dot(normal, origin) < 0) normal = scale(normal, -1);
    const axisU = normalize(subtract(b, a));
    const axisV = normalize(cross(normal, axisU));
    const boundarySet = new Set(boundary);
    const localVertices = mesh.vertices.map(function (point, index) {
      const relative = subtract(point, origin);
      const local = [dot(relative, axisU), dot(relative, axisV), dot(relative, normal)];
      if (boundarySet.has(index)) local[2] = 0;
      return local;
    });

    let maximumHeight = Infinity;
    mesh.faces.forEach(function (face, index) {
      if (index === faceIndex) return;
      const plane = outwardPlane(mesh.vertices, face);
      const advance = dot(plane.normal, normal);
      if (advance <= EPSILON) return;
      const slack = plane.offset - dot(plane.normal, origin);
      if (slack > EPSILON) maximumHeight = Math.min(maximumHeight, slack / advance);
    });
    if (!Number.isFinite(maximumHeight) || maximumHeight <= EPSILON) maximumHeight = mesh.radius * 0.18;
    const height = Math.max(mesh.radius * 1e-5, maximumHeight * 0.45);
    const incidence = collectEdges(mesh.faces, faceIndex);

    return {
      mesh: mesh,
      faceIndex: faceIndex,
      boundary: boundary,
      origin: origin,
      basis: { u: axisU, v: axisV, n: normal },
      localVertices: localVertices,
      height: height,
      activeFaceIndices: mesh.faces.map(function (_, index) { return index; }).filter(function (index) { return index !== faceIndex; }),
      activeEdges: incidence.map(function (edge) { return [edge.a, edge.b]; }),
      boundaryEdges: incidence.filter(function (edge) { return edge.count === 1; }).map(function (edge) { return [edge.a, edge.b]; }),
      closedCounts: topologyCounts(mesh),
      openCounts: topologyCounts(mesh, faceIndex)
    };
  }

  function schlegelPosition(localPoint, progress, height) {
    const t = clamp(Number(progress), 0, 1);
    if (!Array.isArray(localPoint) || localPoint.length !== 3) throw new TypeError("localPoint must have three coordinates.");
    if (!Number.isFinite(height) || height <= 0) throw new RangeError("height must be positive.");
    const x = localPoint[0], y = localPoint[1], z = localPoint[2];
    const denominator = height - t * z;
    return [height * x / denominator, height * y / denominator, height * (1 - t) * z / denominator];
  }

  function schlegelPositions(plan, progress) {
    if (!plan || !Array.isArray(plan.localVertices)) throw new TypeError("A Schlegel plan is required.");
    return plan.localVertices.map(function (point) { return schlegelPosition(point, progress, plan.height); });
  }

  function setText(node, value) {
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }

  function createView(lab, canvas, fallback, mesh, plan) {
    const T = root.THREE;
    if (!canvas || !T) {
      if (fallback) {
        fallback.hidden = false;
        setText(fallback, "The interactive sphere needs WebGL. The counts and proof remain available.");
      }
      return null;
    }

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (_) {
      if (fallback) {
        fallback.hidden = false;
        setText(fallback, "The interactive sphere needs WebGL. The counts and proof remain available.");
      }
      return null;
    }
    if (fallback) fallback.hidden = true;
    if ("outputColorSpace" in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;

    const scene = new T.Scene();
    scene.background = new T.Color(0x10182d);
    const camera = new T.PerspectiveCamera(36, 1, 0.01, 100);
    camera.up.set(0, 1, 0);
    scene.add(new T.HemisphereLight(0xd9f4ff, 0x201b3f, 1.25));
    const keyLight = new T.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 5, 7);
    scene.add(keyLight);
    const rimLight = new T.DirectionalLight(0x65d9ff, 0.55);
    rimLight.position.set(-5, 1, -3);
    scene.add(rimLight);

    const model = new T.Group();
    scene.add(model);
    const activeIndices = [];
    plan.activeFaceIndices.forEach(function (faceIndex) { activeIndices.push.apply(activeIndices, mesh.faces[faceIndex]); });
    const positions = new Float32Array(mesh.vertices.length * 3);
    const surfaceGeometry = new T.BufferGeometry();
    const surfacePosition = new T.BufferAttribute(positions, 3);
    if (surfacePosition.setUsage && T.DynamicDrawUsage) surfacePosition.setUsage(T.DynamicDrawUsage);
    surfaceGeometry.setAttribute("position", surfacePosition);
    surfaceGeometry.setIndex(activeIndices);
    const surface = new T.Mesh(surfaceGeometry, new T.MeshPhongMaterial({
      color: 0x39aeb8,
      emissive: 0x071c2b,
      specular: 0x7899aa,
      shininess: 32,
      side: T.DoubleSide,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    }));
    model.add(surface);

    const removableGeometry = new T.BufferGeometry();
    const removablePosition = new T.BufferAttribute(new Float32Array(9), 3);
    if (removablePosition.setUsage && T.DynamicDrawUsage) removablePosition.setUsage(T.DynamicDrawUsage);
    removableGeometry.setAttribute("position", removablePosition);
    removableGeometry.setIndex([0, 1, 2]);
    const removableFace = new T.Mesh(removableGeometry, new T.MeshPhongMaterial({
      color: 0xffa552,
      emissive: 0x4a1d08,
      specular: 0xffd7a7,
      shininess: 42,
      side: T.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }));
    removableFace.renderOrder = 4;
    model.add(removableFace);

    function lineGeometry(edgePairs) {
      const geometry = new T.BufferGeometry();
      const attribute = new T.BufferAttribute(new Float32Array(edgePairs.length * 6), 3);
      if (attribute.setUsage && T.DynamicDrawUsage) attribute.setUsage(T.DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
      return geometry;
    }
    const tessellationGeometry = lineGeometry(plan.activeEdges);
    const tessellation = new T.LineSegments(tessellationGeometry, new T.LineBasicMaterial({ color: 0xc6edff, transparent: true, opacity: 0.62 }));
    tessellation.renderOrder = 6;
    model.add(tessellation);
    const boundaryGeometry = lineGeometry(plan.boundaryEdges);
    const boundary = new T.LineSegments(boundaryGeometry, new T.LineBasicMaterial({ color: 0xffca68, transparent: true, opacity: 1 }));
    boundary.renderOrder = 8;
    model.add(boundary);

    const nodeGeometry = new T.BufferGeometry();
    const nodePosition = new T.BufferAttribute(new Float32Array(mesh.vertices.length * 3), 3);
    if (nodePosition.setUsage && T.DynamicDrawUsage) nodePosition.setUsage(T.DynamicDrawUsage);
    nodeGeometry.setAttribute("position", nodePosition);
    const nodes = new T.Points(nodeGeometry, new T.PointsMaterial({ color: 0xffe9b1, size: 0.055, sizeAttenuation: true, depthTest: true }));
    nodes.renderOrder = 9;
    model.add(nodes);

    let azimuth = 0.55, elevation = 0.27, distance = 5.1;
    let viewCenter = new T.Vector3(0, 0, -0.4);
    let pointer = null, pending = false, disposed = false;
    const events = [];
    const listen = function (target, name, handler, options) {
      target.addEventListener(name, handler, options);
      events.push([target, name, handler, options]);
    };

    function render() {
      pending = false;
      if (disposed) return;
      const width = canvas.clientWidth || canvas.width || 640;
      const height = canvas.clientHeight || canvas.height || 480;
      renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      const cosElevation = Math.cos(elevation);
      const direction = new T.Vector3(
        cosElevation * Math.sin(azimuth),
        Math.sin(elevation),
        cosElevation * Math.cos(azimuth)
      );
      camera.position.copy(viewCenter).addScaledVector(direction, distance);
      camera.lookAt(viewCenter);
      renderer.render(scene, camera);
    }
    function requestRender() {
      if (!pending && !disposed) {
        pending = true;
        root.requestAnimationFrame(render);
      }
    }
    function writeVertices(attribute, values) {
      const array = attribute.array;
      values.forEach(function (point, index) {
        array[index * 3] = point[0];
        array[index * 3 + 1] = point[1];
        array[index * 3 + 2] = point[2];
      });
      attribute.needsUpdate = true;
    }
    function writeEdges(attribute, pairs, values) {
      const array = attribute.array;
      pairs.forEach(function (pair, edgeIndex) {
        const a = values[pair[0]], b = values[pair[1]], offset = edgeIndex * 6;
        array[offset] = a[0]; array[offset + 1] = a[1]; array[offset + 2] = a[2];
        array[offset + 3] = b[0]; array[offset + 4] = b[1]; array[offset + 5] = b[2];
      });
      attribute.needsUpdate = true;
    }
    function update(progress, removed, showNodes, showTessellation) {
      const values = schlegelPositions(plan, progress);
      writeVertices(surfacePosition, values);
      surfaceGeometry.computeVertexNormals();
      const faceArray = removablePosition.array;
      plan.boundary.forEach(function (vertexIndex, corner) {
        const point = values[vertexIndex], offset = corner * 3;
        faceArray[offset] = point[0]; faceArray[offset + 1] = point[1]; faceArray[offset + 2] = point[2];
      });
      removablePosition.needsUpdate = true;
      removableGeometry.computeVertexNormals();
      writeEdges(tessellationGeometry.getAttribute("position"), plan.activeEdges, values);
      writeEdges(boundaryGeometry.getAttribute("position"), plan.boundaryEdges, values);
      writeVertices(nodePosition, values);
      removableFace.visible = !removed;
      boundary.visible = removed;
      nodes.visible = showNodes;
      tessellation.visible = showTessellation;

      let minimumX = Infinity, maximumX = -Infinity, minimumY = Infinity, maximumY = -Infinity, minimumZ = Infinity, maximumZ = -Infinity;
      values.forEach(function (point) {
        minimumX = Math.min(minimumX, point[0]); maximumX = Math.max(maximumX, point[0]);
        minimumY = Math.min(minimumY, point[1]); maximumY = Math.max(maximumY, point[1]);
        minimumZ = Math.min(minimumZ, point[2]); maximumZ = Math.max(maximumZ, point[2]);
      });
      const width = Math.max(maximumX - minimumX, maximumY - minimumY, 0.001);
      const targetScale = 2.4 / width;
      model.scale.setScalar(clamp(targetScale, 1.15, 5.5));
      viewCenter.set(
        (minimumX + maximumX) * 0.5 * model.scale.x,
        (minimumY + maximumY) * 0.5 * model.scale.y,
        (minimumZ + maximumZ) * 0.5 * model.scale.z
      );
      requestRender();
    }
    function resetCamera() {
      azimuth = 0.55; elevation = 0.27; distance = 5.1; requestRender();
    }

    listen(canvas, "pointerdown", function (event) {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    });
    listen(canvas, "pointermove", function (event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      azimuth -= dx * 0.009;
      elevation = clamp(elevation + dy * 0.009, -1.25, 1.25);
      requestRender();
    });
    listen(canvas, "pointerup", function () { pointer = null; });
    listen(canvas, "pointercancel", function () { pointer = null; });
    listen(canvas, "wheel", function (event) {
      event.preventDefault();
      distance = clamp(distance * Math.exp(event.deltaY * 0.001), 3.1, 9.5);
      requestRender();
    }, { passive: false });
    listen(canvas, "keydown", function (event) {
      if (event.key === "Home") { event.preventDefault(); resetCamera(); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") azimuth += 0.12;
      if (event.key === "ArrowRight") azimuth -= 0.12;
      if (event.key === "ArrowUp") elevation = clamp(elevation + 0.1, -1.25, 1.25);
      if (event.key === "ArrowDown") elevation = clamp(elevation - 0.1, -1.25, 1.25);
      if (event.key === "+" || event.key === "=") distance = clamp(distance * 0.9, 3.1, 9.5);
      if (event.key === "-") distance = clamp(distance * 1.1, 3.1, 9.5);
      requestRender();
    });
    listen(root, "resize", requestRender);
    listen(canvas, "webglcontextlost", function (event) {
      event.preventDefault();
      if (fallback) {
        fallback.hidden = false;
        setText(fallback, "The 3D context was lost. Reload the page to restore the interactive sphere.");
      }
    });
    if (typeof root.ResizeObserver === "function") {
      const observer = new root.ResizeObserver(requestRender);
      observer.observe(canvas);
      events.push([observer, "disconnect"]);
    }

    return {
      update: update,
      resetCamera: resetCamera,
      dispose: function () {
        disposed = true;
        events.forEach(function (entry) {
          if (entry[1] === "disconnect") entry[0].disconnect();
          else entry[0].removeEventListener(entry[1], entry[2], entry[3]);
        });
        [surfaceGeometry, removableGeometry, tessellationGeometry, boundaryGeometry, nodeGeometry].forEach(function (geometry) { geometry.dispose(); });
        [surface.material, removableFace.material, tessellation.material, boundary.material, nodes.material].forEach(function (material) { material.dispose(); });
        renderer.dispose();
      }
    };
  }

  function mount(lab) {
    if (!lab || typeof lab.querySelector !== "function") return null;
    if (mountedLabs && mountedLabs.has(lab)) return mountedLabs.get(lab);

    const canvas = lab.querySelector("[data-sphere-canvas]");
    const fallback = lab.querySelector("[data-sphere-fallback]");
    const progressInput = lab.querySelector("[data-sphere-progress]");
    const progressOutput = lab.querySelector("[data-sphere-progress-output], output[for=\"sphere-progress\"]");
    const removeButtons = Array.from(lab.querySelectorAll('[data-sphere-action="remove"]'));
    const flattenButtons = Array.from(lab.querySelectorAll('[data-sphere-action="flatten"]'));
    const restoreButtons = Array.from(lab.querySelectorAll('[data-sphere-action="restore"]'));
    const pauseButtons = Array.from(lab.querySelectorAll('[data-sphere-action="pause"]'));
    const nodeControl = lab.querySelector('[data-sphere-option="nodes"]');
    const tessellationControl = lab.querySelector('[data-sphere-option="tessellation"]');
    const outputs = {
      V: lab.querySelector("[data-sphere-v]"),
      E: lab.querySelector("[data-sphere-e]"),
      F: lab.querySelector("[data-sphere-f]"),
      chi: lab.querySelector("[data-sphere-chi]")
    };
    const stageLabel = lab.querySelector("[data-sphere-stage-label]");
    const live = lab.querySelector("[data-sphere-live]");
    const mesh = buildIcosphere(1, 1);
    const plan = prepareSchlegel(mesh, 0);
    const view = createView(lab, canvas, fallback, mesh, plan);
    const reducedMotionQuery = typeof root.matchMedia === "function" ? root.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const state = {
      removed: false,
      progress: 0,
      showNodes: nodeControl && "checked" in nodeControl ? nodeControl.checked : true,
      showTessellation: tessellationControl && "checked" in tessellationControl ? tessellationControl.checked : true,
      animationTarget: null,
      animationFrame: 0,
      previousTime: 0,
      paused: false,
      closeWhenReturned: false,
      disposed: false
    };
    const eventRemovers = [];
    function listen(target, name, handler, options) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(name, handler, options);
      eventRemovers.push(function () { target.removeEventListener(name, handler, options); });
    }
    function announce(message) { setText(live, message); }
    function progressRange() {
      if (!progressInput) return { minimum: 0, maximum: 100 };
      const minimum = Number(progressInput.min), maximum = Number(progressInput.max);
      return {
        minimum: Number.isFinite(minimum) ? minimum : 0,
        maximum: Number.isFinite(maximum) && maximum > minimum ? maximum : 100
      };
    }
    function writeProgress() {
      setText(progressOutput, Math.round(state.progress * 100) + "%");
      if (!progressInput) return;
      const range = progressRange();
      progressInput.value = String(range.minimum + state.progress * (range.maximum - range.minimum));
      progressInput.setAttribute("aria-valuetext", Math.round(state.progress * 100) + "% flattened");
    }
    function stage() {
      if (!state.removed) return { key: "closed", label: "Closed triangulated sphere" };
      if (state.progress >= 1 - 1e-7) return { key: "flat", label: "Planar triangulated disk" };
      if (state.progress <= 1e-7) return { key: "open", label: "One triangle removed — punctured sphere" };
      return { key: "flattening", label: "Flattening the punctured sphere — " + Math.round(state.progress * 100) + "%" };
    }
    function updateButtons() {
      removeButtons.forEach(function (button) { button.disabled = state.removed || state.animationTarget != null; });
      flattenButtons.forEach(function (button) {
        button.disabled = !state.removed || state.animationTarget != null || state.progress >= 1 - 1e-7;
      });
      restoreButtons.forEach(function (button) { button.disabled = !state.removed; });
      if (progressInput) progressInput.disabled = !state.removed;
      pauseButtons.forEach(function (button) {
        button.disabled = state.animationTarget == null;
        button.setAttribute("aria-pressed", String(state.paused));
        button.dataset.spherePaused = String(state.paused);
        setText(button, state.paused ? "Continue" : "Pause");
      });
    }
    function renderState() {
      const counts = state.removed ? plan.openCounts : plan.closedCounts;
      setText(outputs.V, counts.V); setText(outputs.E, counts.E); setText(outputs.F, counts.F); setText(outputs.chi, counts.chi);
      const currentStage = stage();
      setText(stageLabel, currentStage.label);
      lab.dataset.sphereState = currentStage.key;
      writeProgress();
      updateButtons();
      if (view) view.update(state.progress, state.removed, state.showNodes, state.showTessellation);
    }
    function cancelAnimation() {
      if (state.animationFrame) root.cancelAnimationFrame(state.animationFrame);
      state.animationFrame = 0;
      state.animationTarget = null;
      state.previousTime = 0;
      state.paused = false;
      state.closeWhenReturned = false;
    }
    function completeAnimation(target) {
      state.progress = target;
      state.animationFrame = 0;
      state.animationTarget = null;
      state.previousTime = 0;
      state.paused = false;
      if (target === 0 && state.closeWhenReturned) {
        state.removed = false;
        state.closeWhenReturned = false;
        announce("The triangle is restored. V = 42, E = 120, F = 80, so the closed sphere has Euler characteristic 2.");
      } else if (target === 1) {
        announce("Flattening complete. The punctured sphere is a planar disk with V = 42, E = 120, F = 79, and Euler characteristic 1.");
      }
      renderState();
    }
    function animationStep(now) {
      if (state.disposed || state.paused || state.animationTarget == null) return;
      if (!state.previousTime) state.previousTime = now;
      const delta = Math.min(64, now - state.previousTime);
      state.previousTime = now;
      const direction = state.animationTarget > state.progress ? 1 : -1;
      state.progress = clamp(state.progress + direction * delta / 3000, 0, 1);
      renderState();
      const finished = direction > 0 ? state.progress >= state.animationTarget : state.progress <= state.animationTarget;
      if (finished) completeAnimation(state.animationTarget);
      else state.animationFrame = root.requestAnimationFrame(animationStep);
    }
    function animateTo(target, closeWhenReturned) {
      if (state.animationFrame) root.cancelAnimationFrame(state.animationFrame);
      state.animationTarget = clamp(target, 0, 1);
      state.closeWhenReturned = Boolean(closeWhenReturned);
      state.paused = false;
      state.previousTime = 0;
      if ((reducedMotionQuery && reducedMotionQuery.matches) || Math.abs(state.animationTarget - state.progress) < 1e-7) {
        completeAnimation(state.animationTarget);
        return;
      }
      renderState();
      state.animationFrame = root.requestAnimationFrame(animationStep);
    }
    function removeTriangle() {
      if (state.removed) return;
      cancelAnimation();
      state.removed = true;
      state.progress = 0;
      announce("One open triangle is removed. The three boundary vertices and three boundary edges remain, so F decreases from 80 to 79. The punctured sphere is ready to flatten.");
      renderState();
    }
    function flattenSphere() {
      if (!state.removed) return;
      animateTo(1, false);
    }
    function restoreSphere() {
      if (!state.removed) return;
      if (state.progress <= 1e-7) {
        cancelAnimation();
        state.removed = false;
        announce("The triangle is restored. V = 42, E = 120, F = 80, so the closed sphere has Euler characteristic 2.");
        renderState();
      } else animateTo(0, true);
    }
    function togglePause() {
      if (state.animationTarget == null) return;
      if (state.paused) {
        state.paused = false;
        state.previousTime = 0;
        announce("Flattening animation continued.");
        state.animationFrame = root.requestAnimationFrame(animationStep);
      } else {
        if (state.animationFrame) root.cancelAnimationFrame(state.animationFrame);
        state.animationFrame = 0;
        state.paused = true;
        announce("Flattening animation paused at " + Math.round(state.progress * 100) + " percent.");
      }
      renderState();
    }

    removeButtons.forEach(function (button) { listen(button, "click", removeTriangle); });
    flattenButtons.forEach(function (button) { listen(button, "click", flattenSphere); });
    restoreButtons.forEach(function (button) { listen(button, "click", restoreSphere); });
    pauseButtons.forEach(function (button) { listen(button, "click", togglePause); });
    if (progressInput) listen(progressInput, "input", function () {
      if (state.animationFrame) root.cancelAnimationFrame(state.animationFrame);
      state.animationFrame = 0; state.animationTarget = null; state.previousTime = 0; state.paused = false; state.closeWhenReturned = false;
      const range = progressRange();
      state.progress = clamp((Number(progressInput.value) - range.minimum) / (range.maximum - range.minimum), 0, 1);
      if (state.progress > 0 || state.removed) state.removed = true;
      renderState();
    });
    function bindOption(control, key) {
      if (!control) return;
      if ("checked" in control) listen(control, "change", function () { state[key] = control.checked; renderState(); });
      else listen(control, "click", function () {
        state[key] = !state[key];
        control.setAttribute("aria-pressed", String(state[key]));
        renderState();
      });
    }
    bindOption(nodeControl, "showNodes");
    bindOption(tessellationControl, "showTessellation");
    listen(root.document, "visibilitychange", function () {
      if (root.document.hidden && state.animationTarget != null && !state.paused) togglePause();
    });

    const controller = {
      mesh: mesh,
      plan: plan,
      state: state,
      remove: removeTriangle,
      flatten: flattenSphere,
      restore: restoreSphere,
      pause: togglePause,
      dispose: function () {
        state.disposed = true;
        cancelAnimation();
        eventRemovers.forEach(function (remove) { remove(); });
        if (view) view.dispose();
        if (mountedLabs) mountedLabs.delete(lab);
      }
    };
    if (mountedLabs) mountedLabs.set(lab, controller);
    renderState();
    return controller;
  }

  function mountAll(scope) {
    const documentRoot = scope && typeof scope.querySelectorAll === "function" ? scope : root.document;
    if (!documentRoot) return [];
    return Array.from(documentRoot.querySelectorAll("[data-sphere-lab]")).map(mount).filter(Boolean);
  }

  return {
    EPSILON: EPSILON,
    edgeKey: edgeKey,
    collectEdges: collectEdges,
    buildIcosphere: buildIcosphere,
    topologyCounts: topologyCounts,
    prepareSchlegel: prepareSchlegel,
    schlegelPosition: schlegelPosition,
    schlegelPositions: schlegelPositions,
    mount: mount,
    mountAll: mountAll
  };
});
