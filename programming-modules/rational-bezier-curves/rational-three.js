(function () {
  "use strict";
  window.RationalBezierThree = function (canvas, fallback) {
    if (!window.THREE) { fallback.hidden = false; return null; }
    const T = window.THREE, M = window.RationalBezierMath;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
    catch (_) { fallback.hidden = false; return null; }
    const scene = new T.Scene();
    scene.background = new T.Color(0xf8f7fd);
    const camera = new T.OrthographicCamera(-5, 5, 5, -5, 0.01, 1000);
    camera.up.set(0, 0, 1);
    const groups = {};
    ["base", "cone", "plane", "controls", "rays", "axes", "moving"].forEach(name => {
      groups[name] = new T.Group(); groups[name].name = name; scene.add(groups[name]);
    });
    const colors = { parabola: 0xa05d0b, arc: 0x147d72, control: 0x754ab5, ink: 0x292568 };
    let model, samples, azimuth = -1.12, elevation = 0.56, zoom = 1, lost = false, viewMode = "orbit";
    let bounds, center = new T.Vector3(), span = 5, currentU = 0.5;
    const visibility = { cone: true, plane: true, controls: true, rays: true, axes: true };
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
      const path = new T.CatmullRomCurve3(points.map(vector));
      const mesh = new T.Mesh(new T.TubeGeometry(path, points.length - 1, span * 0.0027, 7, false), new T.MeshBasicMaterial({ color }));
      group.add(mesh);
    }
    function label(text, point, color, group, offset = [10, -20]) {
      const image = document.createElement("canvas");
      image.width = Math.max(96, text.length * 19 + 20); image.height = 50;
      const context = image.getContext("2d");
      context.fillStyle = "rgba(248,247,253,.91)"; context.fillRect(0, 0, image.width, image.height);
      context.font = "600 30px system-ui, sans-serif"; context.fillStyle = "#" + color.toString(16).padStart(6, "0");
      context.textBaseline = "middle"; context.fillText(text, 9, 25);
      const texture = new T.CanvasTexture(image);
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 20;
      sprite.userData = { label: true, anchor: vector(point), width: image.width / 2, height: 25, offset };
      group.add(sprite); return sprite;
    }
    function point(p, color, group, text, offset) {
      const mesh = new T.Mesh(new T.SphereGeometry(span * 0.007, 14, 10), new T.MeshBasicMaterial({ color }));
      mesh.position.copy(vector(p)); group.add(mesh);
      if (text) label(text, p, color, group, offset);
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
      const r = model.radius, c = model.c, s = model.s, k = 1 + c, farX = r / c;
      span = Math.max(farX + r, 2.5 * r, 2);
      const limits = [[-1.35 * r, -1.35 * r, -0.18], [farX + 0.2 * r, 1.35 * r, 1.55]];
      bounds = new T.Box3(vector(limits[0]), vector(limits[1])); bounds.getCenter(center);
      const circle = Array.from({ length: 181 }, (_, i) => [r * Math.cos(i * Math.PI / 90), r * Math.sin(i * Math.PI / 90), 1]);
      line(circle, 0x77738e, groups.base);
      point([0, 0, 0], colors.ink, groups.base, "O", [-16, 18]);
      label("C · w = 1", [-0.8 * r, 0.7 * r, 1], 0x55506f, groups.base, [-10, -22]);
      const positions = [];
      for (let i = 0; i < 120; i++) {
        const a = i * Math.PI / 60, b = (i + 1) * Math.PI / 60;
        positions.push(0, 0, 0, r * Math.cos(a), r * Math.sin(a), 1, r * Math.cos(b), r * Math.sin(b), 1);
      }
      const coneGeometry = new T.BufferGeometry();
      coneGeometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      groups.cone.add(new T.Mesh(coneGeometry, new T.MeshBasicMaterial({ color: 0x5c7aa3, transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false })));
      const disk = new T.Mesh(new T.CircleGeometry(r, 96), new T.MeshBasicMaterial({ color: 0x8898b4, transparent: true, opacity: 0.06, side: T.DoubleSide, depthWrite: false }));
      disk.position.z = 1; groups.cone.add(disk);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        line([[0, 0, 0], [r * Math.cos(angle), r * Math.sin(angle), 1]], 0x8b99b0, groups.cone, false, 0.4);
      }
      const yLimit = r * s * 1.16, wLow = Math.max(0.08, c - 0.08), wHigh = 1.13;
      const planeCorners = [[r * (k - wLow), -yLimit, wLow], [r * (k - wLow), yLimit, wLow], [r * (k - wHigh), yLimit, wHigh], [r * (k - wHigh), -yLimit, wHigh]];
      patch(planeCorners, 0x997ac6, 0.13, groups.plane);
      line([...planeCorners, planeCorners[0]], 0x997ac6, groups.plane, false, 0.65);
      line([[0, 0, 0], [-r, 0, 1]], 0x754ab5, groups.plane, true);
      label("PL", planeCorners[1], 0x754ab5, groups.plane);
      label("(−r, 0, 1)", [-r, 0, 1], 0x754ab5, groups.plane, [-5, 20]);
      curve(samples.curve, colors.parabola, groups.base);
      curve(samples.arc, colors.arc, groups.base);
      point(model.controls[0], colors.ink, groups.base, "P₀ = p₀", [-25, 23]);
      point(model.controls[2], colors.ink, groups.base, "P₂ = p₂", [0, -25]);
      point(model.vertex, colors.parabola, groups.base, "Q", [-24, 5]);
      line(model.controls, colors.control, groups.controls, true);
      line(model.projected, colors.arc, groups.controls, true);
      point(model.controls[1], colors.control, groups.controls, "P₁", [-10, 23]);
      point(model.projected[1], colors.arc, groups.controls, "p₁", [12, -20]);
      line([[0, 0, 0], model.projected[1]], colors.control, groups.rays, true);
      for (const t of [0.2, 0.4, 0.6, 0.8]) {
        line([[0, 0, 0], M.project(M.lifted(model, t))], 0x9b9db0, groups.rays, true, 0.45);
      }
      const axisEnds = [[farX + 0.13 * r, 0, 0], [0, 1.27 * r, 0], [0, 0, 1.45]];
      const axisStarts = [[-1.25 * r, 0, 0], [0, -1.25 * r, 0], [0, 0, -0.1]];
      axisEnds.forEach((end, i) => { line([axisStarts[i], end], colors.ink, groups.axes, false, 0.6); label(["x", "y", "w"][i], end, colors.ink, groups.axes, [8, -12]); });
      Object.keys(visibility).forEach(name => { groups[name].visible = visibility[name]; });
      updateParameter(u);
    }
    function updateParameter(u) {
      if (!model) return;
      currentU = u; clear(groups.moving);
      const h = M.lifted(model, u), p = M.project(h);
      const ray = line([[0, 0, 0], p], colors.arc, groups.moving);
      ray.visible = visibility.rays;
      point(h, colors.parabola, groups.moving, "H(u)", [20, 22]);
      point(p, colors.arc, groups.moving, "r(u)", [20, -22]);
      render();
    }
    function render() {
      if (!model || lost) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const direction = viewMode === "top" ? new T.Vector3(0, 0, 1) : new T.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation));
      camera.up.set(0, viewMode === "top" ? 1 : 0, viewMode === "top" ? 0 : 1);
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
        object.visible = Math.abs(anchorRelative.dot(right)) < extent * aspect && Math.abs(anchorRelative.dot(up)) < extent;
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
      azimuth = -Math.PI / 2; elevation = Math.PI / 2 - 0.0001; zoom = 1;
      if (view === "orbit") { azimuth = -1.12; elevation = 0.56; }
      render();
    }
    function changeZoom(factor) { zoom = M.clamp(zoom / factor, 0.45, 4); render(); }
    let drag;
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      canvas.focus({ preventScroll: true }); drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", event => {
      if (!drag || drag.id !== event.pointerId) return;
      viewMode = "orbit";
      azimuth -= (event.clientX - drag.x) * 0.008;
      elevation = M.clamp(elevation + (event.clientY - drag.y) * 0.008, -1.4, 1.4);
      drag.x = event.clientX; drag.y = event.clientY; render();
    });
    function stop(event) { if (drag?.id === event.pointerId) { drag = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } }
    canvas.addEventListener("pointerup", stop); canvas.addEventListener("pointercancel", stop); canvas.addEventListener("lostpointercapture", () => { drag = null; });
    canvas.addEventListener("wheel", event => { if (event.ctrlKey || event.metaKey || event.altKey) return; event.preventDefault(); changeZoom(Math.exp(M.clamp(event.deltaY, -200, 200) * 0.002)); }, { passive: false });
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
      setLayer(name, shown) { if (!(name in visibility)) return; visibility[name] = shown; groups[name].visible = shown; if (name === "rays") updateParameter(currentU); else render(); },
      dispose() { observer.disconnect(); Object.values(groups).forEach(clear); renderer.dispose(); }
    };
  };
})();
