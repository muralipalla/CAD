(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EulerTorusLab = api;

  if (root.document) {
    const start = () => api.mountAll(root.document);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TAU = Math.PI * 2;
  const DEFAULT_WIDTH = 3.6;
  const DEFAULT_LENGTH = 6.8;
  const EPSILON = 1e-7;
  const STAGES = Object.freeze(["rectangle", "cylinder", "torus"]);

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function assertUnit(value, name) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} must be between 0 and 1.`);
    }
  }

  function assertProgress(progress) {
    if (!Number.isFinite(progress) || progress < 0 || progress > 2) {
      throw new RangeError("progress must be between 0 and 2.");
    }
  }

  function assertDimensions(width, length) {
    if (!Number.isFinite(width) || !Number.isFinite(length) || width <= 0 || length <= width) {
      throw new RangeError("length must be greater than the positive width.");
    }
  }

  function smoothstep(value) {
    assertUnit(value, "value");
    return value * value * (3 - 2 * value);
  }

  function sincPi(value) {
    if (!Number.isFinite(value)) throw new RangeError("value must be finite.");
    if (Math.abs(value) < 1e-5) {
      const square = Math.PI * Math.PI * value * value;
      return 1 - square / 6 + square * square / 120;
    }
    return Math.sin(Math.PI * value) / (Math.PI * value);
  }

  function flatPoint(u, v, width = DEFAULT_WIDTH, length = DEFAULT_LENGTH) {
    assertUnit(u, "u");
    assertUnit(v, "v");
    assertDimensions(width, length);
    return [length * (v - 0.5), width * (u - 0.5), 0];
  }

  function rolledPoint(u, v, amount, width = DEFAULT_WIDTH, length = DEFAULT_LENGTH) {
    assertUnit(u, "u");
    assertUnit(v, "v");
    assertUnit(amount, "amount");
    assertDimensions(width, length);
    if (amount < EPSILON) return flatPoint(u, v, width, length);

    const angle = TAU * amount * (u - 0.5);
    const radius = width / (TAU * amount);
    return [
      length * (v - 0.5),
      radius * Math.sin(angle),
      radius * (sincPi(amount) - Math.cos(angle))
    ];
  }

  function cylinderPoint(u, v, width = DEFAULT_WIDTH, length = DEFAULT_LENGTH) {
    return rolledPoint(u, v, 1, width, length);
  }

  function bentPoint(u, v, amount, width = DEFAULT_WIDTH, length = DEFAULT_LENGTH) {
    assertUnit(u, "u");
    assertUnit(v, "v");
    assertUnit(amount, "amount");
    assertDimensions(width, length);

    const minorRadius = width / TAU;
    const crossY = -minorRadius * Math.sin(TAU * u);
    const crossZ = minorRadius * Math.cos(TAU * u);
    if (amount < EPSILON) return [length * (v - 0.5), crossY, crossZ];

    const bendAngle = TAU * amount * (v - 0.5);
    const bendRadius = length / (TAU * amount);
    const centeringShift = bendRadius * (1 - sincPi(amount));
    return [
      bendRadius * Math.sin(bendAngle) - crossY * Math.sin(bendAngle),
      bendRadius * (1 - Math.cos(bendAngle)) - centeringShift + crossY * Math.cos(bendAngle),
      crossZ
    ];
  }

  function torusPoint(u, v, width = DEFAULT_WIDTH, length = DEFAULT_LENGTH) {
    return bentPoint(u, v, 1, width, length);
  }

  function formationPoint(u, v, progress, width = DEFAULT_WIDTH, length = DEFAULT_LENGTH) {
    assertProgress(progress);
    if (progress <= 1) return rolledPoint(u, v, smoothstep(progress), width, length);
    return bentPoint(u, v, smoothstep(progress - 1), width, length);
  }

  function vertexId(i, j) { return `v-${i}-${j}`; }

  function createCellulation() {
    const vertices = [];
    const edges = [];
    const faces = [];

    for (let i = 0; i <= 2; i += 1) {
      for (let j = 0; j <= 2; j += 1) {
        vertices.push({ id: vertexId(i, j), i, j, u: i / 2, v: j / 2 });
      }
    }

    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j <= 2; j += 1) {
        edges.push({
          id: `u-${i}-${j}`,
          kind: "u",
          vertices: [vertexId(i, j), vertexId(i + 1, j)],
          start: [i / 2, j / 2],
          end: [(i + 1) / 2, j / 2]
        });
      }
    }

    for (let i = 0; i <= 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        edges.push({
          id: `v-${i}-${j}`,
          kind: "v",
          vertices: [vertexId(i, j), vertexId(i, j + 1)],
          start: [i / 2, j / 2],
          end: [i / 2, (j + 1) / 2]
        });
      }
    }

    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        edges.push({
          id: `d-${i}-${j}`,
          kind: "diagonal",
          vertices: [vertexId(i, j), vertexId(i + 1, j + 1)],
          start: [i / 2, j / 2],
          end: [(i + 1) / 2, (j + 1) / 2]
        });
        faces.push({
          id: `f-${i}-${j}-0`,
          vertices: [vertexId(i, j), vertexId(i + 1, j), vertexId(i + 1, j + 1)]
        });
        faces.push({
          id: `f-${i}-${j}-1`,
          vertices: [vertexId(i, j), vertexId(i + 1, j + 1), vertexId(i, j + 1)]
        });
      }
    }

    return { vertices, edges, faces };
  }

  class DisjointSet {
    constructor(ids) {
      this.parent = new Map(ids.map(id => [id, id]));
    }
    find(id) {
      const parent = this.parent.get(id);
      if (parent === undefined) throw new RangeError(`Unknown cell: ${id}.`);
      if (parent !== id) this.parent.set(id, this.find(parent));
      return this.parent.get(id);
    }
    union(first, second) {
      const a = this.find(first), b = this.find(second);
      if (a !== b) this.parent.set(b, a);
    }
    count() {
      return new Set(Array.from(this.parent.keys(), id => this.find(id))).size;
    }
  }

  function quotientCounts(stage) {
    if (!STAGES.includes(stage)) throw new RangeError(`Unknown stage: ${stage}.`);
    const cellulation = createCellulation();
    const vertices = new DisjointSet(cellulation.vertices.map(vertex => vertex.id));
    const edges = new DisjointSet(cellulation.edges.map(edge => edge.id));

    if (stage === "cylinder" || stage === "torus") {
      for (let j = 0; j <= 2; j += 1) vertices.union(vertexId(0, j), vertexId(2, j));
      for (let j = 0; j < 2; j += 1) edges.union(`v-0-${j}`, `v-2-${j}`);
    }
    if (stage === "torus") {
      for (let i = 0; i <= 2; i += 1) vertices.union(vertexId(i, 0), vertexId(i, 2));
      for (let i = 0; i < 2; i += 1) edges.union(`u-${i}-0`, `u-${i}-2`);
    }

    const V = vertices.count(), E = edges.count(), F = cellulation.faces.length;
    return { stage, V, E, F, chi: V - E + F };
  }

  function stageForProgress(progress) {
    assertProgress(progress);
    if (progress >= 2 - EPSILON) return "torus";
    if (progress >= 1 - EPSILON) return "cylinder";
    return "rectangle";
  }

  function countsForProgress(progress) {
    return quotientCounts(stageForProgress(progress));
  }

  const BOUNDARY_PAIRS = Object.freeze({
    a: Object.freeze({
      label: "a",
      description: "top and bottom, arrows point left to right",
      color: 0xffa24a,
      sides: Object.freeze([
        Object.freeze({ label: "a₀", fixed: "u", value: 0 }),
        Object.freeze({ label: "a₁", fixed: "u", value: 1 })
      ])
    }),
    b: Object.freeze({
      label: "b",
      description: "left and right, arrows point bottom to top",
      color: 0x4ed7ff,
      sides: Object.freeze([
        Object.freeze({ label: "b₀", fixed: "v", value: 0 }),
        Object.freeze({ label: "b₁", fixed: "v", value: 1 })
      ])
    })
  });

  function boundaryPoint(pairName, sideIndex, parameter, progress, width = DEFAULT_WIDTH, length = DEFAULT_LENGTH) {
    const pair = BOUNDARY_PAIRS[pairName];
    if (!pair) throw new RangeError(`Unknown boundary pair: ${pairName}.`);
    if (sideIndex !== 0 && sideIndex !== 1) throw new RangeError("sideIndex must be 0 or 1.");
    assertUnit(parameter, "parameter");
    const side = pair.sides[sideIndex];
    const u = side.fixed === "u" ? side.value : parameter;
    const v = side.fixed === "v" ? side.value : parameter;
    return formationPoint(u, v, progress, width, length);
  }

  function motionLabel(progress) {
    if (progress <= EPSILON) return "Rectangle · no edges identified";
    if (progress < 1 - EPSILON) return "Rolling the a edges together";
    if (progress <= 1 + EPSILON) return "Cylinder · a₀ ≡ a₁";
    if (progress < 2 - EPSILON) return "Bending the cylinder to join the b edges";
    return "Torus · a₀ ≡ a₁ and b₀ ≡ b₁";
  }

  function createLabelSprite(T, text, color) {
    const bitmap = document.createElement("canvas");
    bitmap.width = 256;
    bitmap.height = 96;
    const context = bitmap.getContext("2d");
    context.clearRect(0, 0, bitmap.width, bitmap.height);
    context.fillStyle = "rgba(8, 16, 38, 0.92)";
    context.strokeStyle = color;
    context.lineWidth = 6;
    context.beginPath();
    context.moveTo(24, 8);
    context.lineTo(232, 8);
    context.quadraticCurveTo(248, 8, 248, 24);
    context.lineTo(248, 72);
    context.quadraticCurveTo(248, 88, 232, 88);
    context.lineTo(24, 88);
    context.quadraticCurveTo(8, 88, 8, 72);
    context.lineTo(8, 24);
    context.quadraticCurveTo(8, 8, 24, 8);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = "#ffffff";
    context.font = "600 34px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 128, 49);

    const map = new T.CanvasTexture(bitmap);
    const material = new T.SpriteMaterial({ map, transparent: true, depthTest: false });
    const sprite = new T.Sprite(material);
    sprite.scale.set(1.08, 0.405, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  function createThreeView(canvas, fallback) {
    const T = window.THREE;
    if (!T) {
      if (fallback) fallback.hidden = false;
      return null;
    }

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch (_) {
      if (fallback) fallback.hidden = false;
      return null;
    }
    if (fallback) fallback.hidden = true;
    if ("outputColorSpace" in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    canvas.style.touchAction = "none";
    if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;

    const scene = new T.Scene();
    scene.background = new T.Color(0x0d1730);
    const camera = new T.PerspectiveCamera(37, 1, 0.01, 100);
    camera.up.set(0, 0, 1);
    scene.add(new T.HemisphereLight(0xdff7ff, 0x221b4b, 1.45));
    const key = new T.DirectionalLight(0xffffff, 1.55);
    key.position.set(5, -4, 8);
    scene.add(key);
    const rim = new T.DirectionalLight(0x68dcff, 0.75);
    rim.position.set(-6, 4, 1);
    scene.add(rim);

    const content = new T.Group();
    const surfaceGroup = new T.Group();
    const tessellationGroup = new T.Group();
    const nodeGroup = new T.Group();
    const identificationGroup = new T.Group();
    content.add(surfaceGroup, tessellationGroup, nodeGroup, identificationGroup);
    scene.add(content);

    const uSegments = 28, vSegments = 56;
    const surfacePositions = new Float32Array((uSegments + 1) * (vSegments + 1) * 3);
    const surfaceIndices = [];
    const surfaceIndex = (i, j) => i * (vSegments + 1) + j;
    for (let i = 0; i < uSegments; i += 1) {
      for (let j = 0; j < vSegments; j += 1) {
        const a = surfaceIndex(i, j), b = surfaceIndex(i + 1, j);
        const c = surfaceIndex(i, j + 1), d = surfaceIndex(i + 1, j + 1);
        surfaceIndices.push(a, b, d, a, d, c);
      }
    }
    const surfaceGeometry = new T.BufferGeometry();
    const surfaceAttribute = new T.BufferAttribute(surfacePositions, 3);
    if (surfaceAttribute.setUsage && T.DynamicDrawUsage) surfaceAttribute.setUsage(T.DynamicDrawUsage);
    surfaceGeometry.setAttribute("position", surfaceAttribute);
    surfaceGeometry.setIndex(surfaceIndices);
    const surfaceMaterial = new T.MeshPhongMaterial({
      color: 0x397ccc,
      emissive: 0x061530,
      specular: 0x8bdcff,
      shininess: 30,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.84
    });
    surfaceGroup.add(new T.Mesh(surfaceGeometry, surfaceMaterial));

    const cellulation = createCellulation();
    const edgeViews = cellulation.edges.map(edge => {
      const samples = 20;
      const positions = new Float32Array((samples + 1) * 3);
      const geometry = new T.BufferGeometry();
      const attribute = new T.BufferAttribute(positions, 3);
      if (attribute.setUsage && T.DynamicDrawUsage) attribute.setUsage(T.DynamicDrawUsage);
      geometry.setAttribute("position", attribute);
      const line = new T.Line(geometry, new T.LineBasicMaterial({
        color: edge.kind === "diagonal" ? 0xf8d58b : 0xe8f4ff,
        transparent: true,
        opacity: edge.kind === "diagonal" ? 0.96 : 0.82,
        depthTest: false
      }));
      line.renderOrder = 8;
      tessellationGroup.add(line);
      return { edge, samples, positions, attribute };
    });

    const nodes = cellulation.vertices.map(vertex => {
      const marker = new T.Mesh(
        new T.SphereGeometry(0.085, 16, 11),
        new T.MeshBasicMaterial({ color: 0xffec82, depthTest: false })
      );
      marker.renderOrder = 12;
      marker.userData.vertexId = vertex.id;
      nodeGroup.add(marker);
      return { vertex, marker };
    });

    const pairViews = [];
    Object.keys(BOUNDARY_PAIRS).forEach(pairName => {
      const pair = BOUNDARY_PAIRS[pairName];
      pair.sides.forEach((side, sideIndex) => {
        const samples = 64;
        const positions = new Float32Array((samples + 1) * 3);
        const geometry = new T.BufferGeometry();
        const attribute = new T.BufferAttribute(positions, 3);
        if (attribute.setUsage && T.DynamicDrawUsage) attribute.setUsage(T.DynamicDrawUsage);
        geometry.setAttribute("position", attribute);
        const line = new T.Line(geometry, new T.LineBasicMaterial({ color: pair.color, depthTest: false }));
        line.renderOrder = 14;
        identificationGroup.add(line);

        const arrow = new T.Mesh(
          new T.ConeGeometry(0.12, 0.31, 18),
          new T.MeshBasicMaterial({ color: pair.color, depthTest: false })
        );
        arrow.renderOrder = 16;
        identificationGroup.add(arrow);
        const label = createLabelSprite(T, side.label, `#${pair.color.toString(16).padStart(6, "0")}`);
        identificationGroup.add(label);
        pairViews.push({ pairName, sideIndex, samples, positions, attribute, arrow, label });
      });
    });

    const joinedLabels = {
      a: createLabelSprite(T, "a₀ ≡ a₁", "#ffa24a"),
      b: createLabelSprite(T, "b₀ ≡ b₁", "#4ed7ff")
    };
    joinedLabels.a.visible = false;
    joinedLabels.b.visible = false;
    identificationGroup.add(joinedLabels.a, joinedLabels.b);

    let azimuth = 0.78, elevation = 0.56, distance = 9.2;
    let pointer = null, disposed = false, resizeObserver = null;
    const events = [];
    const upAxis = new T.Vector3(0, 1, 0);
    const write = (array, index, point) => {
      array[index] = point[0];
      array[index + 1] = point[1];
      array[index + 2] = point[2];
    };
    const vector = point => new T.Vector3(point[0], point[1], point[2]);
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      events.push([target, type, handler, options]);
    };

    function render() {
      if (disposed) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const direction = new T.Vector3(
        Math.cos(elevation) * Math.cos(azimuth),
        Math.cos(elevation) * Math.sin(azimuth),
        Math.sin(elevation)
      );
      camera.position.copy(direction.multiplyScalar(distance));
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }

    function resetView() {
      azimuth = 0.78;
      elevation = 0.56;
      distance = 9.2;
      render();
    }

    function update(progress, options) {
      let offset = 0;
      for (let i = 0; i <= uSegments; i += 1) {
        for (let j = 0; j <= vSegments; j += 1) {
          write(surfacePositions, offset, formationPoint(i / uSegments, j / vSegments, progress));
          offset += 3;
        }
      }
      surfaceAttribute.needsUpdate = true;
      surfaceGeometry.computeVertexNormals();

      edgeViews.forEach(view => {
        for (let sample = 0; sample <= view.samples; sample += 1) {
          const t = sample / view.samples;
          const u = view.edge.start[0] + (view.edge.end[0] - view.edge.start[0]) * t;
          const v = view.edge.start[1] + (view.edge.end[1] - view.edge.start[1]) * t;
          write(view.positions, sample * 3, formationPoint(u, v, progress));
        }
        view.attribute.needsUpdate = true;
      });

      nodes.forEach(({ vertex, marker }) => marker.position.copy(vector(formationPoint(vertex.u, vertex.v, progress))));

      pairViews.forEach(view => {
        for (let sample = 0; sample <= view.samples; sample += 1) {
          write(view.positions, sample * 3, boundaryPoint(view.pairName, view.sideIndex, sample / view.samples, progress));
        }
        view.attribute.needsUpdate = true;
        const before = vector(boundaryPoint(view.pairName, view.sideIndex, 0.47, progress));
        const after = vector(boundaryPoint(view.pairName, view.sideIndex, 0.55, progress));
        const direction = after.clone().sub(before).normalize();
        view.arrow.position.copy(before.clone().lerp(after, 0.5));
        view.arrow.quaternion.setFromUnitVectors(upAxis, direction);
        view.label.position.copy(vector(boundaryPoint(view.pairName, view.sideIndex, view.sideIndex ? 0.7 : 0.3, progress)));
      });

      const aJoined = progress >= 1 - EPSILON;
      const bJoined = progress >= 2 - EPSILON;
      pairViews.forEach(view => {
        const joined = view.pairName === "a" ? aJoined : bJoined;
        view.label.visible = options.labels && !joined;
      });
      joinedLabels.a.visible = options.labels && aJoined;
      joinedLabels.b.visible = options.labels && bJoined;
      joinedLabels.a.position.copy(vector(boundaryPoint("a", 0, 0.3, progress)));
      joinedLabels.b.position.copy(vector(boundaryPoint("b", 0, 0.7, progress)));

      nodeGroup.visible = options.nodes;
      tessellationGroup.visible = options.tessellation;
      const enlargement = 1 + 0.55 * smoothstep(clamp(progress - 1, 0, 1));
      content.scale.setScalar(enlargement);
      render();
    }

    listen(canvas, "pointerdown", event => {
      if (event.button !== undefined && event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    listen(canvas, "pointermove", event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      azimuth -= dx * 0.009;
      elevation = clamp(elevation + dy * 0.009, -1.3, 1.3);
      render();
    });
    const releasePointer = event => {
      if (!pointer || (event.pointerId !== undefined && pointer.id !== event.pointerId)) return;
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      pointer = null;
    };
    listen(canvas, "pointerup", releasePointer);
    listen(canvas, "pointercancel", releasePointer);
    listen(canvas, "wheel", event => {
      event.preventDefault();
      distance = clamp(distance * Math.exp(event.deltaY * 0.001), 4.2, 15);
      render();
    }, { passive: false });
    listen(canvas, "keydown", event => {
      if (event.key === "Home") {
        event.preventDefault();
        resetView();
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") azimuth += 0.12;
      else if (event.key === "ArrowRight") azimuth -= 0.12;
      else if (event.key === "ArrowUp") elevation = clamp(elevation + 0.1, -1.3, 1.3);
      else if (event.key === "ArrowDown") elevation = clamp(elevation - 0.1, -1.3, 1.3);
      else if (event.key === "+" || event.key === "=") distance = Math.max(4.2, distance * 0.9);
      else if (event.key === "-") distance = Math.min(15, distance * 1.1);
      render();
    });
    listen(canvas, "webglcontextlost", event => {
      event.preventDefault();
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "The 3D context was lost. Reload the page to restore the torus construction.";
      }
    });
    listen(window, "resize", render);
    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(render);
      resizeObserver.observe(canvas);
    }

    render();
    return {
      available: true,
      update,
      resetView,
      dispose() {
        if (disposed) return;
        disposed = true;
        events.forEach(([target, type, handler, options]) => target.removeEventListener(type, handler, options));
        if (resizeObserver) resizeObserver.disconnect();
        const geometries = new Set(), materials = new Set(), textures = new Set();
        content.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          if (object.material) {
            const list = Array.isArray(object.material) ? object.material : [object.material];
            list.forEach(material => {
              materials.add(material);
              if (material.map) textures.add(material.map);
            });
          }
        });
        geometries.forEach(geometry => geometry.dispose());
        textures.forEach(texture => texture.dispose());
        materials.forEach(material => material.dispose());
        renderer.dispose();
      }
    };
  }

  function mount(container) {
    if (!container || container.dataset.torusMounted === "true") return null;
    const find = selector => container.querySelector(selector);
    const findAll = selector => Array.from(container.querySelectorAll(selector));
    const canvas = find("[data-torus-canvas]");
    if (!canvas) return null;
    container.dataset.torusMounted = "true";

    const fallback = find("[data-torus-fallback]");
    const slider = find("[data-torus-progress]");
    const progressValue = find("[data-torus-progress-value], #torus-progress-output");
    const playButton = find("[data-torus-play]");
    const resetViewButton = find("[data-torus-reset-view], [data-torus-view-reset]");
    const stageLabel = find("[data-torus-stage-label]");
    const live = find("[data-torus-live]");
    const stageButtons = findAll("[data-torus-stage]");
    const optionInputs = findAll("[data-torus-option]");
    const outputs = {
      V: find("[data-torus-v]"),
      E: find("[data-torus-e]"),
      F: find("[data-torus-f]"),
      chi: find("[data-torus-chi]")
    };
    const events = [];
    const listen = (target, type, handler, options) => {
      if (!target) return;
      target.addEventListener(type, handler, options);
      events.push([target, type, handler, options]);
    };
    const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const view = createThreeView(canvas, fallback);
    let progress = slider ? clamp(Number(slider.value) || 0, 0, 2) : 0;
    let frame = 0, lastTime = 0, playing = false, previousStage = stageForProgress(progress), disposed = false;
    const playLabel = playButton ? (playButton.dataset.playLabel || playButton.textContent.trim() || "Roll rectangle into torus") : "";
    const pauseLabel = playButton ? (playButton.dataset.pauseLabel || "Pause") : "";

    function options() {
      const value = name => {
        const input = optionInputs.find(item => item.dataset.torusOption === name);
        return input ? input.checked : true;
      };
      return { nodes: value("nodes"), tessellation: value("tessellation"), labels: value("labels") };
    }

    function setPlaying(value) {
      playing = value;
      if (playButton) {
        playButton.textContent = playing ? pauseLabel : playLabel;
        playButton.setAttribute("aria-pressed", String(playing));
      }
      if (!playing && frame) cancelAnimationFrame(frame);
      if (!playing) {
        frame = 0;
        lastTime = 0;
      }
    }

    function announce(message) {
      if (live) live.textContent = message;
    }

    function render(shouldAnnounce) {
      const counts = countsForProgress(progress);
      Object.entries(outputs).forEach(([name, node]) => { if (node) node.textContent = counts[name]; });
      const label = motionLabel(progress);
      const shortLabel = progress <= EPSILON ? "Rectangle"
        : progress < 1 - EPSILON ? "Rolling pair a"
          : progress <= 1 + EPSILON ? "Cylinder"
            : progress < 2 - EPSILON ? "Joining pair b" : "Torus";
      if (stageLabel) stageLabel.textContent = shortLabel;
      if (progressValue) progressValue.textContent = `${Math.round(progress * 50)}% · ${label}`;
      if (slider) {
        slider.value = String(progress);
        slider.setAttribute("aria-valuetext", label);
      }
      container.dataset.torusStage = counts.stage;
      stageButtons.forEach(button => {
        const exact = button.dataset.torusStage === counts.stage && (
          (counts.stage === "rectangle" && progress <= EPSILON) ||
          (counts.stage === "cylinder" && Math.abs(progress - 1) <= EPSILON) ||
          (counts.stage === "torus" && progress >= 2 - EPSILON)
        );
        button.setAttribute("aria-pressed", String(exact));
      });
      if (view) view.update(progress, options());

      if (shouldAnnounce || counts.stage !== previousStage) {
        announce(`${label}. V ${counts.V}, E ${counts.E}, F ${counts.F}; Euler characteristic ${counts.chi}.`);
      }
      previousStage = counts.stage;
    }

    function setProgress(value, shouldAnnounce) {
      progress = clamp(Number(value), 0, 2);
      render(Boolean(shouldAnnounce));
    }

    function stop() { setPlaying(false); }

    function animate(time) {
      if (!playing || disposed) return;
      if (!lastTime) lastTime = time;
      const elapsed = Math.min(time - lastTime, 80);
      lastTime = time;
      progress = Math.min(2, progress + elapsed / 3600);
      render(false);
      if (progress >= 2 - EPSILON) {
        progress = 2;
        render(true);
        stop();
        return;
      }
      frame = requestAnimationFrame(animate);
    }

    listen(slider, "input", () => { stop(); setProgress(slider.value, false); });
    listen(slider, "change", () => setProgress(slider.value, true));
    listen(playButton, "click", () => {
      if (playing) { stop(); announce(`Paused. ${motionLabel(progress)}.`); return; }
      if (reducedMotion) {
        setProgress(progress >= 2 - EPSILON ? 0 : 2, true);
        return;
      }
      if (progress >= 2 - EPSILON) setProgress(0, false);
      setPlaying(true);
      announce("Animation started. The a edges join first, then the b edges.");
      frame = requestAnimationFrame(animate);
    });
    listen(resetViewButton, "click", () => { if (view) view.resetView(); });
    stageButtons.forEach(button => listen(button, "click", () => {
      stop();
      const values = { rectangle: 0, cylinder: 1, torus: 2 };
      if (Object.prototype.hasOwnProperty.call(values, button.dataset.torusStage)) {
        setProgress(values[button.dataset.torusStage], true);
      }
    }));
    optionInputs.forEach(input => listen(input, "change", () => render(false)));

    const onPageHide = event => { if (!event.persisted) dispose(); };
    listen(window, "pagehide", onPageHide);

    function dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      events.forEach(([target, type, handler, options]) => target.removeEventListener(type, handler, options));
      if (view) view.dispose();
      delete container.dataset.torusMounted;
    }

    render(false);
    return { setProgress, getProgress: () => progress, dispose, available: Boolean(view) };
  }

  function mountAll(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return [];
    return Array.from(scope.querySelectorAll("[data-torus-lab]"), mount).filter(Boolean);
  }

  return {
    TAU,
    DEFAULT_WIDTH,
    DEFAULT_LENGTH,
    STAGES,
    BOUNDARY_PAIRS,
    clamp,
    smoothstep,
    sincPi,
    flatPoint,
    rolledPoint,
    cylinderPoint,
    bentPoint,
    torusPoint,
    formationPoint,
    createCellulation,
    quotientCounts,
    stageForProgress,
    countsForProgress,
    boundaryPoint,
    motionLabel,
    mount,
    mountAll
  };
});
