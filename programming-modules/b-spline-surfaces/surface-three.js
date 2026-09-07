(function () {
  "use strict";
  // The 3D scene is independent of control-grid editing and surface mathematics.
  window.SurfaceThree = function (canvas, fallback, onSelect = () => {}) {
    const THREE = window.THREE;
    let renderer;
    try {
      if (!THREE) throw new Error("Three.js unavailable");
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      fallback.hidden = false;
      canvas.hidden = true;
      return { update() {}, reset() {}, zoom() {}, dispose() {} };
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171541);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.up.set(0, 0, 1);
    const target = new THREE.Vector3(5, 5, 0);
    let azimuth = -0.9, elevation = 0.65, radius = 23;
    let content = new THREE.Group(), handles = [];
    const raycaster = new THREE.Raycaster();
    scene.add(content);
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.3);
    light.position.set(2, -5, 14);
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xa99ae0, 1.4);
    fill.position.set(-8, 10, 3);
    scene.add(fill);
    const grid = new THREE.GridHelper(10, 10, 0x767098, 0x39345b);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(5, 5, -0.01);
    scene.add(grid);

    function textSprite(text, color = "#ffffff", width = 1.1) {
      const bitmap = document.createElement("canvas");
      bitmap.width = 160; bitmap.height = 64;
      const ctx = bitmap.getContext("2d");
      ctx.fillStyle = "rgba(23,21,65,.88)";
      ctx.fillRect(0, 0, 160, 64);
      ctx.fillStyle = color;
      ctx.font = "bold 34px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, 80, 32);
      const texture = new THREE.CanvasTexture(bitmap);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
      sprite.scale.set(width, width * .4, 1);
      sprite.renderOrder = 3;
      return sprite;
    }
    for (const [direction, color, label, length] of [
      [[1, 0, 0], 0xff9986, "x", 10.5], [[0, 1, 0], 0x76dcc1, "y", 10.5], [[0, 0, 1], 0x8ac7ff, "z", 5.8]
    ]) {
      scene.add(new THREE.ArrowHelper(new THREE.Vector3(...direction), new THREE.Vector3(), length, color, .3, .15));
      const sprite = textSprite(label, `#${color.toString(16)}`, .8);
      sprite.position.set(...direction.map((v) => v * (length + .4)));
      scene.add(sprite);
    }
    function cameraPosition() {
      camera.position.set(target.x + radius * Math.cos(elevation) * Math.cos(azimuth),
        target.y + radius * Math.cos(elevation) * Math.sin(azimuth), target.z + radius * Math.sin(elevation));
      camera.lookAt(target);
    }
    function render() {
      cameraPosition();
      renderer.render(scene, camera);
    }
    function release(group) {
      group.traverse((object) => {
        object.geometry?.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) { material.map?.dispose(); material.dispose(); }
        }
      });
    }
    function update(points, selected, options) {
      const size = Math.sqrt(points.length);
      scene.remove(content);
      release(content);
      content = new THREE.Group();
      handles = [];
      scene.add(content);
      if (SurfaceMath.GRID_SIZES.includes(size)) {
        const sampled = SurfaceMath.sample(points, 60, options.mode, options.order);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(sampled.positions, 3));
        geometry.setIndex(sampled.indices);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0x75c4ec, side: THREE.DoubleSide,
          roughness: .55, metalness: .08, wireframe: options.wireframe, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        content.add(new THREE.Mesh(geometry, material));
        if (!options.wireframe) {
          const linePositions = [], divisions = sampled.divisions, stride = divisions + 1;
          function edge(a, b) { linePositions.push(...sampled.positions.slice(a * 3, a * 3 + 3), ...sampled.positions.slice(b * 3, b * 3 + 3)); }
          for (let j = 0; j <= divisions; j += 6) for (let i = 0; i < divisions; i += 1) edge(j * stride + i, j * stride + i + 1);
          for (let i = 0; i <= divisions; i += 6) for (let j = 0; j < divisions; j += 1) edge(j * stride + i, (j + 1) * stride + i);
          const isoGeometry = new THREE.BufferGeometry();
          isoGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
          content.add(new THREE.LineSegments(isoGeometry, new THREE.LineBasicMaterial({ color: 0x224b70, transparent: true, opacity: .7 })));
        }
      }
      if (options.net) {
        const positions = SurfaceMath.netEdges(points.length).flatMap(([a, b]) =>
          [points[a].x, points[a].y, points[a].z, points[b].x, points[b].y, points[b].z]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        content.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffd166 })));
      }
      points.forEach((p, index) => {
        const colors = [0xff9986, 0x76dcc1, 0xb8a7f5, 0xffd166, 0x8ac7ff, 0xf3a6d1];
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(index === selected ? .17 : .11, 12, 8),
          new THREE.MeshBasicMaterial({ color: index === selected ? 0xffffff : colors[Math.floor(index / size)] }));
        sphere.position.set(p.x, p.y, p.z);
        sphere.userData.pointIndex = index;
        handles.push(sphere);
        content.add(sphere);
        if (options.labels) {
          const sprite = textSprite(SurfaceMath.label(index, size));
          sprite.position.set(p.x, p.y, p.z + .4);
          content.add(sprite);
        }
      });
      render();
    }
    function resize() {
      const width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    }
    function reset() { azimuth = -.9; elevation = .65; radius = 23; render(); }
    function zoom(factor) { radius = SurfaceMath.clamp(radius * factor, 7, 65); render(); }
    let drag = null;
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      if (!drag.moved) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 5) return;
        drag.moved = true;
      }
      azimuth -= (event.clientX - drag.x) * .008;
      elevation = SurfaceMath.clamp(elevation + (event.clientY - drag.y) * .008, -1.35, 1.35);
      drag.x = event.clientX; drag.y = event.clientY;
      render();
    });
    function stop(event) {
      if (drag?.id !== event.pointerId) return;
      const selectPoint = !drag.moved && event.type === "pointerup" && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 5;
      drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (selectPoint) {
        const rect = canvas.getBoundingClientRect();
        raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
          1 - (event.clientY - rect.top) / rect.height * 2), camera);
        const hit = raycaster.intersectObjects(handles, false)[0];
        if (hit) onSelect(hit.object.userData.pointIndex);
      }
    }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("lostpointercapture", () => { drag = null; });
    canvas.addEventListener("wheel", (event) => { event.preventDefault(); zoom(Math.exp(SurfaceMath.clamp(event.deltaY, -200, 200) * .002)); }, { passive: false });
    canvas.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") return reset();
      if (["+", "="].includes(event.key)) return zoom(.88);
      if (event.key === "-") return zoom(1.14);
      if (event.key === "ArrowLeft") azimuth -= .12;
      if (event.key === "ArrowRight") azimuth += .12;
      if (event.key === "ArrowUp") elevation += .1;
      if (event.key === "ArrowDown") elevation -= .1;
      elevation = SurfaceMath.clamp(elevation, -1.35, 1.35);
      render();
    });
    canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); fallback.textContent = "The 3D view lost its graphics connection. Reload this page to restart it; copy your point coordinates first."; fallback.hidden = false; });
    canvas.addEventListener("webglcontextrestored", () => { fallback.hidden = true; render(); });
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return { update, reset, zoom, dispose() { observer.disconnect(); release(scene); renderer.dispose(); } };
  };
})();
