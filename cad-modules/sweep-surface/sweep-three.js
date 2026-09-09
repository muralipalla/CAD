(function () {
  "use strict";

  // The geometry is built once per model. Animation changes draw ranges and
  // moving construction aids, so orbiting and probing do not rebuild the mesh.
  window.SweepThree = function (canvas, fallback) {
    const T = window.THREE;
    const exportUnavailable = () => { throw new Error("A working 3D view is required to download an image. Enable WebGL and reload the page."); };
    const unavailable = { available: false, update() {}, setView() {}, zoom() {}, reset() {}, dispose() {}, exportPNG: exportUnavailable, exportSVG: exportUnavailable };
    function fail(message) {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = message || "3D graphics are unavailable. Enable WebGL or try another browser; the curve controls and equations remain available.";
      }
      return unavailable;
    }
    if (!T) return fail();
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
    catch (_) { return fail(); }
    if (fallback) fallback.hidden = true;

    const scene = new T.Scene();
    scene.background = new T.Color(0x10182d);
    const camera = new T.OrthographicCamera(-10, 10, 10, -10, 0.01, 1000);
    scene.add(new T.AmbientLight(0xc6e8ff, 0.85));
    const key = new T.DirectionalLight(0xffffff, 1.05);
    key.position.set(4, -6, 9); scene.add(key);
    const fill = new T.DirectionalLight(0x64d7ff, 0.65);
    fill.position.set(-5, 7, -2); scene.add(fill);
    const colors = { surface: 0x36d2e4, wire: 0x12354c, path: 0xffd74d, profile: 0xff59c8, point: 0xffffff, tangent: 0xffd74d, normal: 0xff91dd, binormal: 0xa4ffbb, axes: 0xaebbd0 };
    const groups = {};
    ["surface", "wire", "path", "profile", "frame", "axes", "probe", "intersections"].forEach(name => {
      groups[name] = new T.Group(); scene.add(groups[name]);
    });
    const vec = p => new T.Vector3(p[0], p[1], p[2]);
    const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
    const plus = (a, b, scale) => a.map((n, i) => n + b[i] * scale);
    const events = [], pointers = new Map();
    let model = null, options = {}, span = 10, zoomLevel = 1, azimuth = -0.9, elevation = 0.58, viewMode = "iso";
    let center = new T.Vector3(), bounds = new T.Box3(vec([-5, -5, -5]), vec([5, 5, 5]));
    let disposed = false, lost = false, framePending = false, animationId = 0;
    let surface, pathSegments = 1, profileSegments = 1, rings = [], rails = [], moving = {}, pair = [], lastDistance = 0;
    let intersectionSource = null, intersectionIds = [], intersectionFaces = null, intersectionEdges = null;

    function on(name, fn, settings) {
      canvas.addEventListener(name, fn, settings); events.push([name, fn, settings]);
    }
    function clear(group) {
      const geometries = new Set(), materials = new Set(), textures = new Set();
      group.traverse(object => {
        if (object.isInstancedMesh && object.dispose) object.dispose();
        if (object.geometry) geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean).forEach(material => {
          materials.add(material); if (material.map) textures.add(material.map);
        });
      });
      geometries.forEach(item => item.dispose()); textures.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
      group.clear();
    }
    function line(points, color, group, overlay, dashed) {
      const geometry = new T.BufferGeometry().setFromPoints(points.map(vec));
      const settings = { color, depthTest: !overlay, depthWrite: false };
      const material = dashed ? new T.LineDashedMaterial({ ...settings, dashSize: span * 0.019, gapSize: span * 0.012 }) : new T.LineBasicMaterial(settings);
      const object = new T.Line(geometry, material);
      if (dashed) object.computeLineDistances();
      if (overlay) object.renderOrder = 10;
      group.add(object); return object;
    }
    function label(text, anchor, color, group) {
      const image = document.createElement("canvas"); image.width = 64; image.height = 48;
      const context = image.getContext("2d");
      context.fillStyle = "rgba(16,24,45,.93)"; context.fillRect(0, 0, 64, 48);
      context.font = "700 30px system-ui, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
      context.fillStyle = "#" + color.toString(16).padStart(6, "0"); context.fillText(text, 32, 24);
      const map = new T.CanvasTexture(image);
      if (T.SRGBColorSpace) map.colorSpace = T.SRGBColorSpace;
      else if (T.sRGBEncoding) map.encoding = T.sRGBEncoding;
      const sprite = new T.Sprite(new T.SpriteMaterial({ map, depthTest: false, depthWrite: false }));
      sprite.renderOrder = 30; sprite.userData = { label: true, text, color, anchor: vec(anchor), from: vec([0, 0, 0]) };
      group.add(sprite); return sprite;
    }
    function arrow(point, direction, length, color, group, overlay) {
      const object = new T.ArrowHelper(vec(direction).normalize(), vec(point), length, color, length * 0.18, length * 0.085);
      if (overlay) object.traverse(child => {
        if (child.material) { child.material.depthTest = false; child.material.depthWrite = false; child.renderOrder = 15; }
      });
      group.add(object); return object;
    }
    function buildAxes() {
      const length = span * 0.34;
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((direction, i) => {
        arrow([0, 0, 0], direction, length, colors.axes, groups.axes, false);
        label(["x", "y", "z"][i], plus([0, 0, 0], direction, length), colors.axes, groups.axes);
      });
    }
    function positionAt(row, column) {
      const offset = (row * (profileSegments + 1) + column) * 3;
      return Array.from(model.positions.subarray(offset, offset + 3));
    }
    function rebuild(next) {
      Object.values(groups).forEach(clear); model = next; rings = []; rails = []; moving = {};
      intersectionSource = null; intersectionIds = []; intersectionFaces = null; intersectionEdges = null;
      pathSegments = model.path.length - 1; profileSegments = model.profile.length - 1;
      bounds = new T.Box3(vec(model.bounds.min), vec(model.bounds.max));
      bounds.getCenter(center);
      const size = bounds.getSize(new T.Vector3()); span = Math.max(size.x, size.y, size.z, 0.1);
      zoomLevel = 1;
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.BufferAttribute(model.positions, 3));
      geometry.setIndex(Array.from(model.indices)); geometry.computeVertexNormals();
      const material = new T.MeshPhongMaterial({ color: colors.surface, emissive: 0x073840, specular: 0x467b84, shininess: 36, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      surface = new T.Mesh(geometry, material); groups.surface.add(surface);
      const rowStep = Math.max(1, Math.round(pathSegments / 24)), colStep = Math.max(1, Math.round(profileSegments / 16));
      for (let row = 0; row <= pathSegments; row += rowStep) {
        const object = line(Array.from({ length: profileSegments + 1 }, (_, col) => positionAt(row, col)), colors.wire, groups.wire);
        rings.push({ object, u: row / pathSegments });
      }
      for (let col = 0; col <= profileSegments; col += colStep) {
        rails.push(line(Array.from({ length: pathSegments + 1 }, (_, row) => positionAt(row, col)), colors.wire, groups.wire));
      }
      // Dashed overlay intentionally reveals the center path through opaque parts.
      line(model.path, colors.path, groups.path, true, true);
      buildAxes();

      moving.profileCount = Math.max(48, Math.min(160, profileSegments));
      // Instanced cylinders keep the highlighted section clearly visible at all
      // device pixel ratios, where WebGL otherwise restricts lines to one pixel.
      moving.profile = new T.InstancedMesh(new T.CylinderGeometry(1, 1, 1, 7), new T.MeshBasicMaterial({ color: colors.profile, depthTest: false, depthWrite: false }), moving.profileCount);
      moving.profile.renderOrder = 12; moving.profile.frustumCulled = false;
      moving.profile.instanceMatrix.setUsage(T.DynamicDrawUsage); groups.profile.add(moving.profile);
      ["tangent", "normal", "binormal"].forEach((name, i) => {
        moving[name] = arrow([0, 0, 0], [1, 0, 0], span * 0.13, colors[name], groups.frame, true);
        moving[name + "Label"] = label(["T", "Nθ", "Bθ"][i], [0, 0, 0], colors[name], groups.frame);
      });
      moving.halo = new T.Mesh(new T.SphereGeometry(span * 0.0105, 16, 12), new T.MeshBasicMaterial({ color: 0x10182d, depthTest: false, depthWrite: false }));
      moving.probe = new T.Mesh(new T.SphereGeometry(span * 0.007, 16, 12), new T.MeshBasicMaterial({ color: colors.point, depthTest: false, depthWrite: false }));
      moving.halo.renderOrder = 18; moving.probe.renderOrder = 19; groups.probe.add(moving.halo, moving.probe);
      moving.probeLabel = label("S", [0, 0, 0], colors.point, groups.probe);
    }
    const transform = new T.Object3D(), worldUp = new T.Vector3(0, 1, 0);
    function updateIntersections() {
      if (intersectionSource !== options.intersections) {
        clear(groups.intersections); intersectionSource = options.intersections;
        intersectionFaces = null; intersectionEdges = null;
        const count = model.indices.length / 3;
        intersectionIds = [...new Set(Array.from(options.intersections || []).filter(id => Number.isInteger(id) && id >= 0 && id < count))].sort((a, b) => a - b);
        if (intersectionIds.length) {
          const facePositions = new Float32Array(intersectionIds.length * 9), edgePositions = new Float32Array(intersectionIds.length * 18);
          intersectionIds.forEach((id, i) => {
            const triangle = Array.from(model.indices.subarray(id * 3, id * 3 + 3), index => Array.from(model.positions.subarray(index * 3, index * 3 + 3)));
            triangle.forEach((point, vertex) => facePositions.set(point, i * 9 + vertex * 3));
            [0, 1, 1, 2, 2, 0].forEach((vertex, j) => edgePositions.set(triangle[vertex], i * 18 + j * 3));
          });
          const faceGeometry = new T.BufferGeometry(); faceGeometry.setAttribute("position", new T.BufferAttribute(facePositions, 3));
          intersectionFaces = new T.Mesh(faceGeometry, new T.MeshBasicMaterial({ color: 0xff473b, side: T.DoubleSide, depthTest: false, depthWrite: false }));
          intersectionFaces.renderOrder = 2; groups.intersections.add(intersectionFaces);
          const edgeGeometry = new T.BufferGeometry(); edgeGeometry.setAttribute("position", new T.BufferAttribute(edgePositions, 3));
          intersectionEdges = new T.LineSegments(edgeGeometry, new T.LineBasicMaterial({ color: 0xffeced, depthTest: false, depthWrite: false }));
          intersectionEdges.renderOrder = 3; groups.intersections.add(intersectionEdges);
        }
      }
      const limit = surface.geometry.drawRange.count / 3;
      let shown = 0;
      while (shown < intersectionIds.length && intersectionIds[shown] < limit) shown++;
      if (intersectionFaces) intersectionFaces.geometry.setDrawRange(0, shown * 3);
      if (intersectionEdges) intersectionEdges.geometry.setDrawRange(0, shown * 6);
      groups.intersections.visible = Boolean(options.showIntersections && options.showSurface && shown);
    }
    function updateMotion() {
      const u = options.u, v = options.v, frame = model.frame(u), point = model.point(u, v);
      const section = Array.from({ length: moving.profileCount + 1 }, (_, i) => vec(model.point(u, i / moving.profileCount)));
      for (let i = 0; i < moving.profileCount; i++) {
        const direction = section[i + 1].clone().sub(section[i]);
        transform.position.copy(section[i]).add(section[i + 1]).multiplyScalar(0.5);
        transform.quaternion.setFromUnitVectors(worldUp, direction.clone().normalize());
        transform.scale.set(span * 0.002, Math.max(1e-12, direction.length()), span * 0.002);
        transform.updateMatrix(); moving.profile.setMatrixAt(i, transform.matrix);
      }
      moving.profile.instanceMatrix.needsUpdate = true;
      ["tangent", "normal", "binormal"].forEach(name => {
        const direction = vec(frame[name]).normalize(), length = span * 0.13, object = moving[name];
        object.position.copy(vec(frame.point)); object.setDirection(direction); object.setLength(length, length * 0.18, length * 0.085);
        const data = moving[name + "Label"].userData;
        data.anchor.copy(vec(frame.point)).addScaledVector(direction, length); data.from.copy(vec(frame.point));
      });
      moving.halo.position.copy(vec(point)); moving.probe.position.copy(vec(point));
      moving.probeLabel.userData.anchor.copy(vec(point)); moving.probeLabel.userData.from.copy(vec(frame.point));
    }
    function update(nextModel, nextOptions) {
      if (disposed || !nextModel) return;
      if (model !== nextModel) rebuild(nextModel);
      options = { u: 0.5, v: 0.25, progress: 1, showSurface: true, showWireframe: true, showPath: true, showProfile: true, showFrame: true, showAxes: true, surfaceColor: "#36d2e4", showIntersections: true, ...options, ...nextOptions };
      if (!/^#[0-9a-f]{6}$/i.test(options.surfaceColor)) options.surfaceColor = "#36d2e4";
      surface.material.color.set(options.surfaceColor);
      surface.material.emissive.copy(surface.material.color).multiplyScalar(0.11);
      surface.material.specular.copy(surface.material.color).lerp(new T.Color(0xffffff), 0.35).multiplyScalar(0.35);
      const tint = surface.material.color;
      const wireColor = tint.r * 0.2126 + tint.g * 0.7152 + tint.b * 0.0722 < 0.19 ? 0xc4d7e5 : colors.wire;
      groups.wire.children.forEach(object => object.material.color.setHex(wireColor));
      ["u", "v", "progress"].forEach(name => { options[name] = clamp(Number.isFinite(options[name]) ? options[name] : 0, 0, 1); });
      const rows = Math.min(pathSegments, Math.floor(options.progress * pathSegments + 1e-8));
      surface.geometry.setDrawRange(0, rows * profileSegments * 6);
      rings.forEach(({ object, u }) => { object.visible = options.progress > 0 && u <= options.progress + 1e-8; });
      rails.forEach(object => object.geometry.setDrawRange(0, rows + 1));
      groups.surface.visible = Boolean(options.showSurface);
      groups.wire.visible = Boolean(options.showWireframe);
      groups.path.visible = Boolean(options.showPath);
      groups.profile.visible = Boolean(options.showProfile);
      groups.frame.visible = Boolean(options.showFrame);
      groups.axes.visible = Boolean(options.showAxes);
      updateIntersections(); updateMotion(); requestRender();
    }
    function render() {
      framePending = false;
      if (disposed || lost || !model) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      const direction = viewMode === "top" ? vec([0, 0, 1]) : viewMode === "front" ? vec([0, -1, 0]) : viewMode === "side" ? vec([1, 0, 0]) : vec([Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation)]);
      camera.up.set(0, viewMode === "top" ? 1 : 0, viewMode === "top" ? 0 : 1);
      camera.position.copy(center).addScaledVector(direction, span * 4); camera.lookAt(center); camera.updateMatrixWorld();
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let halfWidth = 0, halfHeight = 0;
      // Fit the sampled geometry itself, avoiding the empty corners of a large
      // axis-aligned box around a curved sweep. Always include the whole path so
      // revealing the surface never changes the camera framing.
      function include(x, y, z) {
        x -= center.x; y -= center.y; z -= center.z;
        halfWidth = Math.max(halfWidth, Math.abs(x * right.x + y * right.y + z * right.z));
        halfHeight = Math.max(halfHeight, Math.abs(x * up.x + y * up.y + z * up.z));
      }
      for (let i = 0; i < model.positions.length; i += 3) include(model.positions[i], model.positions[i + 1], model.positions[i + 2]);
      model.path.forEach(p => include(...p));
      const aspect = width / height, margin = span * 0.075;
      const extent = Math.max(halfHeight + margin, (halfWidth + margin) / aspect, span * 0.025) * 1.04 / zoomLevel;
      camera.left = -extent * aspect; camera.right = extent * aspect; camera.top = extent; camera.bottom = -extent;
      camera.near = Math.max(span * 0.001, 0.00001); camera.far = span * 10; camera.updateProjectionMatrix();
      const pixelUnit = extent * 2 / height, placed = [];
      scene.traverse(object => {
        const data = object.userData;
        if (!data.label) return;
        object.visible = true;
        for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return;
        const anchor = data.anchor.clone().sub(center), from = data.from.clone().sub(center);
        const x = anchor.dot(right) / pixelUnit, y = anchor.dot(up) / pixelUnit;
        // An axis may lie far outside a translated custom model. Do not drag its
        // label into the viewport when the corresponding anchor is off screen.
        if (Math.abs(x) > width / 2 + 30 || Math.abs(y) > height / 2 + 30) { object.visible = false; return; }
        const dx = x - from.dot(right) / pixelUnit, dy = y - from.dot(up) / pixelUnit, distance = Math.hypot(dx, dy);
        let offsetX = distance > 2 ? dx / distance * 22 : 17, offsetY = distance > 2 ? dy / distance * 22 : 17;
        // A small screen-space adjustment keeps frame labels distinct in axial views.
        for (let attempt = 0; attempt < 6; attempt++) {
          if (!placed.some(p => Math.abs(x + offsetX - p[0]) < 31 && Math.abs(y + offsetY - p[1]) < 25)) break;
          offsetY += 26;
        }
        const sx = clamp(x + offsetX, -width / 2 + 19, width / 2 - 19), sy = clamp(y + offsetY, -height / 2 + 16, height / 2 - 16);
        placed.push([sx, sy]);
        object.scale.set(29 * pixelUnit, 22 * pixelUnit, 1);
        object.position.copy(data.anchor).addScaledVector(right, (sx - x) * pixelUnit).addScaledVector(up, (sy - y) * pixelUnit);
      });
      renderer.render(scene, camera);
    }
    function requestRender() {
      if (framePending || disposed) return;
      framePending = true; animationId = window.requestAnimationFrame(render);
    }
    function resize() {
      if (disposed || lost || !canvas.clientWidth || !canvas.clientHeight) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); requestRender();
    }
    function assertExportable() {
      if (disposed || lost || !model) throw new Error("The 3D view is not ready. Generate a surface and try the download again.");
      if (!canvas.clientWidth || !canvas.clientHeight) throw new Error("Make the 3D view visible before downloading it.");
    }
    async function exportPNG() {
      assertExportable();
      const width = canvas.clientWidth, height = canvas.clientHeight, previousRatio = renderer.getPixelRatio();
      const ratio = Math.min(4096 / Math.max(width, height), Math.max(2, 1200 / Math.max(width, height)));
      const snapshot = document.createElement("canvas");
      // Copy the freshly rendered buffer synchronously. Keeping
      // preserveDrawingBuffer off avoids a cost on every interactive frame.
      try {
        renderer.setPixelRatio(ratio); renderer.setSize(width, height, false); render();
        snapshot.width = canvas.width; snapshot.height = canvas.height;
        const context = snapshot.getContext("2d");
        if (!context) throw new Error("This browser could not create a PNG image.");
        context.drawImage(canvas, 0, 0);
      } finally {
        renderer.setPixelRatio(previousRatio); renderer.setSize(width, height, false); render();
      }
      return new Promise((resolve, reject) => snapshot.toBlob(blob => {
        if (blob) resolve(blob); else reject(new Error("This browser could not encode the PNG image."));
      }, "image/png"));
    }
    function exportSVG() {
      assertExportable(); render(); scene.updateMatrixWorld(true);
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const escapeXML = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
      const number = value => Number(value.toFixed(2));
      const coordinate = point => `${number(point.x)},${number(point.y)}`;
      const project = point => {
        const p = point.clone().project(camera);
        return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, z: p.z };
      };
      const visible = object => {
        for (let current = object; current; current = current.parent) if (!current.visible) return false;
        return true;
      };
      const fragments = [], overlays = [];
      let sequence = 0;
      function append(markup, depth, object, material) {
        const item = { markup, depth, order: object.renderOrder || 0, sequence: sequence++ };
        (material.depthTest === false ? overlays : fragments).push(item);
      }
      function outOfView(points) {
        return points.every(p => p.x < 0) || points.every(p => p.x > width) || points.every(p => p.y < 0) || points.every(p => p.y > height) || points.every(p => p.z < -1) || points.every(p => p.z > 1);
      }
      const directionToEye = camera.position.clone().sub(center).normalize();
      const keyDirection = key.position.clone().normalize(), fillDirection = fill.position.clone().normalize();
      function triangleColor(material, a, b, c) {
        if (!material.isMeshPhongMaterial) return "#" + material.color.getHexString();
        const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        if (normal.dot(directionToEye) < 0) normal.negate();
        // A vector triangle has a single fill. Approximate the live Phong
        // lighting with a diffuse fill, preserving the selected surface color.
        const shade = 0.64 + Math.max(0, normal.dot(keyDirection)) * 0.37 + Math.max(0, normal.dot(fillDirection)) * 0.16;
        return "#" + material.color.clone().multiplyScalar(shade).getHexString();
      }
      function exportMesh(object, matrix) {
        const geometry = object.geometry, position = geometry.getAttribute("position"), index = geometry.index, material = object.material;
        if (!position || !material || !material.visible || Array.isArray(material)) return;
        const available = index ? index.count : position.count;
        const start = geometry.drawRange.start, end = Math.min(available, start + geometry.drawRange.count);
        const pointAt = offset => new T.Vector3().fromBufferAttribute(position, index ? index.getX(offset) : offset).applyMatrix4(matrix);
        for (let offset = start; offset + 2 < end; offset += 3) {
          const world = [pointAt(offset), pointAt(offset + 1), pointAt(offset + 2)], points = world.map(project);
          if (outOfView(points)) continue;
          const area = (points[1].x - points[0].x) * (points[2].y - points[0].y) - (points[1].y - points[0].y) * (points[2].x - points[0].x);
          if (Math.abs(area) < 0.00001 || material.side === T.FrontSide && area >= 0 || material.side === T.BackSide && area <= 0) continue;
          const fillColor = triangleColor(material, ...world);
          const markup = `<path d="M${points.map(coordinate).join("L")}Z" fill="${fillColor}" stroke="${fillColor}" stroke-width="0.25" stroke-linejoin="round"${material.opacity < 1 ? ` opacity="${number(material.opacity)}"` : ""}/>`;
          append(markup, points.reduce((sum, p) => sum + p.z, 0) / 3, object, material);
        }
      }
      function exportLine(object) {
        const geometry = object.geometry, position = geometry.getAttribute("position"), index = geometry.index, material = object.material;
        if (!position || !material || !material.visible) return;
        const start = geometry.drawRange.start, end = Math.min(index ? index.count : position.count, start + geometry.drawRange.count);
        const points = [];
        for (let offset = start; offset < end; offset++) points.push(project(new T.Vector3().fromBufferAttribute(position, index ? index.getX(offset) : offset).applyMatrix4(object.matrixWorld)));
        if (points.length < 2) return;
        const stroke = "#" + material.color.getHexString(), pixelScale = height / (camera.top - camera.bottom);
        const dash = material.isLineDashedMaterial ? ` stroke-dasharray="${number(material.dashSize * pixelScale)} ${number(material.gapSize * pixelScale)}"` : "";
        const style = `fill="none" stroke="${stroke}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"${dash}`;
        if (material.depthTest === false && !object.isLineSegments) {
          append(`<path d="M${points.map(coordinate).join("L")}${object.isLineLoop ? "Z" : ""}" ${style}/>`, 0, object, material);
          return;
        }
        const step = object.isLineSegments ? 2 : 1;
        for (let i = 0; i + 1 < points.length; i += step) {
          const segment = [points[i], points[i + 1]];
          if (outOfView(segment)) continue;
          append(`<path d="M${coordinate(segment[0])}L${coordinate(segment[1])}" ${style}/>`, (segment[0].z + segment[1].z) / 2, object, material);
        }
      }
      scene.traverse(object => {
        if (!visible(object)) return;
        if (object.userData.label) {
          const point = project(object.getWorldPosition(new T.Vector3())), data = object.userData;
          const color = "#" + data.color.toString(16).padStart(6, "0");
          append(`<g><rect x="${number(point.x - 14.5)}" y="${number(point.y - 11)}" width="29" height="22" fill="#10182d" fill-opacity="0.93"/><text x="${number(point.x)}" y="${number(point.y)}" fill="${color}" font-family="system-ui,sans-serif" font-size="13.6" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXML(data.text)}</text></g>`, 0, object, object.material);
        } else if (object.isInstancedMesh) {
          const instance = new T.Matrix4(), matrix = new T.Matrix4();
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, instance); matrix.multiplyMatrices(object.matrixWorld, instance); exportMesh(object, matrix);
          }
        } else if (object.isMesh) exportMesh(object, object.matrixWorld);
        else if (object.isLine) exportLine(object);
      });
      fragments.sort((a, b) => b.depth - a.depth || a.order - b.order || a.sequence - b.sequence);
      overlays.sort((a, b) => a.order - b.order || b.depth - a.depth || a.sequence - b.sequence);
      const description = "General sweep surface: the current orthographic camera, surface color, visible construction aids, reveal progress and intersection highlights. All geometry and labels are vectors. Lighting and hidden-surface ordering are approximated using diffuse triangle fills and painter sorting; overlapping faces and grid edges can differ from the interactive WebGL view.";
      return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">General Sweep Surfaces</title><desc id="desc">${escapeXML(description)}</desc><defs><clipPath id="viewport"><rect width="${width}" height="${height}"/></clipPath></defs><rect width="${width}" height="${height}" fill="#10182d"/><g clip-path="url(#viewport)">${fragments.concat(overlays).map(item => item.markup).join("")}</g></svg>`], { type: "image/svg+xml;charset=utf-8" });
    }
    function setView(name) {
      viewMode = ["top", "front", "side"].includes(name) ? name : "iso"; zoomLevel = 1;
      if (viewMode === "iso") { azimuth = -0.9; elevation = 0.58; }
      requestRender();
    }
    function zoom(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      zoomLevel = clamp(zoomLevel / factor, 0.45, 6); requestRender();
    }
    function syncGesture() {
      const touches = [...pointers.keys()].filter(id => pointers.get(id).type === "touch");
      if (touches.length < 2) { pair = []; lastDistance = 0; return; }
      if (pair.length !== 2 || !pair.every(id => touches.includes(id))) pair = touches.slice(0, 2);
      const [a, b] = pair.map(id => pointers.get(id)); lastDistance = Math.hypot(a.x - b.x, a.y - b.y);
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
        if (lastDistance > 0 && distance > 0) zoom(lastDistance / distance);
        lastDistance = distance; return;
      }
      viewMode = "iso"; azimuth -= dx * 0.008; elevation = clamp(elevation + dy * 0.008, -1.45, 1.45); requestRender();
    });
    function stop(event) {
      if (!pointers.delete(event.pointerId)) return;
      syncGesture(); if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    on("pointerup", stop); on("pointercancel", stop); on("lostpointercapture", stop);
    on("wheel", event => {
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoom(Math.exp(clamp(event.deltaY * multiplier, -200, 200) * (event.ctrlKey || event.metaKey ? 0.008 : 0.002)));
    }, { passive: false });
    on("keydown", event => {
      if (event.ctrlKey || event.metaKey || event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") return setView("iso");
      if (["+", "="].includes(event.key)) return zoom(0.85);
      if (event.key === "-") return zoom(1.18);
      viewMode = "iso";
      if (event.key === "ArrowLeft") azimuth -= 0.12;
      if (event.key === "ArrowRight") azimuth += 0.12;
      if (event.key === "ArrowUp") elevation += 0.1;
      if (event.key === "ArrowDown") elevation -= 0.1;
      elevation = clamp(elevation, -1.45, 1.45); requestRender();
    });
    on("webglcontextlost", event => { event.preventDefault(); lost = true; fail("The 3D graphics connection was interrupted. Reload to restore it; the curve controls and equations remain available."); });
    on("webglcontextrestored", () => { lost = false; if (fallback) fallback.hidden = true; resize(); });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas); else window.addEventListener("resize", resize);
    resize();
    return {
      available: true, update, setView, zoom, exportPNG, exportSVG, reset() { setView("iso"); },
      dispose() {
        disposed = true; window.cancelAnimationFrame(animationId);
        if (observer) observer.disconnect(); else window.removeEventListener("resize", resize);
        events.forEach(([name, fn, settings]) => canvas.removeEventListener(name, fn, settings));
        pointers.clear(); Object.values(groups).forEach(clear); renderer.dispose();
      }
    };
  };
})();
