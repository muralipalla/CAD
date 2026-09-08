(function () {
  "use strict";

  // One renderer can display either the construction or the orientability walk.
  window.MobiusThree = function (canvas, fallback) {
    const T = window.THREE, M = window.MobiusMath;
    const unavailable = {
      available: false, update() {}, reset() {}, zoom() {}, setView() {}, dispose() {}
    };
    function fail(message) {
      if (fallback) { fallback.hidden = false; if (message) fallback.textContent = message; }
      return unavailable;
    }
    if (!T || !M) return fail();
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
    catch (_) { return fail(); }
    if (fallback) fallback.hidden = true;
    const scene = new T.Scene();
    scene.background = new T.Color(0x10182d);
    const camera = new T.OrthographicCamera(-14, 14, 14, -14, 0.01, 1000);
    scene.add(new T.AmbientLight(0xb7dbff, 1.05));
    const keyLight = new T.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(3, 12, 8); scene.add(keyLight);
    const fillLight = new T.DirectionalLight(0x50c9e8, 0.7);
    fillLight.position.set(-8, -3, -4); scene.add(fillLight);

    const groups = {};
    ["surface", "guides", "boundary", "axes", "moving"].forEach(name => {
      groups[name] = new T.Group(); groups[name].name = name; scene.add(groups[name]);
    });
    const C = {
      surface: 0x43babd, boundary: 0xb8a7f5, ruling: 0x90ffcd,
      selected: 0xffa65e, axes: 0x75df74, normal: 0xffd166,
      reference: 0xb8a0ff, tangentU: 0x8cdbea, tangentV: 0xf6a8d1,
      muted: 0x7187a6, text: 0xe6f1ff
    };
    let state = null, geometryKey = "", motionKey = "", frameFamily = "", frameKey = "";
    let azimuth = 0.87, elevation = 0.61, zoomLevel = 1, viewMode = "orbit";
    let span = 26, bounds, center = new T.Vector3(), lost = false, disposed = false;
    let moving = {}, framePending = false;
    const vector = p => new T.Vector3(p[0], p[1], p[2]);
    const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
    const add = (a, b, scale = 1) => a.map((x, i) => x + scale * b[i]);
    const unit = a => { const length = Math.hypot(...a); return length ? a.map(x => x / length) : [0, 0, 0]; };
    const normalLength = () => 0.24 * (state.distance + state.length / 2);
    const format = value => Number(value.toFixed(2)).toString();
    const events = [];
    function on(name, handler, options) {
      canvas.addEventListener(name, handler, options); events.push([name, handler, options]);
    }
    function clear(group) {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      group.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach(material => {
          materials.add(material); if (material.map) textures.add(material.map);
        });
      });
      geometries.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
      materials.forEach(item => item.dispose()); group.clear();
    }
    function line(points, color, group, options = {}) {
      const geometry = new T.BufferGeometry().setFromPoints(points.map(vector));
      const settings = { color, transparent: (options.opacity || 1) < 1, opacity: options.opacity == null ? 1 : options.opacity };
      const material = options.dashed
        ? new T.LineDashedMaterial({ ...settings, dashSize: span * 0.015, gapSize: span * 0.011 })
        : new T.LineBasicMaterial(settings);
      const object = new T.Line(geometry, material);
      if (options.dashed) object.computeLineDistances();
      group.add(object); return object;
    }
    function label(text, anchor, color, group, offset = [0, -19]) {
      const textureCanvas = document.createElement("canvas");
      const context = textureCanvas.getContext("2d");
      context.font = "600 27px system-ui, sans-serif";
      textureCanvas.width = Math.max(42, Math.ceil(context.measureText(text).width) + 18); textureCanvas.height = 44;
      context.fillStyle = "rgba(16,24,45,.82)"; context.fillRect(0, 0, textureCanvas.width, 44);
      context.font = "600 27px system-ui, sans-serif";
      context.fillStyle = "#" + color.toString(16).padStart(6, "0");
      context.textAlign = "center"; context.textBaseline = "middle";
      context.fillText(text, textureCanvas.width / 2, 22);
      const map = new T.CanvasTexture(textureCanvas);
      if (T.SRGBColorSpace) map.colorSpace = T.SRGBColorSpace;
      else if (T.sRGBEncoding) map.encoding = T.sRGBEncoding;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 30;
      sprite.userData = { label: true, anchor: vector(anchor), width: textureCanvas.width / 2, height: 22, offset };
      group.add(sprite); return sprite;
    }
    function sphere(point, color, group, radius) {
      const object = new T.Mesh(new T.SphereGeometry(radius || span * 0.006, 16, 12), new T.MeshBasicMaterial({ color }));
      object.position.copy(vector(point)); group.add(object); return object;
    }
    function arrow(point, direction, length, color, group) {
      const object = new T.ArrowHelper(vector(unit(direction)), vector(point), length, color, length * 0.19, length * 0.085);
      object.userData.arrowStart = point; object.userData.arrowEnd = add(point, unit(direction), length);
      group.add(object); return object;
    }
    function setArrow(object, point, direction, length) {
      object.position.copy(vector(point)); object.setDirection(vector(unit(direction)));
      object.setLength(length, length * 0.19, length * 0.085);
      object.userData.arrowStart = point; object.userData.arrowEnd = add(point, unit(direction), length);
    }
    function sample(fn, vMax, count = 200) {
      return Array.from({ length: count + 1 }, (_, i) => fn(vMax * i / count));
    }
    function ribbon(stage, vMax) {
      if (stage <= 2 || (stage === 3 && state.twists === 0) || vMax < 1e-7) return;
      const longCount = stage < 4 ? Math.max(2, Math.ceil(vMax / Math.PI * 100)) : Math.max(2, Math.ceil(vMax / Math.PI * 320));
      const widthCount = 12, positions = [], indices = [];
      for (let j = 0; j <= longCount; j++) {
        for (let i = 0; i <= widthCount; i++) positions.push(...M.stagePoint(stage, i / widthCount, vMax * j / longCount, state));
      }
      for (let j = 0; j < longCount; j++) for (let i = 0; i < widthCount; i++) {
        const a = j * (widthCount + 1) + i, b = a + widthCount + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const material = stage < 4
        ? new T.MeshBasicMaterial({ color: C.surface, side: T.DoubleSide, transparent: true, opacity: 0.34, depthWrite: false })
        : new T.MeshPhongMaterial({ color: C.surface, emissive: 0x082b39, shininess: 38, specular: 0x315867, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      groups.surface.add(new T.Mesh(geometry, material));
    }
    function applyFrame(stage, orientation) {
      const family = orientation || stage >= 4 ? "strip" : stage === 2 ? "translation" : stage === 3 ? "disk" : "line";
      const nextFrameKey = `${family}:${state.length}:${state.distance}`;
      if (nextFrameKey === frameKey) return;
      const changedFamily = family !== frameFamily;
      frameFamily = family; frameKey = nextFrameKey;
      if (changedFamily) { zoomLevel = 1; viewMode = "orbit"; }
      const h = state.length / 2, d = state.distance, outer = d + h;
      if (family === "strip") {
        span = 2.4 * outer; center.set(0, 0, 0);
        const vertical = Math.max(h, normalLength());
        bounds = new T.Box3(vector([-1.1 * outer, -1.1 * vertical, -1.1 * outer]), vector([1.1 * outer, 1.25 * vertical, 1.1 * outer]));
        if (changedFamily) { azimuth = 0.87; elevation = 0.61; }
      } else if (family === "translation") {
        span = Math.max(d + 3 * h, 3.5 * h); center.set(d / 2, 0, 0);
        bounds = new T.Box3(vector([-0.8 * h, -1.65 * h, -1.1 * h]), vector([d + 1.8 * h, 1.9 * h, 1.1 * h]));
        if (changedFamily) { azimuth = 1.45; elevation = 0.27; }
      } else {
        const x = family === "disk" ? d : 0;
        span = 3.5 * h; center.set(x, 0, 0);
        bounds = new T.Box3(vector([x - 1.65 * h, -1.65 * h, -0.7 * h]), vector([x + 1.65 * h, 1.65 * h, 1.3 * h]));
        if (changedFamily) { azimuth = 1.26; elevation = 0.27; }
      }
    }
    function buildAxes(stage) {
      clear(groups.axes);
      const final = stage >= 4, h = state.length / 2, d = state.distance, outer = d + h;
      const translated = stage === 3, x = translated ? d : 0;
      const ends = final
        ? [[1.105 * outer, 0, 0], [0, 1.2 * Math.max(h, normalLength()), 0], [0, 0, 1.105 * outer]]
        : [[(stage === 2 ? d : x) + 1.48 * h, 0, 0], [x, 1.5 * h, 0], [x, 0, (translated ? 1.25 : 1.05) * h]];
      const starts = final
        ? [[-1.055 * outer, 0, 0], [0, -Math.max(h, normalLength()) * 0.9, 0], [0, 0, -1.055 * outer]]
        : [[x - 1.35 * h, 0, 0], [x, -1.35 * h, 0], [x, 0, -0.65 * h]];
      ends.forEach((end, i) => {
        line([starts[i], end], C.axes, groups.axes, { opacity: translated && i === 2 ? 0.95 : 0.58 });
        const direction = end.map((x, j) => j === i ? 1 : 0);
        const length = final ? 0.045 * outer : 0.15 * h;
        arrow(add(end, direction, -length), direction, length, C.axes, groups.axes);
        label((translated ? ["x", "y′", "z′"] : ["x", "y", "z"])[i], end, C.axes, groups.axes, [10, -12]);
      });
      sphere([x, 0, 0], C.axes, groups.axes, final ? 0.0064 * outer : 0.025 * h);
      label(translated ? `(${format(d)}, 0, 0)` : "O", [x, 0, 0], C.axes, groups.axes, [-13, 23]);
    }
    function buildStatic(stage, vMax) {
      clear(groups.surface); clear(groups.guides); clear(groups.boundary);
      ribbon(stage, vMax); buildAxes(stage);
      if (stage === 1) return;
      const h = state.length / 2, d = state.distance;
      if (stage === 2) {
        // Translation moves a straight segment; it does not generate a disk.
        line([[0, -h, 0], [0, h, 0]], C.muted, groups.guides, { dashed: true, opacity: 0.6 });
        line([[d, -h, 0], [d, h, 0]], C.muted, groups.guides, { dashed: true, opacity: 0.6 });
        line([[0, 0, 0], [d, 0, 0]], C.reference, groups.guides, { dashed: true, opacity: 0.9 });
        const arrowLength = Math.min(d * 0.2, span * 0.085);
        arrow([d - arrowLength, 0, 0], [1, 0, 0], arrowLength, C.reference, groups.guides);
        label(`+${format(d)} along x`, [d / 2, 0, 0], C.reference, groups.guides, [0, -28]);
        label(`x = ${format(d)}`, [d, -h, 0], C.muted, groups.guides, [0, 29]);
        return;
      }
      if (stage === 3) {
        if (state.twists === 0) {
          // With zero half-turns, the translated ruling remains a straight segment.
          line([M.stagePoint(stage, 0, 0, state), M.stagePoint(stage, 1, 0, state)], C.muted, groups.guides, { dashed: true, opacity: 0.5 });
          return;
        }
        const circle = sample(v => M.stagePoint(stage, 1, v, state), 2 * Math.PI, 120);
        line(circle, C.muted, groups.guides, { dashed: true, opacity: 0.44 });
        const step = Math.PI / 12;
        for (let angle = 0; angle <= vMax + 1e-8; angle += step) {
          line([M.stagePoint(stage, 0, angle, state), M.stagePoint(stage, 1, angle, state)], C.boundary, groups.guides, { opacity: 0.2 });
        }
        [0, 1].forEach(u => line(sample(v => M.stagePoint(stage, u, v, state), vMax, 120), C.boundary, groups.boundary, { opacity: 0.85 }));
        line([[d, -h, 0], [d, h, 0]], C.muted, groups.guides, { dashed: true, opacity: 0.5 });
        return;
      }
      // Odd half-turns exchange the ends; even half-turns preserve each end.
      const edge0 = sample(v => M.surface(0, v, state), vMax, 280);
      const edge1 = sample(v => M.surface(1, v, state), vMax, 280);
      if (Math.abs(vMax - Math.PI) < 1e-7) {
        if (state.twists % 2 === 1) line(edge0.concat(edge1.slice(1)), C.boundary, groups.boundary);
        else { line(edge0, C.boundary, groups.boundary); line(edge1, C.boundary, groups.boundary); }
      }
      else {
        line(edge0, C.boundary, groups.boundary); line(edge1, C.boundary, groups.boundary);
        line([M.surface(0, vMax, state), M.surface(1, vMax, state)], C.boundary, groups.boundary, { opacity: 0.65 });
      }
      line(sample(v => M.surface(0.5, v, state), vMax, 260), C.text, groups.guides, { dashed: true, opacity: 0.35 });
      for (let i = 1; i < 32; i++) {
        const angle = i * Math.PI / 32;
        if (angle > vMax) break;
        line([M.surface(0, angle, state), M.surface(1, angle, state)], C.boundary, groups.guides, { opacity: 0.15 });
      }
      line([M.surface(0, 0, state), M.surface(1, 0, state)], C.reference, groups.guides, { dashed: true, opacity: 0.7 });
      if (state.orientation) {
        const initial = M.orientation(0, state), endpoint = add(initial.point, initial.referenceNormal, normalLength());
        arrow(initial.point, initial.referenceNormal, normalLength(), C.reference, groups.guides);
        const initialLabel = label("n̂₀", endpoint, C.reference, groups.guides, [-18, 23]);
        initialLabel.userData.from = vector(initial.point); initialLabel.userData.priority = 20;
      }
    }
    function buildMoving(stage, orientation) {
      clear(groups.moving); moving = {};
      const h = state.length / 2, outer = state.distance + h;
      const pointRadius = stage >= 4 ? Math.min(0.014 * outer, h * 0.24) : stage === 2 ? Math.min(span * 0.006, h * 0.1) : h * 0.037;
      moving.ruling = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 12), new T.MeshBasicMaterial({ color: C.ruling }));
      moving.ruling.userData.radius = pointRadius * (stage >= 4 ? 0.275 : stage === 2 ? 0.287 : 0.216);
      groups.moving.add(moving.ruling);
      moving.a = sphere([0, 0, 0], C.ruling, groups.moving, pointRadius * 0.8);
      moving.b = sphere([0, 0, 0], C.ruling, groups.moving, pointRadius * 0.8);
      moving.aLabel = label(stage === 1 ? "A · u = 0" : "u = 0", [0, 0, 0], C.ruling, groups.moving, [-22, 23]);
      moving.bLabel = label(stage === 1 ? "B · u = 1" : "u = 1", [0, 0, 0], C.ruling, groups.moving, [22, -23]);
      moving.aLabel.userData.priority = moving.bLabel.userData.priority = 10;
      moving.p = sphere([0, 0, 0], C.selected, groups.moving, pointRadius * 1.1);
      moving.pLabel = label(stage >= 4 ? "P" : stage === 1 ? "L₁(u)" : stage === 2 ? "L₂(u)" : "S(u,v)", [0, 0, 0], C.selected, groups.moving, [0, -34]);
      moving.pLabel.userData.priority = 30;
      if (stage >= 4) {
        moving.normal = arrow([0, 0, 0], [0, 1, 0], normalLength(), C.normal, groups.moving);
        moving.normalLabel = label("n̂", [0, 0, 0], C.normal, groups.moving, [0, 23]);
        moving.ru = arrow([0, 0, 0], [1, 0, 0], normalLength() * 0.78, C.tangentU, groups.moving);
        moving.rv = arrow([0, 0, 0], [0, 0, 1], normalLength(), C.tangentV, groups.moving);
        moving.ruLabel = label("rᵤ", [0, 0, 0], C.tangentU, groups.moving, [23, -20]);
        moving.rvLabel = label("rᵥ", [0, 0, 0], C.tangentV, groups.moving, [-23, -20]);
        [moving.normalLabel, moving.ruLabel, moving.rvLabel].forEach(object => { object.userData.priority = 20; });
      }
    }
    function setAnchor(sprite, anchor) { sprite.userData.anchor.copy(vector(anchor)); }
    function updateMotion(stage, orientation) {
      const v = orientation ? state.laps * Math.PI : state.v;
      const u = orientation ? 0.5 : state.u;
      const a = M.stagePoint(stage, 0, v, state), b = M.stagePoint(stage, 1, v, state), p = M.stagePoint(stage, u, v, state);
      const rulingDirection = vector(b).sub(vector(a));
      moving.ruling.position.copy(vector(a).add(vector(b)).multiplyScalar(0.5));
      moving.ruling.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), rulingDirection.clone().normalize());
      moving.ruling.scale.set(moving.ruling.userData.radius, rulingDirection.length(), moving.ruling.userData.radius);
      moving.a.position.copy(vector(a)); moving.b.position.copy(vector(b));
      moving.p.position.copy(vector(p)); setAnchor(moving.aLabel, a); setAnchor(moving.bLabel, b); setAnchor(moving.pLabel, p);
      moving.aLabel.visible = moving.bLabel.visible = !orientation && !(stage >= 4 && state.showNormal);
      moving.aLabel.userData.from = moving.bLabel.userData.from = vector(add(a, b).map(component => component / 2));
      if (stage < 4) return;
      const derivatives = M.derivatives(u, v, state), length = normalLength();
      const normal = unit(orientation ? M.orientation(state.laps, state).normal : derivatives.unitNormal || derivatives.normal);
      setArrow(moving.normal, p, normal, length); setAnchor(moving.normalLabel, add(p, normal, length));
      moving.normalLabel.userData.from = vector(p);
      const showNormal = orientation || state.showNormal;
      moving.normal.visible = moving.normalLabel.visible = showNormal;
      const tangentU = unit(derivatives.ru), tangentV = unit(derivatives.rv);
      setArrow(moving.ru, p, tangentU, length * 0.78); setArrow(moving.rv, p, tangentV, length);
      setAnchor(moving.ruLabel, add(p, tangentU, length * 0.78)); setAnchor(moving.rvLabel, add(p, tangentV, length));
      moving.ruLabel.userData.from = moving.rvLabel.userData.from = vector(p);
      [moving.ru, moving.rv, moving.ruLabel, moving.rvLabel].forEach(object => { object.visible = Boolean(state.showNormal) && !orientation; });
    }
    function update(next) {
      if (disposed) return;
      state = {
        stage: 4, u: 0.5, v: Math.PI / 2, fullSurface: true, showNormal: false,
        showAxes: true, showBoundary: true, showMarkers: true, orientation: false, laps: 0,
        length: 2, distance: 10, translation: 1, twists: 1, ...state, ...next
      };
      state.stage = clamp(Math.round(state.stage), 1, 5); state.u = clamp(state.u, 0, 1);
      state.v = clamp(state.v, 0, Math.PI); state.laps = clamp(state.laps, 0, 2);
      state.length = clamp(Number.isFinite(state.length) ? state.length : 2, 0.5, 12);
      state.distance = clamp(Number.isFinite(state.distance) ? state.distance : 10, state.length / 2 + 0.25, 20);
      state.translation = clamp(Number.isFinite(state.translation) ? state.translation : 1, 0, 1);
      state.twists = clamp(Number.isFinite(state.twists) ? Math.round(state.twists) : 1, 0, 3);
      const orientation = Boolean(state.orientation), stage = orientation ? 4 : state.stage;
      const vMax = orientation || state.fullSurface ? Math.PI : state.v;
      applyFrame(stage, orientation);
      const dimensions = `${state.length}:${state.distance}:${state.twists}`;
      const nextGeometryKey = `${stage === 5 ? 4 : stage}:${stage <= 2 ? 0 : vMax.toFixed(7)}:${orientation}:${dimensions}`;
      if (nextGeometryKey !== geometryKey) { buildStatic(stage, vMax); geometryKey = nextGeometryKey; }
      const nextMotionKey = `${stage}:${orientation}:${dimensions}`;
      if (nextMotionKey !== motionKey) { buildMoving(stage, orientation); motionKey = nextMotionKey; }
      groups.axes.visible = Boolean(state.showAxes); groups.boundary.visible = Boolean(state.showBoundary);
      groups.moving.visible = orientation || Boolean(state.showMarkers);
      updateMotion(stage, orientation); requestRender();
    }
    function render() {
      framePending = false;
      if (!state || lost || disposed) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const direction = viewMode === "y" ? new T.Vector3(0, 1, 0)
        : viewMode === "z" ? new T.Vector3(0, 0, 1)
        : viewMode === "x" ? new T.Vector3(1, 0, 0)
        : new T.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth));
      camera.up.set(0, viewMode === "y" ? 0 : 1, viewMode === "y" ? -1 : 0);
      camera.position.copy(center).addScaledVector(direction, span * 4);
      camera.lookAt(center); camera.updateMatrixWorld();
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let halfWidth = 0, halfHeight = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = vector([x, y, z]).sub(center);
        halfWidth = Math.max(halfWidth, Math.abs(point.dot(right))); halfHeight = Math.max(halfHeight, Math.abs(point.dot(up)));
      }
      const aspect = width / height, extent = Math.max(halfHeight, halfWidth / aspect, 0.5) * 1.06 / zoomLevel;
      camera.left = -extent * aspect; camera.right = extent * aspect; camera.top = extent; camera.bottom = -extent;
      camera.far = span * 10; camera.updateProjectionMatrix();
      const pixelUnit = extent * 2 / height;
      const labels = [], obstacles = [], placed = [];
      const project = point => {
        const relative = point.clone().sub(center);
        return [relative.dot(right) / pixelUnit, -relative.dot(up) / pixelUnit];
      };
      const visible = object => {
        for (let item = object; item; item = item.parent) if (!item.visible) return false;
        return true;
      };
      const box = (x, y, halfWidth, halfHeight) => ({ left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight });
      const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      scene.traverse(object => {
        const data = object.userData;
        if (!visible(object)) return;
        if (data.arrowStart) {
          // Reserve arrowheads and small samples along shafts so labels do not hide direction.
          for (let i = 0; i <= 7; i++) {
            const point = data.arrowStart.map((value, axis) => value + (data.arrowEnd[axis] - value) * i / 7);
            const [x, y] = project(vector(point)); obstacles.push(box(x, y, i === 7 ? 7 : 3, i === 7 ? 7 : 3));
          }
        }
        if (!data.label) return;
        labels.push(object);
        const [x, y] = project(data.anchor); obstacles.push(box(x, y, 5, 5));
      });
      [moving.a, moving.b, moving.p].filter(object => object && visible(object)).forEach(object => {
        const [x, y] = project(object.position); obstacles.push(box(x, y, 7, 7));
      });
      labels.sort((a, b) => (b.userData.priority || 0) - (a.userData.priority || 0));
      labels.forEach(object => {
        const data = object.userData, [anchorX, anchorY] = project(data.anchor);
        let [offsetX, offsetY] = data.offset;
        if (data.from) {
          const [fromX, fromY] = project(data.from), dx = anchorX - fromX, dy = anchorY - fromY, length = Math.hypot(dx, dy);
          if (length > 1) { offsetX = 24 * dx / length; offsetY = 24 * dy / length; }
        }
        const preferredX = anchorX + offsetX, preferredY = anchorY + offsetY;
        const xLimit = Math.max(0, width / 2 - data.width / 2 - 6), yLimit = Math.max(0, height / 2 - data.height / 2 - 6);
        let best = null;
        function consider(x, y) {
          x = clamp(x, -xLimit, xLimit); y = clamp(y, -yLimit, yLimit);
          const rectangle = box(x, y, data.width / 2 + 3, data.height / 2 + 3);
          let score = (x - preferredX) ** 2 + (y - preferredY) ** 2;
          for (const other of placed) score += overlap(rectangle, other) * 300;
          for (const other of obstacles) score += overlap(rectangle, other) * 35;
          if (!best || score < best.score) best = { x, y, score, rectangle };
        }
        consider(preferredX, preferredY);
        for (const radius of [12, 24, 38, 54, 72, 96]) {
          for (let i = 0; i < 12; i++) {
            const angle = i * Math.PI / 6;
            consider(preferredX + radius * Math.cos(angle), preferredY + radius * Math.sin(angle));
          }
        }
        placed.push(best.rectangle);
        object.scale.set(data.width * pixelUnit, data.height * pixelUnit, 1);
        object.position.copy(data.anchor).addScaledVector(right, (best.x - anchorX) * pixelUnit).addScaledVector(up, -(best.y - anchorY) * pixelUnit);
      });
      renderer.render(scene, camera);
    }
    function requestRender() {
      if (framePending || disposed) return;
      framePending = true; window.requestAnimationFrame(render);
    }
    function resize() {
      if (lost || disposed || !canvas.clientWidth || !canvas.clientHeight) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); requestRender();
    }
    function setView(name) {
      viewMode = ["x", "y", "z"].includes(name) ? name : "orbit"; zoomLevel = 1;
      if (viewMode === "orbit") {
        azimuth = frameFamily === "strip" ? 0.87 : frameFamily === "translation" ? 1.45 : 1.26;
        elevation = frameFamily === "strip" ? 0.61 : 0.27;
      }
      requestRender();
    }
    function changeZoom(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      zoomLevel = clamp(zoomLevel / factor, 0.45, 5); requestRender();
    }
    const pointers = new Map();
    let pair = [], lastDistance = 0;
    function syncGesture() {
      const touches = [...pointers.keys()].filter(id => pointers.get(id).type === "touch");
      if (touches.length >= 2) {
        if (pair.length !== 2 || !pair.every(id => touches.includes(id))) pair = touches.slice(0, 2);
        const [a, b] = pair.map(id => pointers.get(id)); lastDistance = Math.hypot(a.x - b.x, a.y - b.y);
      } else { pair = []; lastDistance = 0; }
    }
    on("pointerdown", event => {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
      canvas.setPointerCapture(event.pointerId); syncGesture();
    });
    on("pointermove", event => {
      const previous = pointers.get(event.pointerId); if (!previous) return;
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
      if (pair.length === 2) {
        if (!pair.includes(event.pointerId)) return;
        const [a, b] = pair.map(id => pointers.get(id)), distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDistance > 0 && distance > 0) changeZoom(lastDistance / distance);
        lastDistance = distance; return;
      }
      viewMode = "orbit"; azimuth -= dx * 0.008; elevation = clamp(elevation + dy * 0.008, -1.45, 1.45); requestRender();
    });
    function stop(event) {
      if (!pointers.delete(event.pointerId)) return;
      syncGesture(); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    on("pointerup", stop); on("pointercancel", stop); on("lostpointercapture", stop);
    on("wheel", event => {
      // Trackpad pinches arrive as Ctrl+wheel. Every wheel gesture over this
      // canvas zooms the model; browser gestures outside it and keyboard zoom stay native.
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      const sensitivity = event.ctrlKey || event.metaKey ? 0.008 : 0.002;
      changeZoom(Math.exp(clamp(event.deltaY * multiplier, -200, 200) * sensitivity));
    }, { passive: false });
    on("keydown", event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") return setView("orbit");
      if (["+", "="].includes(event.key)) return changeZoom(0.85);
      if (event.key === "-") return changeZoom(1.18);
      viewMode = "orbit";
      if (event.key === "ArrowLeft") azimuth -= 0.12;
      if (event.key === "ArrowRight") azimuth += 0.12;
      if (event.key === "ArrowUp") elevation += 0.1;
      if (event.key === "ArrowDown") elevation -= 0.1;
      elevation = clamp(elevation, -1.45, 1.45); requestRender();
    });
    on("webglcontextlost", event => {
      event.preventDefault(); lost = true;
      fail("The 3D graphics connection was interrupted. Reload to restore it; the algorithm and equations remain available.");
    });
    on("webglcontextrestored", () => { lost = false; if (fallback) fallback.hidden = true; resize(); });
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    return {
      available: true, update, reset() { setView("orbit"); }, zoom: changeZoom, setView,
      dispose() {
        disposed = true; observer.disconnect();
        events.forEach(([name, handler, options]) => canvas.removeEventListener(name, handler, options));
        pointers.clear(); Object.values(groups).forEach(clear); renderer.dispose();
      }
    };
  };
})();
