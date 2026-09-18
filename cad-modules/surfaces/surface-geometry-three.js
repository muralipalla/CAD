(function () {
  "use strict";

  const T = window.THREE, M = window.SurfaceGeometryMath;
  const unavailable = { available: false, update() {}, reset() {}, dispose() {} };
  const vector = values => new T.Vector3(values[0], values[1], values[2]);

  function clear(group) {
    const geometries = new Set(), materials = new Set();
    group.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(item => materials.add(item));
    });
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); group.clear();
  }

  function createBase(canvas, fallback, settings) {
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false }); }
    catch (_) { if (fallback) fallback.hidden = false; return null; }
    if (fallback) fallback.hidden = true;
    const scene = new T.Scene(); scene.background = new T.Color(0x10182d);
    const camera = new T.PerspectiveCamera(settings.fov || 35, 1, 0.01, 100);
    scene.add(new T.HemisphereLight(0xd9f4ff, 0x242145, 1.15));
    const key = new T.DirectionalLight(0xffffff, 1.25); key.position.set(5, -4, 8); scene.add(key);
    const fill = new T.DirectionalLight(0x7ae4ff, 0.55); fill.position.set(-6, 5, -2); scene.add(fill);
    let azimuth = settings.azimuth || 0.75, elevation = settings.elevation || 0.38, distance = settings.distance || 11;
    let pointer = null, pending = false, disposed = false;
    const events = [];
    function listen(target, name, handler, options) { target.addEventListener(name, handler, options); events.push([target, name, handler, options]); }
    function render() {
      pending = false; if (disposed) return;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
      const center = vector(settings.center || [0, 0, 0]);
      const direction = new T.Vector3(Math.cos(elevation) * Math.cos(azimuth), Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation));
      camera.up.set(0, 0, 1); camera.position.copy(center).addScaledVector(direction, distance); camera.lookAt(center);
      renderer.render(scene, camera);
    }
    function requestRender() { if (!pending) { pending = true; requestAnimationFrame(render); } }
    function reset() { azimuth = settings.azimuth || 0.75; elevation = settings.elevation || 0.38; distance = settings.distance || 11; requestRender(); }
    listen(canvas, "pointerdown", event => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
    listen(canvas, "pointermove", event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; pointer.x = event.clientX; pointer.y = event.clientY;
      azimuth -= dx * 0.009; elevation = M.clamp(elevation + dy * 0.009, -1.35, 1.35); requestRender();
    });
    listen(canvas, "pointerup", () => { pointer = null; }); listen(canvas, "pointercancel", () => { pointer = null; });
    listen(canvas, "wheel", event => { event.preventDefault(); distance = M.clamp(distance * Math.exp(event.deltaY * 0.001), settings.minDistance || 5, settings.maxDistance || 22); requestRender(); }, { passive: false });
    listen(canvas, "keydown", event => {
      if (event.key === "Home") { event.preventDefault(); reset(); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") azimuth += 0.12;
      if (event.key === "ArrowRight") azimuth -= 0.12;
      if (event.key === "ArrowUp") elevation = M.clamp(elevation - 0.1, -1.35, 1.35);
      if (event.key === "ArrowDown") elevation = M.clamp(elevation + 0.1, -1.35, 1.35);
      if (event.key === "+" || event.key === "=") distance = Math.max(settings.minDistance || 5, distance * 0.9);
      if (event.key === "-") distance = Math.min(settings.maxDistance || 22, distance * 1.1);
      requestRender();
    });
    listen(window, "resize", requestRender);
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); if (fallback) { fallback.hidden = false; fallback.textContent = "The 3D context was lost. Reload the page to restore it."; } });
    return {
      scene,
      requestRender,
      reset,
      dispose(groups) { disposed = true; events.forEach(([target, name, handler, options]) => target.removeEventListener(name, handler, options)); groups.forEach(clear); renderer.dispose(); }
    };
  }

  function gridGeometry(rows, columns, pointAt, colors) {
    const positions = [], indices = [], colorValues = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
      positions.push(...pointAt(i / columns, j / rows));
      if (colors) colorValues.push(...colors(i / columns, j / rows));
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const a = j * (columns + 1) + i, b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    if (colors) geometry.setAttribute("color", new T.Float32BufferAttribute(colorValues, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }

  function line(points, color, materialOptions) {
    const { dashed = false, ...options } = materialOptions || {};
    const material = dashed ? new T.LineDashedMaterial({ color, ...options }) : new T.LineBasicMaterial({ color, ...options });
    const object = new T.Line(new T.BufferGeometry().setFromPoints(points.map(vector)), material);
    if (dashed) object.computeLineDistances(); return object;
  }

  function thickArrow(origin, direction, length, color) {
    const group = new T.Group(), start = vector(origin), axis = vector(direction).normalize();
    const headLength = Math.min(0.24, length * 0.24), shaftLength = Math.max(0.01, length - headLength);
    const material = new T.MeshBasicMaterial({ color, depthTest: false });
    const rotation = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), axis);
    const shaft = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, shaftLength, 16), material);
    shaft.position.copy(start).addScaledVector(axis, shaftLength / 2); shaft.quaternion.copy(rotation); shaft.renderOrder = 10;
    const head = new T.Mesh(new T.ConeGeometry(0.12, headLength, 20), material);
    head.position.copy(start).addScaledVector(axis, shaftLength + headLength / 2); head.quaternion.copy(rotation); head.renderOrder = 10;
    group.add(shaft, head); return group;
  }

  window.GaussMapThree = function (canvas, fallback) {
    if (!T || !M) return unavailable;
    const base = createBase(canvas, fallback, { center: [0.3, 0, 0], distance: 12.8, minDistance: 8, maxDistance: 20, azimuth: 0.86, elevation: 0.42 });
    if (!base) return unavailable;
    const staticGroup = new T.Group(), surfaceGroup = new T.Group(), movingGroup = new T.Group(); base.scene.add(staticGroup, surfaceGroup, movingGroup);
    const surfaceOffset = [-2.65, 0, -0.15], sphereCenter = [3.05, 0, 0.15], sphereRadius = 1.35;
    const surfacePoint = (surfaceType, u, v) => M.gaussSurfacePoint(u, v, surfaceType).map((value, index) => value + surfaceOffset[index]);
    let currentSurfaceType = null;
    function rebuildSurface(surfaceType) {
      clear(surfaceGroup); currentSurfaceType = surfaceType;
      const pointAt = (u, v) => surfacePoint(surfaceType, u, v);
      const surface = new T.Mesh(gridGeometry(40, 40, pointAt), new T.MeshPhongMaterial({ color: 0x16cfe2, emissive: 0x032b35, specular: 0x5ce8f1, shininess: 24, side: T.DoubleSide, transparent: true, opacity: 0.96 }));
      surfaceGroup.add(surface);
      for (let index = 0; index <= 8; index++) {
        const t = index / 8, uLine = [], vLine = [];
        for (let i = 0; i <= 60; i++) { uLine.push(pointAt(t, i / 60)); vLine.push(pointAt(i / 60, t)); }
        surfaceGroup.add(line(uLine, 0x071a32, { transparent: true, opacity: 0.75 }), line(vLine, 0x071a32, { transparent: true, opacity: 0.75 }));
      }
    }
    const sphere = new T.Mesh(new T.SphereGeometry(sphereRadius, 44, 28), new T.MeshPhongMaterial({ color: 0x6747dc, emissive: 0x130b38, specular: 0x8f79e8, shininess: 22, transparent: true, opacity: 0.46, depthWrite: false }));
    sphere.position.copy(vector(sphereCenter)); staticGroup.add(sphere);
    const sphereWire = new T.LineSegments(new T.WireframeGeometry(new T.SphereGeometry(sphereRadius * 1.002, 18, 12)), new T.LineBasicMaterial({ color: 0xd9d2ff, transparent: true, opacity: 0.42 }));
    sphereWire.position.copy(vector(sphereCenter)); staticGroup.add(sphereWire);

    function patchBoundary(pointAt) {
      const points = [];
      for (let i = 0; i <= 24; i++) points.push(pointAt(i / 24, 0));
      for (let i = 1; i <= 24; i++) points.push(pointAt(1, i / 24));
      for (let i = 1; i <= 24; i++) points.push(pointAt(1 - i / 24, 1));
      for (let i = 1; i < 24; i++) points.push(pointAt(0, 1 - i / 24));
      return points;
    }

    function update(options) {
      clear(movingGroup);
      if (options.surfaceType !== currentSurfaceType) rebuildSurface(options.surfaceType);
      const data = M.gaussSurfaceDerivatives(options.u, options.v, options.surfaceType);
      const p = data.point.map((value, index) => value + surfaceOffset[index]);
      const nPoint = data.normal.map((value, index) => sphereCenter[index] + sphereRadius * value);
      const domain = M.gaussPatchDomain(options.u, options.v, options.areaFraction);
      const parameters = (localU, localV) => [
        domain.uMin + localU * (domain.uMax - domain.uMin),
        domain.vMin + localV * (domain.vMax - domain.vMin)
      ];
      const sourcePatchPoint = (localU, localV) => {
        const parameter = parameters(localU, localV), local = M.gaussSurfaceDerivatives(parameter[0], parameter[1], options.surfaceType);
        return local.point.map((value, index) => value + surfaceOffset[index] + 0.014 * local.normal[index]);
      };
      const mappedPatchPoint = (localU, localV) => {
        const parameter = parameters(localU, localV), local = M.gaussSurfaceDerivatives(parameter[0], parameter[1], options.surfaceType);
        return local.normal.map((value, index) => sphereCenter[index] + sphereRadius * 1.012 * value);
      };
      const resolution = Math.max(12, Math.round(34 * Math.sqrt(options.areaFraction)));
      const sourcePatch = new T.Mesh(gridGeometry(resolution, resolution, sourcePatchPoint), new T.MeshPhongMaterial({ color: 0xff721c, emissive: 0x5b1802, specular: 0xffc099, shininess: 16, side: T.DoubleSide, transparent: true, opacity: 0.62, depthWrite: false }));
      sourcePatch.renderOrder = 5; movingGroup.add(sourcePatch);
      const mappedPatch = new T.Mesh(gridGeometry(resolution, resolution, mappedPatchPoint), new T.MeshBasicMaterial({ color: 0x83ff5b, side: T.DoubleSide, transparent: true, opacity: 0.58, depthWrite: false }));
      mappedPatch.renderOrder = 6; movingGroup.add(mappedPatch);
      const sourceBoundary = new T.LineLoop(new T.BufferGeometry().setFromPoints(patchBoundary(sourcePatchPoint).map(vector)), new T.LineBasicMaterial({ color: 0xffe2c5, depthTest: false }));
      const mappedBoundary = new T.LineLoop(new T.BufferGeometry().setFromPoints(patchBoundary(mappedPatchPoint).map(vector)), new T.LineBasicMaterial({ color: 0xeaffdf, depthTest: false }));
      sourceBoundary.renderOrder = mappedBoundary.renderOrder = 8; movingGroup.add(sourceBoundary, mappedBoundary);
      const mappedUTrace = line(Array.from({ length: 65 }, (_, index) => mappedPatchPoint(index / 64, 0.5)), 0xeaffdf, { depthTest: false, transparent: true, opacity: 0.9 });
      const mappedVTrace = line(Array.from({ length: 65 }, (_, index) => mappedPatchPoint(0.5, index / 64)), 0xeaffdf, { depthTest: false, transparent: true, opacity: 0.9 });
      mappedUTrace.renderOrder = mappedVTrace.renderOrder = 9; movingGroup.add(mappedUTrace, mappedVTrace);
      const markerMaterial = new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
      const marker = new T.Mesh(new T.SphereGeometry(0.11, 18, 12), markerMaterial); marker.position.copy(vector(p)); marker.renderOrder = 8; movingGroup.add(marker);
      const imageMarker = new T.Mesh(new T.SphereGeometry(0.11, 18, 12), markerMaterial.clone()); imageMarker.position.copy(vector(nPoint)); imageMarker.renderOrder = 8; movingGroup.add(imageMarker);
      const normal = new T.ArrowHelper(vector(data.normal), vector(p), 1.2, 0xffffff, 0.2, 0.1); normal.renderOrder = 7; movingGroup.add(normal);
      const radiusArrow = thickArrow(sphereCenter, data.normal, sphereRadius, 0xffdf2b); movingGroup.add(radiusArrow);
      const start = p.map((value, index) => value + 1.25 * data.normal[index]);
      const mapLine = line([start, nPoint], 0xff7bd6, { dashed: true, dashSize: 0.16, gapSize: 0.1, transparent: true, opacity: 1 }); mapLine.renderOrder = 7; movingGroup.add(mapLine);
      base.requestRender();
    }
    base.requestRender();
    return { available: true, update, reset: base.reset, dispose() { base.dispose([staticGroup, surfaceGroup, movingGroup]); } };
  };

  window.TorusCurvatureThree = function (canvas, fallback) {
    if (!T || !M) return unavailable;
    const base = createBase(canvas, fallback, { center: [0, 0, 0], distance: 10.4, minDistance: 6, maxDistance: 18, azimuth: 0.75, elevation: 0.54 });
    if (!base) return unavailable;
    const staticGroup = new T.Group(), movingGroup = new T.Group(); base.scene.add(staticGroup, movingGroup);
    const rows = 54, columns = 96;
    const geometry = gridGeometry(rows, columns, (u, v) => M.torusPoint(u, v), (_, v) => M.torusCurvatureColor(v));
    const torus = new T.Mesh(geometry, new T.MeshPhongMaterial({ vertexColors: true, emissive: 0x05030d, specular: 0x27233d, shininess: 12, side: T.DoubleSide }));
    staticGroup.add(torus);
    for (let i = 0; i < 16; i++) {
      const u = i / 16, points = Array.from({ length: 73 }, (_, index) => M.torusPoint(u, index / 72));
      staticGroup.add(line(points, 0x050b1f, { transparent: true, opacity: 0.48 }));
    }
    for (let j = 0; j < 12; j++) {
      const v = j / 12, points = Array.from({ length: 97 }, (_, index) => M.torusPoint(index / 96, v));
      staticGroup.add(line(points, 0x050b1f, { transparent: true, opacity: 0.48 }));
    }
    [0.25, 0.75].forEach(v => {
      const points = Array.from({ length: 129 }, (_, index) => M.torusPoint(index / 128, v));
      const zeroLine = line(points, 0xffd166, { transparent: true, opacity: 0.98, depthTest: false }); zeroLine.renderOrder = 6; staticGroup.add(zeroLine);
    });

    function update(options) {
      clear(movingGroup);
      const data = M.torusGeometry(options.u, options.v), p = data.point;
      const uCurve = Array.from({ length: 129 }, (_, index) => M.torusPoint(options.u, index / 128));
      const vCurve = Array.from({ length: 161 }, (_, index) => M.torusPoint(index / 160, options.v));
      const lineU = line(uCurve, 0xf6a8d1, { depthTest: false }); lineU.renderOrder = 8; movingGroup.add(lineU);
      const lineV = line(vCurve, 0x8de5f2, { depthTest: false }); lineV.renderOrder = 8; movingGroup.add(lineV);
      const marker = new T.Mesh(new T.SphereGeometry(0.105, 20, 14), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      marker.position.copy(vector(p)); marker.renderOrder = 10; movingGroup.add(marker);
      const normal = new T.ArrowHelper(vector(data.normal), vector(p), 1.05, 0xffffff, 0.18, 0.09); normal.renderOrder = 9; movingGroup.add(normal);
      const tangentU = M.unit(data.ru), tangentV = M.unit(data.rv), planeSize = 0.82;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(pair => p.map((value, index) => value + planeSize * (pair[0] * tangentU[index] + pair[1] * tangentV[index])));
      if (options.showPlane) {
        const planeGeometry = new T.BufferGeometry();
        planeGeometry.setAttribute("position", new T.Float32BufferAttribute([...corners[0], ...corners[1], ...corners[3], ...corners[1], ...corners[2], ...corners[3]], 3)); planeGeometry.computeVertexNormals();
        const plane = new T.Mesh(planeGeometry, new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, transparent: true, opacity: 0.38, depthWrite: false }));
        plane.renderOrder = 4; movingGroup.add(plane);
        const border = new T.LineLoop(new T.BufferGeometry().setFromPoints(corners.map(vector)), new T.LineBasicMaterial({ color: 0xffffff, depthTest: false })); border.renderOrder = 9; movingGroup.add(border);
      }
      if (!options.showIsolines) { lineU.visible = false; lineV.visible = false; }
      base.requestRender();
    }
    base.requestRender();
    return { available: true, update, reset: base.reset, dispose() { base.dispose([staticGroup, movingGroup]); } };
  };
})();
