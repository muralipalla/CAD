(function (root, factory) {
  "use strict";
  const api = factory(root && root.THREE);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CADWorkflowThree = api;
})(typeof window !== "undefined" ? window : null, function (THREE) {
  "use strict";

  const HOLE = { x: 1.04, y: 0.24, r: 0.46 };
  const SLOT = { left: -1.95, right: -0.65, y: 0.50, r: 0.27 };
  const TOP = 0.38;
  const BOTTOM = -0.38;
  const PAD = { x: 1.36, y: 1.08, width: 0.95, depth: 0.66, top: TOP + 0.13 };
  const SHAFT = { x: -0.46, y: -1.00, lowerR: 0.39, upperR: 0.24, lowerH: 0.64, upperH: 0.62 };
  const colors = { body: 0xfff54f, feature: 0x5ed8ff, zone: 0xf32438, datum: 0x6aaeff, grid: 0x304462 };

  function capsulePath(T, left, right, y, radius) {
    const path = new T.Path();
    path.moveTo(left, y + radius);
    path.lineTo(right, y + radius);
    path.absarc(right, y, radius, Math.PI / 2, -Math.PI / 2, true);
    path.lineTo(left, y - radius);
    path.absarc(left, y, radius, -Math.PI / 2, -3 * Math.PI / 2, true);
    path.closePath();
    return path;
  }

  function tube(T, points, radius, material, closed) {
    const curve = new T.CatmullRomCurve3(points, Boolean(closed), "centripetal");
    return new T.Mesh(new T.TubeGeometry(curve, Math.max(24, points.length * 6), radius, 6, Boolean(closed)), material);
  }

  function ring(T, x, y, z, r, material, dashed) {
    const points = [];
    for (let i = 0; i <= 72; i++) {
      const a = i * Math.PI * 2 / 72;
      points.push(new T.Vector3(x + r * Math.cos(a), y + r * Math.sin(a), z));
    }
    if (dashed) {
      const line = new T.Line(new T.BufferGeometry().setFromPoints(points), material);
      line.computeLineDistances();
      return line;
    }
    return tube(T, points, 0.014, material, true);
  }

  function segment(T, a, b, material, radius) {
    const vector = new T.Vector3().subVectors(b, a);
    const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, vector.length(), 8), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vector.normalize());
    return mesh;
  }

  function rectangularFrame(T, corners, material, radius, parent) {
    corners.forEach(function (corner, index) {
      parent.add(segment(T, corner, corners[(index + 1) % corners.length], material, radius));
    });
  }

  function label(T, text, background, foreground) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(24, 24, 208, 80);
    ctx.strokeStyle = foreground;
    ctx.lineWidth = 5;
    ctx.strokeRect(24, 24, 208, 80);
    ctx.fillStyle = foreground;
    ctx.font = "bold 56px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 66);
    const texture = new T.CanvasTexture(canvas);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.set(0.72, 0.36, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  function makePart(T, group) {
    const plate = new T.Shape();
    plate.moveTo(-3, -1.8); plate.lineTo(3, -1.8); plate.lineTo(3, 1.8);
    plate.lineTo(-3, 1.8); plate.closePath();
    for (const [x, y, r] of [[HOLE.x, HOLE.y, HOLE.r], [-2.46, -0.98, 0.18], [2.48, 1.08, 0.18]]) {
      const bore = new T.Path();
      bore.absarc(x, y, r, 0, Math.PI * 2, true);
      plate.holes.push(bore);
    }
    plate.holes.push(capsulePath(T, SLOT.left, SLOT.right, SLOT.y, SLOT.r));
    const geometry = new T.ExtrudeGeometry(plate, { depth: TOP - BOTTOM, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2, curveSegments: 48 });
    geometry.translate(0, 0, BOTTOM);
    const matte = new T.MeshStandardMaterial({ color: colors.body, metalness: 0, roughness: 0.98, emissive: 0xffed21, emissiveIntensity: 0.25, side: T.DoubleSide });
    const body = new T.Mesh(geometry, matte);
    group.add(body);
    const edge = new T.LineSegments(new T.EdgesGeometry(geometry, 34), new T.LineBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0.9 }));
    group.add(edge);
    // The extrusion's cut-wall normals face into the stock. Give the visible
    // inside of each through-bore its own light material so it reads as a wall.
    const boreWall = new T.MeshBasicMaterial({ color: 0xa87520, side: T.DoubleSide });
    const rim = new T.MeshBasicMaterial({ color: 0xfff0b3 });
    for (const [x, y, r] of [[HOLE.x, HOLE.y, HOLE.r], [-2.46, -0.98, 0.18], [2.48, 1.08, 0.18]]) {
      const inner = new T.Mesh(new T.CylinderGeometry(r - 0.008, r - 0.008, TOP - BOTTOM + 0.01, 64, 1, true), boreWall);
      inner.rotation.x = Math.PI / 2;
      inner.position.set(x, y, 0);
      group.add(inner);
      group.add(ring(T, x, y, TOP + 0.04, r, rim, false));
    }
    const boss = new T.Mesh(new T.CylinderGeometry(0.42, 0.47, 0.23, 48), matte);
    // CylinderGeometry grows along Y; rotate it to the plate's Z axis.
    boss.rotation.x = Math.PI / 2;
    boss.position.set(2.03, -0.94, TOP + 0.12);
    group.add(boss);
    const bossTop = ring(T, 2.03, -0.94, TOP + 0.24, 0.4, new T.MeshBasicMaterial({ color: 0xffefb0 }), false);
    group.add(bossTop);
    const pad = new T.Mesh(new T.BoxGeometry(PAD.width, PAD.depth, 0.13), new T.MeshStandardMaterial({ color: 0xffe85a, metalness: 0, roughness: 0.98, emissive: 0xffd824, emissiveIntensity: 0.15 }));
    pad.position.set(PAD.x, PAD.y, TOP + 0.065);
    group.add(pad);
    const padEdge = new T.LineSegments(new T.EdgesGeometry(pad.geometry), new T.LineBasicMaterial({ color: 0xffe99d, transparent: true, opacity: 0.8 }));
    padEdge.position.copy(pad.position);
    group.add(padEdge);
    const journal = new T.Mesh(new T.CylinderGeometry(SHAFT.lowerR, SHAFT.lowerR, SHAFT.lowerH, 64),
      new T.MeshStandardMaterial({ color: 0xf6de4b, metalness: 0, roughness: 0.98, emissive: 0xf0d51d, emissiveIntensity: 0.16 }));
    journal.rotation.x = Math.PI / 2;
    journal.position.set(SHAFT.x, SHAFT.y, TOP + SHAFT.lowerH / 2);
    group.add(journal);
    const upper = new T.Mesh(new T.CylinderGeometry(SHAFT.upperR, SHAFT.upperR, SHAFT.upperH, 64), matte);
    upper.rotation.x = Math.PI / 2;
    upper.position.set(SHAFT.x, SHAFT.y, TOP + SHAFT.lowerH + SHAFT.upperH / 2);
    group.add(upper);
    const shaftRim = new T.MeshBasicMaterial({ color: 0xfff5b0 });
    group.add(ring(T, SHAFT.x, SHAFT.y, TOP + SHAFT.lowerH + 0.012, SHAFT.lowerR, shaftRim, false));
    group.add(ring(T, SHAFT.x, SHAFT.y, TOP + SHAFT.lowerH + SHAFT.upperH + 0.012, SHAFT.upperR, shaftRim, false));
    const grid = new T.GridHelper(8, 16, colors.grid, colors.grid);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = BOTTOM - 0.13;
    grid.material.transparent = true;
    grid.material.opacity = 0.36;
    group.add(grid);
  }

  function createViewer(host) {
    if (!THREE || !host) return null;
    const T = THREE;
    let renderer;
    try { renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); }
    catch (error) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x10182d, 1);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.domElement.className = "gdt-three-canvas";
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Rotatable 3D plate with selected feature, datum planes, and tolerance zone");
    host.prepend(renderer.domElement);
    const scene = new T.Scene();
    scene.fog = new T.Fog(0x10182d, 16, 30);
    scene.add(new T.HemisphereLight(0xcfe9ff, 0x24304b, 1.4));
    const key = new T.DirectionalLight(0xffffff, 1.5);
    key.position.set(-3, -4, 8);
    scene.add(key);
    const rim = new T.DirectionalLight(0x8da9ff, 0.65);
    rim.position.set(4, 5, 3); scene.add(rim);
    const part = new T.Group(); scene.add(part); makePart(T, part);
    let overlay = new T.Group(); scene.add(overlay);
    let zoneMotion = new T.Group(), zoneContent = new T.Group();
    const zonePivot = new T.Vector3();
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.up.set(0, 0, 1);
    let azimuth = -2.25, elevation = 0.62, distance = 10.3, manualZoom = false, currentFeature = "hole";
    const center = new T.Vector3(0, 0, 0.1);
    function draw() {
      camera.position.set(center.x + distance * Math.cos(elevation) * Math.cos(azimuth), center.y + distance * Math.cos(elevation) * Math.sin(azimuth), center.z + distance * Math.sin(elevation));
      camera.lookAt(center);
      renderer.render(scene, camera);
    }
    function resize() {
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
      if (!manualZoom) distance = currentFeature === "shaft" ? (width / height > 1.8 ? 9.5 : 10.8) : (width / height > 1.8 ? 10.5 : 12.2);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    }
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(host);
    else window.addEventListener("resize", resize);

    const solid = new T.MeshBasicMaterial({ color: colors.feature, depthTest: true });
    const featurePlane = new T.MeshBasicMaterial({ color: colors.feature, transparent: true, opacity: 0.38, depthWrite: false, depthTest: true, side: T.DoubleSide });
    const zoneFill = new T.MeshBasicMaterial({ color: colors.zone, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide });
    const zoneLine = new T.MeshBasicMaterial({ color: colors.zone, depthTest: false });
    const ghostLine = new T.LineDashedMaterial({ color: 0xff6070, dashSize: 0.11, gapSize: 0.07, transparent: true, opacity: 0.92, depthTest: false });
    const dimensionInk = new T.MeshBasicMaterial({ color: 0xf0f7ff, depthTest: true });
    const dimensionGuide = new T.LineDashedMaterial({ color: 0xd3e4ef, dashSize: 0.09, gapSize: 0.06, transparent: true, opacity: 0.72, depthTest: true });
    const datumInk = new T.MeshBasicMaterial({ color: colors.datum, depthTest: false });
    function addDatum(letter, active, position, planeGeometry, rotation) {
      if (!active) { planeGeometry.dispose(); return; }
      const mat = new T.MeshBasicMaterial({ color: colors.datum, transparent: true, opacity: 0.34, depthWrite: false, side: T.DoubleSide });
      const plane = new T.Mesh(planeGeometry, mat);
      plane.position.copy(position); plane.rotation.copy(rotation);
      overlay.add(plane);
      const tag = label(T, letter, "#e4f3ff", "#174877");
      tag.position.copy(position);
      if (letter === "A") tag.position.set(-1.3, -2.18, BOTTOM - 0.02);
      if (letter === "B") tag.position.set(-3.25, 0.15, 0.02);
      if (letter === "C") tag.position.set(0.05, -2.04, 0.02);
      overlay.add(tag);
    }
    function addShaftDatum() {
      const journalSurface = new T.Mesh(new T.CylinderGeometry(SHAFT.lowerR + 0.014, SHAFT.lowerR + 0.014, SHAFT.lowerH + 0.02, 64, 1, true),
        new T.MeshBasicMaterial({ color: colors.datum, transparent: true, opacity: 0.28, depthWrite: false, side: T.DoubleSide }));
      journalSurface.rotation.x = Math.PI / 2;
      journalSurface.position.set(SHAFT.x, SHAFT.y, TOP + SHAFT.lowerH / 2);
      overlay.add(journalSurface);
      for (const z of [TOP + 0.008, TOP + SHAFT.lowerH + 0.015]) overlay.add(ring(T, SHAFT.x, SHAFT.y, z, SHAFT.lowerR + 0.016, datumInk, false));
      overlay.add(segment(T, new T.Vector3(SHAFT.x, SHAFT.y, TOP - 0.06),
        new T.Vector3(SHAFT.x, SHAFT.y, TOP + SHAFT.lowerH + SHAFT.upperH + 0.14), datumInk, 0.008));
      const tag = label(T, "D", "#e4f3ff", "#174877");
      tag.position.set(SHAFT.x - 0.73, SHAFT.y - 0.28, TOP + SHAFT.lowerH / 2);
      overlay.add(tag);
      overlay.add(segment(T,
        new T.Vector3(SHAFT.x - 0.53, SHAFT.y - 0.21, TOP + SHAFT.lowerH / 2),
        new T.Vector3(SHAFT.x - SHAFT.lowerR - 0.012, SHAFT.y, TOP + SHAFT.lowerH / 2), datumInk, 0.009));
    }
    function addDimension(a, b, value) {
      overlay.add(segment(T, a, b, dimensionInk, 0.008));
      const direction = new T.Vector3().subVectors(b, a).normalize();
      const wing = new T.Vector3(-direction.y, direction.x, 0).multiplyScalar(0.055);
      for (const [point, sign] of [[a, 1], [b, -1]]) {
        const inward = direction.clone().multiplyScalar(sign * 0.13);
        overlay.add(segment(T, point, point.clone().add(inward).add(wing), dimensionInk, 0.009));
        overlay.add(segment(T, point, point.clone().add(inward).sub(wing), dimensionInk, 0.009));
      }
      const boxed = label(T, value.toFixed(2), "#10253a", "#eef7ff");
      boxed.scale.set(0.82, 0.38, 1);
      boxed.position.copy(a).add(b).multiplyScalar(0.5);
      boxed.position.z += 0.09;
      overlay.add(boxed);
    }
    function addDimensionGuide(a, b) {
      const guide = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), dimensionGuide);
      guide.computeLineDistances();
      overlay.add(guide);
    }
    function addBasicDimensions(state) {
      if (state.control.id !== "position") return;
      const z = TOP + 0.32;
      if (state.feature === "hole") {
        if (state.datumRefs.includes("B")) {
          const y = 2.12;
          addDimension(new T.Vector3(-3, y, z), new T.Vector3(HOLE.x, y, z), HOLE.x + 3);
          addDimensionGuide(new T.Vector3(-3, 1.8, z), new T.Vector3(-3, y + 0.08, z));
          addDimensionGuide(new T.Vector3(HOLE.x, HOLE.y, z), new T.Vector3(HOLE.x, y + 0.08, z));
        }
        if (state.datumRefs.includes("C")) {
          const x = 3.36;
          addDimension(new T.Vector3(x, -1.8, z), new T.Vector3(x, HOLE.y, z), HOLE.y + 1.8);
          addDimensionGuide(new T.Vector3(3, -1.8, z), new T.Vector3(x + 0.08, -1.8, z));
          addDimensionGuide(new T.Vector3(HOLE.x, HOLE.y, z), new T.Vector3(x + 0.08, HOLE.y, z));
        }
      } else if (state.feature === "slot" && state.datumRefs.includes("C")) {
        const x = -0.25;
        addDimension(new T.Vector3(x, -1.8, z), new T.Vector3(x, SLOT.y, z), SLOT.y + 1.8);
        addDimensionGuide(new T.Vector3(SLOT.right, SLOT.y, z), new T.Vector3(x + 0.08, SLOT.y, z));
      }
    }
    function axisZone(x, y, width) {
      const radius = 0.06 + width * 0.22;
      const cylinder = new T.Mesh(new T.CylinderGeometry(radius, radius, 1.4, 48, 1, true), zoneFill);
      cylinder.rotation.x = Math.PI / 2;
      cylinder.position.set(x, y, 0.13);
      zoneContent.add(cylinder);
      for (const z of [-0.57, 0.78]) zoneContent.add(ring(T, x, y, z, radius, zoneLine, false));
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const xx = x + radius * Math.cos(a), yy = y + radius * Math.sin(a);
        zoneContent.add(segment(T, new T.Vector3(xx, yy, -0.57), new T.Vector3(xx, yy, 0.78), zoneLine, 0.008));
      }
    }
    function slotOutline(z, spread, material, parent) {
      const pts = [];
      const r = SLOT.r + spread;
      for (let i = 0; i <= 18; i++) {
        const a = Math.PI / 2 - i * Math.PI / 18;
        pts.push(new T.Vector3(SLOT.right + r * Math.cos(a), SLOT.y + r * Math.sin(a), z));
      }
      for (let i = 0; i <= 18; i++) {
        const a = -Math.PI / 2 - i * Math.PI / 18;
        pts.push(new T.Vector3(SLOT.left + r * Math.cos(a), SLOT.y + r * Math.sin(a), z));
      }
      parent.add(tube(T, pts, 0.015, material, true));
    }
    function addZone(state) {
      const t = state.tolerance;
      const kind = state.zone.kind;
      if (state.feature === "shaft") {
        addShaftDatum();
        const z0 = TOP + SHAFT.lowerH, z1 = z0 + SHAFT.upperH;
        const selected = new T.Mesh(new T.CylinderGeometry(SHAFT.upperR + 0.008, SHAFT.upperR + 0.008, SHAFT.upperH + 0.014, 64, 1, true), featurePlane);
        selected.rotation.x = Math.PI / 2;
        selected.position.set(SHAFT.x, SHAFT.y, (z0 + z1) / 2);
        overlay.add(selected);
        overlay.add(ring(T, SHAFT.x, SHAFT.y, z1 + 0.018, SHAFT.upperR + 0.012, solid, false));
        // Radial spacing is visually enlarged; the pair of coaxial boundaries
        // may float in radius within the size limits, rather than being fixed
        // to the nominal shaft diameter.
        const band = 0.035 + t * 0.9;
        const inner = SHAFT.upperR - band / 2, outer = SHAFT.upperR + band / 2;
        if (kind === "runout-section") {
          const z = z0 + 0.08 + Math.max(0, Math.min(1, state.station == null ? 0.5 : state.station)) * (SHAFT.upperH - 0.16);
          const slice = new T.Mesh(new T.RingGeometry(inner, outer, 64), zoneFill);
          slice.position.set(SHAFT.x, SHAFT.y, z);
          zoneContent.add(slice);
          for (const radius of [inner, outer]) zoneContent.add(ring(T, SHAFT.x, SHAFT.y, z, radius, zoneLine, false));
        } else {
          for (const radius of [inner, outer]) {
            const boundary = new T.Mesh(new T.CylinderGeometry(radius, radius, SHAFT.upperH + 0.025, 64, 1, true), zoneFill);
            boundary.rotation.x = Math.PI / 2;
            boundary.position.set(SHAFT.x, SHAFT.y, (z0 + z1) / 2);
            zoneContent.add(boundary);
            for (const z of [z0 - 0.015, z1 + 0.015]) zoneContent.add(ring(T, SHAFT.x, SHAFT.y, z, radius, zoneLine, false));
          }
          for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
            const x = SHAFT.x + outer * Math.cos(angle), y = SHAFT.y + outer * Math.sin(angle);
            zoneContent.add(segment(T, new T.Vector3(x, y, z0 - 0.015), new T.Vector3(x, y, z1 + 0.015), zoneLine, 0.007));
          }
        }
        return;
      }
      if (state.feature === "hole") {
        // A translucent annular plane identifies the selected bore and a small
        // margin of its top face without obscuring the open hole or its wall.
        const boreHighlight = new T.Mesh(new T.RingGeometry(HOLE.r, HOLE.r + 0.25, 64), featurePlane);
        boreHighlight.position.set(HOLE.x, HOLE.y, TOP + 0.045);
        overlay.add(boreHighlight);
        if (kind === "annulus" || kind === "cylinder-shell") {
          const spread = 0.05 + t * 0.23;
          for (const z of kind === "annulus" ? [TOP + 0.10] : [BOTTOM - 0.08, TOP + 0.1]) {
            zoneContent.add(ring(T, HOLE.x, HOLE.y, z, HOLE.r - spread, zoneLine, false));
            zoneContent.add(ring(T, HOLE.x, HOLE.y, z, HOLE.r + spread, zoneLine, false));
          }
          if (kind === "cylinder-shell") {
            for (const r of [HOLE.r - spread, HOLE.r + spread]) {
              const shell = new T.Mesh(new T.CylinderGeometry(r, r, 0.82, 48, 1, true), zoneFill);
              shell.rotation.x = Math.PI / 2; shell.position.set(HOLE.x, HOLE.y, 0); zoneContent.add(shell);
            }
          }
        } else {
          axisZone(HOLE.x, HOLE.y, t);
          const axis = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(HOLE.x, HOLE.y, -0.56), new T.Vector3(HOLE.x, HOLE.y, 1.0)]), ghostLine);
          axis.computeLineDistances(); overlay.add(axis);
        }
      } else if (state.feature === "slot") {
        slotOutline(TOP + 0.06, 0, solid, overlay);
        if (kind === "slot-contour" || kind === "slot-walls") {
          slotOutline(TOP + 0.11, 0.05 + t * 0.17, zoneLine, zoneContent);
          slotOutline(TOP + 0.11, -Math.min(0.17, 0.05 + t * 0.13), zoneLine, zoneContent);
          if (kind === "slot-walls") slotOutline(BOTTOM - 0.05, 0.05 + t * 0.17, zoneLine, zoneContent);
        } else if (kind === "line-band") {
          const gap = 0.035 + t * 0.16;
          for (const y of [SLOT.y - gap, SLOT.y + gap]) {
            zoneContent.add(segment(T, new T.Vector3(SLOT.left, y, TOP + 0.22), new T.Vector3(SLOT.right, y, TOP + 0.22), zoneLine, 0.012));
          }
        } else {
          const gap = 0.08 + t * 0.25;
          for (const y of [SLOT.y - gap, SLOT.y + gap]) {
            const plane = new T.Mesh(new T.PlaneGeometry(1.8, 1.2), zoneFill);
            plane.rotation.x = Math.PI / 2;
            plane.position.set(-1.3, y, 0.09);
            zoneContent.add(plane);
            zoneContent.add(segment(T, new T.Vector3(-2.15, y, 0.72), new T.Vector3(-0.45, y, 0.72), zoneLine, 0.009));
          }
        }
      } else {
        const halfX = PAD.width / 2, halfY = PAD.depth / 2;
        const corners = [
          new T.Vector3(PAD.x - halfX, PAD.y - halfY, PAD.top + 0.01),
          new T.Vector3(PAD.x + halfX, PAD.y - halfY, PAD.top + 0.01),
          new T.Vector3(PAD.x + halfX, PAD.y + halfY, PAD.top + 0.01),
          new T.Vector3(PAD.x - halfX, PAD.y + halfY, PAD.top + 0.01)
        ];
        rectangularFrame(T, corners, solid, 0.018, overlay);
        const spread = 0.035 + t * 0.19;
        if (kind === "profile-line") {
          for (const z of [PAD.top - spread, PAD.top + spread]) {
            zoneContent.add(segment(T, new T.Vector3(PAD.x - halfX, PAD.y, z), new T.Vector3(PAD.x + halfX, PAD.y, z), zoneLine, 0.013));
          }
        } else {
          for (const z of [PAD.top - spread, PAD.top + spread]) {
            const sheet = new T.Mesh(new T.PlaneGeometry(PAD.width + 0.13, PAD.depth + 0.13), zoneFill);
            sheet.position.set(PAD.x, PAD.y, z);
            zoneContent.add(sheet);
            const edgePoints = corners.map(function (point) { return new T.Vector3(point.x, point.y, z); });
            rectangularFrame(T, edgePoints, zoneLine, 0.012, zoneContent);
          }
        }
      }
    }
    function disposeGroup(group) {
      group.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material && obj.material !== solid && obj.material !== featurePlane && obj.material !== zoneFill && obj.material !== zoneLine && obj.material !== ghostLine && obj.material !== dimensionInk && obj.material !== dimensionGuide && obj.material !== datumInk) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      scene.remove(group);
    }
    function update(state) {
      currentFeature = state.feature;
      center.set(state.feature === "shaft" ? -0.34 : 0, state.feature === "shaft" ? -0.28 : 0, state.feature === "shaft" ? 0.2 : 0.1);
      if (!manualZoom) distance = state.feature === "shaft" ? (host.clientWidth / Math.max(1, host.clientHeight) > 1.8 ? 9.5 : 10.8) :
        (host.clientWidth / Math.max(1, host.clientHeight) > 1.8 ? 10.5 : 12.2);
      disposeGroup(overlay);
      overlay = new T.Group(); scene.add(overlay);
      zoneMotion = new T.Group();
      zoneContent = new T.Group();
      zonePivot.set(state.feature === "hole" ? HOLE.x : state.feature === "slot" ? (SLOT.left + SLOT.right) / 2 : state.feature === "shaft" ? SHAFT.x : PAD.x,
        state.feature === "hole" ? HOLE.y : state.feature === "slot" ? SLOT.y : state.feature === "shaft" ? SHAFT.y : PAD.y,
        state.feature === "surface" ? PAD.top : state.feature === "shaft" ? TOP + SHAFT.lowerH + SHAFT.upperH / 2 : 0.1);
      zoneContent.position.copy(zonePivot).multiplyScalar(-1);
      zoneMotion.add(zoneContent);
      overlay.add(zoneMotion);
      addDatum("A", state.datumRefs.includes("A"), new T.Vector3(0, 0, BOTTOM - 0.045), new T.PlaneGeometry(7.2, 4.8), new T.Euler());
      addDatum("B", state.datumRefs.includes("B"), new T.Vector3(-3.045, 0, 0), new T.PlaneGeometry(TOP - BOTTOM + 0.44, 4.04), new T.Euler(0, Math.PI / 2, 0));
      addDatum("C", state.datumRefs.includes("C"), new T.Vector3(0, -1.845, 0), new T.PlaneGeometry(6.44, TOP - BOTTOM + 0.44), new T.Euler(Math.PI / 2, 0, 0));
      addZone(state);
      addBasicDimensions(state);
      setMotion(state.motion);
    }
    function setMotion(motion) {
      const m = motion || {};
      zoneMotion.position.set(zonePivot.x + (m.tx || 0), zonePivot.y + (m.ty || 0), zonePivot.z + (m.tz || 0));
      zoneMotion.rotation.set((m.rx || 0) * Math.PI / 180, (m.ry || 0) * Math.PI / 180, (m.rz || 0) * Math.PI / 180, "XYZ");
      draw();
    }
    let drag = null, pinch = null;
    const pointers = new Map();
    const canvas = renderer.domElement;
    function pointerGap() {
      const pair = [...pointers.values()];
      return Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
    }
    canvas.addEventListener("pointerdown", function (event) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 2) { pinch = { gap: pointerGap(), distance }; drag = null; }
      else if (pointers.size === 1) drag = { x: event.clientX, y: event.clientY, azimuth, elevation };
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinch) {
        manualZoom = true;
        distance = Math.max(6, Math.min(18, pinch.distance * pinch.gap / Math.max(8, pointerGap())));
        draw();
        return;
      }
      if (!drag) return;
      azimuth = drag.azimuth - (event.clientX - drag.x) * 0.006;
      elevation = Math.max(-1.35, Math.min(1.35, drag.elevation + (event.clientY - drag.y) * 0.006));
      draw();
    });
    function release(event) {
      pointers.delete(event.pointerId);
      pinch = null;
      const one = [...pointers.values()][0];
      drag = one ? { x: one.x, y: one.y, azimuth, elevation } : null;
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("wheel", function (event) { event.preventDefault(); manualZoom = true; distance = Math.max(6.0, Math.min(18, distance * (event.deltaY > 0 ? 1.08 : 0.92))); draw(); }, { passive: false });
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") azimuth -= 0.12;
      else if (event.key === "ArrowRight") azimuth += 0.12;
      else if (event.key === "ArrowUp") elevation = Math.min(1.35, elevation + 0.12);
      else if (event.key === "ArrowDown") elevation = Math.max(-1.35, elevation - 0.12);
      else if (event.key === "+" || event.key === "=") { manualZoom = true; distance = Math.max(6, distance * 0.9); }
      else if (event.key === "-" || event.key === "_") { manualZoom = true; distance = Math.min(18, distance * 1.1); }
      else return;
      event.preventDefault(); draw();
    });
    function resetView() { azimuth = -2.25; elevation = 0.62; manualZoom = false; resize(); }
    function bottomView() { azimuth = -2.25; elevation = -0.86; manualZoom = false; resize(); }
    resize();
    return { update, setMotion, resize, resetView, bottomView, dispose: function () { if (ro) ro.disconnect(); disposeGroup(overlay); renderer.dispose(); canvas.remove(); } };
  }

  return { createViewer, geometry: { HOLE, SLOT, SHAFT, TOP, BOTTOM } };
});
