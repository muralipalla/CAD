(function () {
  "use strict";
  window.RationalBezierThree = function (canvas, fallback) {
    if (!window.THREE) { fallback.hidden = false; return null; }
    const T = window.THREE, M = window.RationalBezierMath;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
    catch (_) { fallback.hidden = false; return null; }
    const scene = new T.Scene();
    scene.background = new T.Color(0x171541);
    const camera = new T.OrthographicCamera(-5, 5, 5, -5, 0.01, 1000);
    camera.up.set(0, 0, 1);
    const groups = {};
    ["base", "cone", "plane", "controls", "rays", "axes", "moving"].forEach(name => {
      groups[name] = new T.Group(); groups[name].name = name; scene.add(groups[name]);
    });
    const colors = { parabola: 0xffd166, arc: 0x76dcc1, control: 0xb8a7f5, ink: 0xeae8ff };
    let model, samples, azimuth = -1.12, elevation = 0.56, zoom = 1, lost = false, viewMode = "orbit";
    let bounds, center = new T.Vector3(), span = 5, currentU = 0.5;
    const visibility = { cone: true, plane: true, controls: true, rays: false, axes: true };
    let showLabels = false;
    const vector = p => new T.Vector3(...p);
    function clear(group) {
      group.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach(material => { if (material.map) material.map.dispose(); material.dispose(); });
      });
      group.clear();
    }
    function line(points, color, group, dashed = false, opacity = 1) {
      const geometry = new T.BufferGeometry().setFromPoints(points.map(vector));
      const material = dashed
        ? new T.LineDashedMaterial({ color, dashSize: span * 0.015, gapSize: span * 0.01, transparent: opacity < 1, opacity })
        : new T.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
      const object = new T.Line(geometry, material);
      if (dashed) object.computeLineDistances();
      group.add(object); return object;
    }
    function curve(points, color, group) {
      if (points.length < 2) return;
      const path = new T.CatmullRomCurve3(points.map(vector));
      const mesh = new T.Mesh(new T.TubeGeometry(path, points.length - 1, span * 0.0027, 7, false), new T.MeshBasicMaterial({ color }));
      group.add(mesh);
    }
    function label(text, point, color, group, offset = [10, -20], pointLabel = false) {
      const image = document.createElement("canvas");
      image.width = Math.max(96, text.length * 19 + 20); image.height = 50;
      const context = image.getContext("2d");
      context.fillStyle = "rgba(23,21,65,.85)"; context.fillRect(0, 0, image.width, image.height);
      context.font = "600 30px system-ui, sans-serif"; context.fillStyle = "#" + color.toString(16).padStart(6, "0");
      context.textBaseline = "middle"; context.fillText(text, 9, 25);
      const texture = new T.CanvasTexture(image);
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 20;
      sprite.userData = { label: true, pointLabel, anchor: vector(point), width: image.width / 2, height: 25, offset };
      group.add(sprite); return sprite;
    }
    function point(p, color, group, text, offset) {
      const mesh = new T.Mesh(new T.SphereGeometry(span * 0.007, 14, 10), new T.MeshBasicMaterial({ color }));
      mesh.position.copy(vector(p)); group.add(mesh);
      if (text) label(text, p, color, group, offset, true);
      return mesh;
    }
    function patch(vertices, color, opacity, group) {
      const positions = [0, 1, 2, 0, 2, 3].flatMap(i => vertices[i]);
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      group.add(new T.Mesh(geometry, new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false })));
    }
    function update(next, u) {
      model = next; currentU = u; samples = M.sample(model);
      Object.values(groups).forEach(clear);
      const r = model.radius, c = model.c, s = model.s, k = 2 * model.a * model.a;
      // Frame the circle and lifted space only. Projected controls may leave this frame.
      span = Math.max(2.7 * r, 2.75);
      const limits = [[-1.35 * r, -1.35 * r, -1.2], [1.35 * r, 1.35 * r, 1.55]];
      bounds = new T.Box3(vector(limits[0]), vector(limits[1])); bounds.getCenter(center);
      const circle = Array.from({ length: 181 }, (_, i) => [r * Math.cos(i * Math.PI / 90), r * Math.sin(i * Math.PI / 90), 1]);
      line(circle, 0xa6a3c6, groups.base);
      point([0, 0, 0], colors.ink, groups.base, "O", [-16, 18]);
      label("C · w = 1", [-0.8 * r, 0.7 * r, 1], 0xc9c6e4, groups.base, [-10, -22]);
      const positions = [];
      for (let i = 0; i < 120; i++) {
        const a = i * Math.PI / 60, b = (i + 1) * Math.PI / 60;
        positions.push(0, 0, 0, r * Math.cos(a), r * Math.sin(a), 1, r * Math.cos(b), r * Math.sin(b), 1);
      }
      const coneGeometry = new T.BufferGeometry();
      coneGeometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      groups.cone.add(new T.Mesh(coneGeometry, new T.MeshBasicMaterial({ color: 0x8ac7ff, transparent: true, opacity: 0.14, side: T.DoubleSide, depthWrite: false })));
      const disk = new T.Mesh(new T.CircleGeometry(r, 96), new T.MeshBasicMaterial({ color: 0x8898b4, transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false }));
      disk.position.z = 1; groups.cone.add(disk);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        line([[0, 0, 0], [r * Math.cos(angle), r * Math.sin(angle), 1]], 0x8b99b0, groups.cone, false, 0.4);
      }
      const yLimit = r * Math.max(s * 1.16, 0.14), wLow = c - 0.08, wHigh = 1.13;
      const planeCorners = [[r * (k - wLow), -yLimit, wLow], [r * (k - wLow), yLimit, wLow], [r * (k - wHigh), yLimit, wHigh], [r * (k - wHigh), -yLimit, wHigh]];
      patch(planeCorners, 0xb8a7f5, 0.13, groups.plane);
      line([...planeCorners, planeCorners[0]], 0xb8a7f5, groups.plane, false, 0.65);
      line([[0, 0, 0], [-r, 0, 1]], colors.control, groups.plane, true);
      label("PL", planeCorners[1], colors.control, groups.plane);
      label("(−r, 0, 1)", [-r, 0, 1], colors.control, groups.plane, [-5, 20], true);
      if (model.degrees === 180) line(samples.curve, colors.parabola, groups.base);
      else curve(samples.curve, colors.parabola, groups.base);
      curve(samples.arc, colors.arc, groups.base);
      point(model.controls[0], colors.ink, groups.base, "P₀ = p₀", [-25, 23]);
      point(model.controls[2], colors.ink, groups.base, "P₂ = p₂", [0, -25]);
      point(model.vertex, colors.parabola, groups.base, "Q", [-24, 5]);
      line(model.controls, colors.control, groups.controls, true);
      point(model.controls[1], colors.control, groups.controls, "P₁", [-10, 23]);
      if (model.projected[1]) {
        line(model.projected, colors.arc, groups.controls, true);
        point(model.projected[1], colors.arc, groups.controls, "p₁", [12, -20]);
        // With a negative weight, projection extends the line through O backwards.
        line([c < 0 ? model.controls[1] : [0, 0, 0], model.projected[1]], colors.control, groups.rays, true);
      } else {
        for (const p of [model.projected[0], model.projected[2]]) line([p, [4 * r, p[1], 1]], colors.arc, groups.controls, true);
        line([[0, 0, 0], [2 * r, 0, 0]], colors.control, groups.rays, true);
      }
      const axisEnds = [[1.27 * r, 0, 0], [0, 1.27 * r, 0], [0, 0, 1.45]];
      const axisStarts = [[-1.25 * r, 0, 0], [0, -1.25 * r, 0], [0, 0, -1.1]];
      axisEnds.forEach((end, i) => { line([axisStarts[i], end], colors.ink, groups.axes, false, 0.6); label(["x", "y", "w"][i], end, colors.ink, groups.axes, [8, -12]); });
      Object.keys(visibility).forEach(name => { groups[name].visible = visibility[name]; });
      updateParameter(u);
    }
    function updateParameter(u) {
      if (!model) return;
      currentU = u; clear(groups.moving);
      const h = M.lifted(model, u), p = M.rational(model, u);
      if (p) {
        const ray = line([[0, 0, 0], p], colors.arc, groups.moving);
        ray.visible = visibility.rays;
        point(p, colors.arc, groups.moving, "r(u)", [20, -22]);
      }
      point(h, colors.parabola, groups.moving, "H(u)", [20, 22]);
      render();
    }
    function render() {
      if (!model || lost) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const direction = viewMode === "y" ? new T.Vector3(0, -1, 0) : new T.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation));
      camera.up.set(0, 0, 1);
      camera.position.copy(center).addScaledVector(direction, span * 5);
      camera.lookAt(center); camera.updateMatrixWorld();
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let halfWidth = 0, halfHeight = 0;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const relative = new T.Vector3(x, y, z).sub(center);
        halfWidth = Math.max(halfWidth, Math.abs(relative.dot(right)));
        halfHeight = Math.max(halfHeight, Math.abs(relative.dot(up)));
      }
      const aspect = width / height;
      const extent = Math.max(halfHeight, halfWidth / aspect) * 1.14 / zoom;
      camera.left = -extent * aspect; camera.right = extent * aspect; camera.top = extent; camera.bottom = -extent;
      camera.far = span * 12; camera.updateProjectionMatrix();
      const unit = extent * 2 / height;
      scene.traverse(object => {
        const data = object.userData;
        if (!data.label) return;
        object.scale.set(data.width * unit, data.height * unit, 1);
        object.position.copy(data.anchor).addScaledVector(right, data.offset[0] * unit).addScaledVector(up, -data.offset[1] * unit);
        const anchorRelative = data.anchor.clone().sub(center);
        object.visible = (!data.pointLabel || showLabels) && Math.abs(anchorRelative.dot(right)) < extent * aspect && Math.abs(anchorRelative.dot(up)) < extent;
        const relative = object.position.clone().sub(center);
        const x = relative.dot(right), y = relative.dot(up);
        const xLimit = Math.max(0, extent * aspect - (data.width / 2 + 4) * unit);
        const yLimit = Math.max(0, extent - (data.height / 2 + 4) * unit);
        object.position.addScaledVector(right, M.clamp(x, -xLimit, xLimit) - x).addScaledVector(up, M.clamp(y, -yLimit, yLimit) - y);
      });
      renderer.render(scene, camera);
    }
    function resize() {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height || lost) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(width, height, false); render();
    }
    function setView(view) {
      viewMode = view;
      azimuth = -Math.PI / 2; elevation = 0; zoom = 1;
      if (view === "orbit") { azimuth = -1.12; elevation = 0.56; }
      render();
    }
    function changeZoom(factor) { zoom = M.clamp(zoom / factor, 0.45, 4); render(); }
    const pointers = new Map();
    let pair = [], lastDistance = 0;
    function syncGesture() {
      const touches = [...pointers.keys()].filter(id => pointers.get(id).type === "touch");
      if (touches.length >= 2) {
        if (pair.length !== 2 || !pair.every(id => touches.includes(id))) pair = touches.slice(0, 2);
        const [a, b] = pair.map(id => pointers.get(id));
        lastDistance = Math.hypot(a.x - b.x, a.y - b.y);
      } else { pair = []; lastDistance = 0; }
    }
    canvas.addEventListener("pointerdown", event => {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
      canvas.setPointerCapture(event.pointerId); syncGesture();
    });
    canvas.addEventListener("pointermove", event => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY });
      if (pair.length === 2) {
        if (!pair.includes(event.pointerId)) return;
        const [a, b] = pair.map(id => pointers.get(id));
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDistance > 0 && distance > 0) changeZoom(lastDistance / distance);
        lastDistance = distance; return;
      }
      viewMode = "orbit";
      azimuth -= dx * 0.008;
      elevation = M.clamp(elevation + dy * 0.008, -1.4, 1.4); render();
    });
    function stop(event) {
      if (!pointers.delete(event.pointerId)) return;
      syncGesture();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    canvas.addEventListener("pointerup", stop); canvas.addEventListener("pointercancel", stop); canvas.addEventListener("lostpointercapture", stop);
    canvas.addEventListener("wheel", event => {
      // Trackpad pinches arrive as ctrl+wheel. Cancel page zoom only over this canvas.
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      changeZoom(Math.exp(M.clamp(event.deltaY * unit, -200, 200) * (event.ctrlKey ? 0.008 : 0.002)));
    }, { passive: false });
    canvas.addEventListener("keydown", event => {
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
      elevation = M.clamp(elevation, -1.4, 1.4); render();
    });
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); lost = true; fallback.textContent = "The 3D graphics connection was interrupted. Reload to restore it. The other view and derivation still work."; fallback.hidden = false; });
    canvas.addEventListener("webglcontextrestored", () => { lost = false; fallback.hidden = true; resize(); });
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    return { update, updateParameter, setView, zoom: changeZoom,
      setLabels(shown) { showLabels = shown; render(); },
      setLayer(name, shown) { if (!(name in visibility)) return; visibility[name] = shown; groups[name].visible = shown; if (name === "rays") updateParameter(currentU); else render(); },
      dispose() { observer.disconnect(); Object.values(groups).forEach(clear); renderer.dispose(); }
    };
  };
})();
