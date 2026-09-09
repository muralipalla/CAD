(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RotationView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DEFAULT_CAMERA = { azimuth: -1.1, elevation: 0.57, zoom: 1 };
  const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function create(canvas, options = {}) {
    const T = root.THREE;
    const unsupported = {
      supported: false, setState() {}, setCamera() {}, getCamera() { return { ...DEFAULT_CAMERA }; },
      zoom() {}, reset() {}, dispose() {}
    };
    if (!T || !canvas) return unsupported;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
    catch (_) { return unsupported; }

    const scene = new T.Scene();
    scene.background = new T.Color(0x10182d);
    const camera = new T.OrthographicCamera(-3, 3, 3, -3, 0.01, 100);
    camera.up.set(0, 0, 1);
    scene.add(new T.AmbientLight(0xc3ddff, 1.05));
    const light = new T.DirectionalLight(0xffffff, 1.5);
    light.position.set(4, -5, 7); scene.add(light);
    const fill = new T.DirectionalLight(0x70bdf5, 0.7);
    fill.position.set(-4, 4, -2); scene.add(fill);

    const aircraft = new T.Group(); aircraft.name = "aircraft";
    const body = new T.Group(); body.name = "body-frame"; body.matrixAutoUpdate = false;
    body.add(aircraft); scene.add(body);
    const worldAxes = new T.Group(); worldAxes.name = "world-axes"; scene.add(worldAxes);
    const bodyAxes = new T.Group(); bodyAxes.name = "body-axes"; body.add(bodyAxes);
    const active = new T.Group(); active.name = "active-axis"; scene.add(active);
    const labels = [], listeners = [];
    const COLORS = { world: 0xa7b3c8, x: 0xff927c, y: 0x68debd, z: 0x8abaff, active: 0xffd166 };
    let cameraState = { ...DEFAULT_CAMERA }, state = { orientation: IDENTITY.slice(), activeAxis: [1, 0, 0], showActiveAxis: false };
    let pending = false, frameId = null, disposed = false, lost = false;
    const vector = point => new T.Vector3(point[0], point[1], point[2]);
    const unit = point => { const length = Math.hypot(...point); return point.map(value => value / length); };
    const priorTouchAction = canvas.style ? canvas.style.touchAction : "";
    if (canvas.style) canvas.style.touchAction = "none";
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;

    function on(name, handler, settings) {
      canvas.addEventListener(name, handler, settings); listeners.push([name, handler, settings]);
    }
    function line(points, color, group, opacity = 1, dashed = false) {
      const geometry = new T.BufferGeometry().setFromPoints(points.map(vector));
      const material = dashed
        ? new T.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.1, gapSize: 0.08 })
        : new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
      const object = new T.Line(geometry, material);
      if (dashed) object.computeLineDistances();
      group.add(object); return object;
    }
    function label(text, anchor, color, frame, priority = 0) {
      const image = root.document.createElement("canvas"), context = image.getContext("2d");
      context.font = "600 28px system-ui, sans-serif";
      image.width = Math.max(42, Math.ceil(context.measureText(text).width) + 18); image.height = 46;
      context.fillStyle = "rgba(16,24,45,.82)"; context.fillRect(0, 0, image.width, image.height);
      context.font = "600 28px system-ui, sans-serif";
      context.textAlign = "center"; context.textBaseline = "middle";
      context.fillStyle = "#" + color.toString(16).padStart(6, "0"); context.fillText(text, image.width / 2, 23);
      const texture = new T.CanvasTexture(image);
      if (T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
      else if (T.sRGBEncoding) texture.encoding = T.sRGBEncoding;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 40;
      sprite.userData = { anchor: vector(anchor), frame, width: image.width / 2, height: 23, priority };
      scene.add(sprite); labels.push(sprite); return sprite;
    }
    function arrow(direction, length, color, group, headLength = 0.17, headWidth = 0.09) {
      const object = new T.ArrowHelper(vector(direction), new T.Vector3(), length, color, headLength, headWidth);
      group.add(object); return object;
    }
    function prism(points, thickness, color) {
      const positions = [], indices = [], count = points.length;
      for (const side of [-0.5, 0.5]) for (const point of points) positions.push(...point.map((value, axis) => value + side * thickness[axis]));
      for (let i = 1; i < count - 1; i++) indices.push(0, i + 1, i, count, count + i, count + i + 1);
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count; indices.push(i, next, count + i, next, count + next, count + i);
      }
      const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, new T.MeshPhongMaterial({ color, shininess: 45, flatShading: true, side: T.DoubleSide }));
      aircraft.add(mesh);
      const outline = new T.LineSegments(new T.EdgesGeometry(geometry, 30), new T.LineBasicMaterial({ color: 0x0c2032, transparent: true, opacity: 0.32 }));
      aircraft.add(outline); return mesh;
    }
    function cylinder(topRadius, bottomRadius, length, center, color, reverse = false) {
      const geometry = new T.CylinderGeometry(topRadius, bottomRadius, length, 10, 1);
      const mesh = new T.Mesh(geometry, new T.MeshPhongMaterial({ color, shininess: 55, flatShading: true }));
      mesh.rotation.z = reverse ? Math.PI / 2 : -Math.PI / 2;
      mesh.position.copy(vector(center)); aircraft.add(mesh); return mesh;
    }

    // A rigid, recognizably directional aircraft: nose +x′, left wing +y′, top +z′.
    cylinder(0.17, 0.12, 2.02, [-0.02, 0, 0], 0xdce9f8);
    cylinder(0, 0.17, 0.58, [1.28, 0, 0], 0xf28b6d);
    cylinder(0.035, 0.12, 0.38, [-1.22, 0, 0], 0xa899e2, true);
    prism([[0.36, 0.08, 0], [-0.34, 1.5, 0], [-0.83, 1.5, 0], [-0.42, 0.08, 0]], [0, 0, 0.07], 0x54c8b4);
    prism([[0.36, -0.08, 0], [-0.34, -1.5, 0], [-0.83, -1.5, 0], [-0.42, -0.08, 0]], [0, 0, 0.07], 0x6c9ece);
    prism([[-0.85, 0.06, 0.03], [-1.06, 0.65, 0.03], [-1.4, 0.65, 0.03], [-1.3, 0.06, 0.03]], [0, 0, 0.05], 0xb9a5ed);
    prism([[-0.85, -0.06, 0.03], [-1.06, -0.65, 0.03], [-1.4, -0.65, 0.03], [-1.3, -0.06, 0.03]], [0, 0, 0.05], 0xb9a5ed);
    prism([[-1.36, 0, 0.04], [-0.82, 0, 0.04], [-1.18, 0, 0.73]], [0, 0.065, 0], 0xc0a7ed);
    const canopy = new T.Mesh(new T.SphereGeometry(1, 14, 8), new T.MeshPhongMaterial({ color: 0xeffcff, emissive: 0x123749, shininess: 95 }));
    canopy.scale.set(0.37, 0.125, 0.11); canopy.position.set(0.48, 0, 0.16); aircraft.add(canopy);
    const topMarker = new T.Mesh(new T.BoxGeometry(0.16, 0.13, 0.02), new T.MeshBasicMaterial({ color: 0xffffff }));
    topMarker.position.set(-0.34, 0, 0.139); aircraft.add(topMarker);

    [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((direction, index) => {
      const positive = direction.map(value => value * 2.7), negative = direction.map(value => value * -2.55);
      line([negative, [0, 0, 0]], COLORS.world, worldAxes, 0.3, true);
      line([[0, 0, 0], positive], COLORS.world, worldAxes, 0.55);
      const tip = new T.ArrowHelper(vector(direction), vector(direction.map(value => value * 2.51)), 0.19, COLORS.world, 0.19, 0.085);
      worldAxes.add(tip); label(["X", "Y", "Z"][index], positive, COLORS.world, null, 1);
      const color = [COLORS.x, COLORS.y, COLORS.z][index];
      const bodyArrow = arrow(direction, 2.03, color, bodyAxes);
      bodyArrow.line.material.depthTest = false; bodyArrow.cone.material.depthTest = false;
      bodyArrow.renderOrder = 15;
      label(["x′", "y′", "z′"][index], direction.map(value => value * 2.03), color, body, 2);
    });
    const origin = new T.Mesh(new T.SphereGeometry(0.037, 12, 8), new T.MeshBasicMaterial({ color: 0xf1f5ff }));
    worldAxes.add(origin);
    const axisLine = line([[-2.85, 0, 0], [2.85, 0, 0]], COLORS.active, active, 0.95, true);
    axisLine.material.depthTest = false; axisLine.renderOrder = 20;
    const axisArrow = arrow([1, 0, 0], 2.85, COLORS.active, active, 0.23, 0.13);
    axisArrow.line.material.depthTest = false; axisArrow.cone.material.depthTest = false;
    axisArrow.renderOrder = 20;
    const axisLabel = label("axis", [2.85, 0, 0], COLORS.active, null, 3);

    function setState(next = {}) {
      if (disposed) return;
      if (next.orientation && next.orientation.length === 9 && Array.from(next.orientation).every(Number.isFinite)) state.orientation = Array.from(next.orientation);
      if (next.activeAxis && next.activeAxis.length === 3 && Array.from(next.activeAxis).every(Number.isFinite) && Math.hypot(...next.activeAxis) > 1e-12) state.activeAxis = unit(Array.from(next.activeAxis));
      if (typeof next.showActiveAxis === "boolean") state.showActiveAxis = next.showActiveAxis;
      const m = state.orientation;
      body.matrix.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
      body.matrixWorldNeedsUpdate = true;
      const direction = state.activeAxis, positions = axisLine.geometry.attributes.position;
      positions.setXYZ(0, ...direction.map(value => -2.85 * value)); positions.setXYZ(1, ...direction.map(value => 2.85 * value));
      positions.needsUpdate = true; axisLine.geometry.computeBoundingSphere(); axisLine.computeLineDistances();
      axisArrow.setDirection(vector(direction)); axisLabel.userData.anchor.copy(vector(direction).multiplyScalar(2.85));
      active.visible = axisLabel.visible = state.showActiveAxis; requestRender();
    }
    function emitCamera() {
      requestRender();
      if (typeof options.onCameraChange === "function") options.onCameraChange(getCamera());
    }
    function setCamera(next = {}) {
      if (disposed) return;
      if (Number.isFinite(next.azimuth)) cameraState.azimuth = next.azimuth;
      if (Number.isFinite(next.elevation)) cameraState.elevation = clamp(next.elevation, -1.45, 1.45);
      if (Number.isFinite(next.zoom)) cameraState.zoom = clamp(next.zoom, 0.45, 4);
      requestRender();
    }
    function getCamera() { return { ...cameraState }; }
    function zoom(factor) {
      if (disposed || !Number.isFinite(factor) || factor <= 0) return;
      cameraState.zoom = clamp(cameraState.zoom / factor, 0.45, 4); emitCamera();
    }
    function reset() { if (!disposed) { cameraState = { ...DEFAULT_CAMERA }; emitCamera(); } }

    function render() {
      pending = false; frameId = null;
      if (disposed || lost || !canvas.clientWidth || !canvas.clientHeight) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const { azimuth, elevation } = cameraState;
      camera.position.set(20 * Math.cos(elevation) * Math.cos(azimuth), 20 * Math.cos(elevation) * Math.sin(azimuth), 20 * Math.sin(elevation));
      camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
      const aspect = width / height, extent = 3.05 * Math.max(1, 1 / aspect) / cameraState.zoom;
      camera.left = -extent * aspect; camera.right = extent * aspect; camera.top = extent; camera.bottom = -extent; camera.updateProjectionMatrix();
      scene.updateMatrixWorld(true);
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), pixelUnit = 2 * extent / height;
      const project = point => [point.dot(right) / pixelUnit, -point.dot(up) / pixelUnit];
      const box = (x, y, w, h) => ({ left: x - w, right: x + w, top: y - h, bottom: y + h });
      const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const visibleLabels = labels.filter(object => object.visible), obstacles = [], placed = [];
      visibleLabels.forEach(object => {
        const data = object.userData;
        data.worldAnchor = data.anchor.clone(); if (data.frame) data.worldAnchor.applyMatrix4(data.frame.matrixWorld);
        const [x, y] = project(data.worldAnchor); obstacles.push(box(x, y, 7, 7));
      });
      visibleLabels.sort((a, b) => b.userData.priority - a.userData.priority).forEach(object => {
        const data = object.userData, [ax, ay] = project(data.worldAnchor), distance = Math.hypot(ax, ay);
        const preferredX = ax + (distance > 1 ? ax / distance * 18 : 16), preferredY = ay + (distance > 1 ? ay / distance * 18 : -18);
        const xLimit = Math.max(0, width / 2 - data.width / 2 - 5), yLimit = Math.max(0, height / 2 - data.height / 2 - 5);
        let best;
        function consider(x, y) {
          x = clamp(x, -xLimit, xLimit); y = clamp(y, -yLimit, yLimit);
          const rectangle = box(x, y, data.width / 2 + 3, data.height / 2 + 3);
          let score = (x - preferredX) ** 2 + (y - preferredY) ** 2;
          for (const prior of placed) score += 350 * overlap(rectangle, prior);
          for (const obstacle of obstacles) score += 30 * overlap(rectangle, obstacle);
          if (!best || score < best.score) best = { x, y, score, rectangle };
        }
        consider(preferredX, preferredY);
        for (const radius of [13, 25, 40, 58, 80]) for (let i = 0; i < 12; i++) consider(preferredX + radius * Math.cos(i * Math.PI / 6), preferredY + radius * Math.sin(i * Math.PI / 6));
        placed.push(best.rectangle);
        object.scale.set(data.width * pixelUnit, data.height * pixelUnit, 1);
        object.position.copy(data.worldAnchor).addScaledVector(right, (best.x - ax) * pixelUnit).addScaledVector(up, -(best.y - ay) * pixelUnit);
      });
      renderer.render(scene, camera);
    }
    function requestRender() { if (!pending && !disposed) { pending = true; frameId = root.requestAnimationFrame(render); } }
    function resize() {
      if (disposed || lost || !canvas.clientWidth || !canvas.clientHeight) return;
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2)); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); requestRender();
    }

    const pointers = new Map(); let pair = [], previousDistance = 0;
    function syncGesture() {
      const touches = [...pointers.keys()].filter(id => pointers.get(id).type === "touch");
      if (touches.length < 2) { pair = []; previousDistance = 0; return; }
      if (pair.length !== 2 || !pair.every(id => touches.includes(id))) pair = touches.slice(0, 2);
      const [a, b] = pair.map(id => pointers.get(id)); previousDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
    on("pointerdown", event => {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      canvas.focus({ preventScroll: true }); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
      canvas.setPointerCapture(event.pointerId); syncGesture();
    });
    on("pointermove", event => {
      const previous = pointers.get(event.pointerId); if (!previous) return;
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
      if (pair.length === 2) {
        if (!pair.includes(event.pointerId)) return;
        const [a, b] = pair.map(id => pointers.get(id)), distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > 0 && previousDistance > 0) zoom(previousDistance / distance);
        previousDistance = distance; return;
      }
      cameraState.azimuth -= dx * 0.008; cameraState.elevation = clamp(cameraState.elevation + dy * 0.008, -1.45, 1.45); emitCamera();
    });
    function stop(event) {
      if (!pointers.delete(event.pointerId)) return;
      syncGesture(); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    on("pointerup", stop); on("pointercancel", stop); on("lostpointercapture", stop);
    on("wheel", event => {
      // Trackpad pinch is Ctrl+wheel: consume it only on the viewer, so it zooms the camera.
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoom(Math.exp(clamp(event.deltaY * scale, -200, 200) * (event.ctrlKey || event.metaKey ? 0.008 : 0.002)));
    }, { passive: false });
    on("keydown", event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "Home"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") return reset();
      if (event.key === "+" || event.key === "=") return zoom(0.85);
      if (event.key === "-") return zoom(1.18);
      if (event.key === "ArrowLeft") cameraState.azimuth -= 0.12;
      if (event.key === "ArrowRight") cameraState.azimuth += 0.12;
      if (event.key === "ArrowUp") cameraState.elevation += 0.1;
      if (event.key === "ArrowDown") cameraState.elevation -= 0.1;
      cameraState.elevation = clamp(cameraState.elevation, -1.45, 1.45); emitCamera();
    });
    on("webglcontextlost", event => { event.preventDefault(); lost = true; });
    on("webglcontextrestored", () => { lost = false; resize(); });
    const observer = new root.ResizeObserver(resize); observer.observe(canvas); setState(state); resize();

    return {
      get supported() { return !disposed && !lost; }, setState, setCamera, getCamera, zoom, reset,
      dispose() {
        if (disposed) return;
        disposed = true; observer.disconnect(); if (frameId !== null && root.cancelAnimationFrame) root.cancelAnimationFrame(frameId);
        listeners.forEach(([name, handler, settings]) => canvas.removeEventListener(name, handler, settings)); pointers.clear();
        if (canvas.style) canvas.style.touchAction = priorTouchAction;
        const geometries = new Set(), materials = new Set(), textures = new Set();
        scene.traverse(object => {
          if (object.geometry) geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach(material => { materials.add(material); if (material.map) textures.add(material.map); });
        });
        textures.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); geometries.forEach(item => item.dispose()); renderer.dispose();
      }
    };
  }
  return { create };
});
