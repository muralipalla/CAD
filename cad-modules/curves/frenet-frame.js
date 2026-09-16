(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FrenetFrame = api;
  if (root && root.document) {
    const start = function () { api.mountAll(root.document); };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const TAU = Math.PI * 2;
  const DOMAIN_START = -3 * Math.PI;
  const DOMAIN_END = 3 * Math.PI;

  function finite(value, name) {
    if (!Number.isFinite(value)) throw new RangeError(name + " must be a finite number.");
    return value;
  }

  function dot(a, b) {
    return a.reduce(function (sum, value, index) { return sum + value * b[index]; }, 0);
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function magnitude(vector) {
    return Math.sqrt(dot(vector, vector));
  }

  function spiralFrame(startRadius, endRadius, pitch, parameter, start, end) {
    finite(startRadius, "startRadius");
    finite(endRadius, "endRadius");
    finite(pitch, "pitch");
    finite(parameter, "parameter");
    start = start === undefined ? DOMAIN_START : finite(start, "start");
    end = end === undefined ? DOMAIN_END : finite(end, "end");
    if (startRadius < 0 || endRadius < 0) throw new RangeError("spiral radii cannot be negative.");
    if (end <= start) throw new RangeError("end must be greater than start.");
    if (parameter < start - 1e-12 || parameter > end + 1e-12) throw new RangeError("parameter must lie inside the spiral domain.");

    const radialRate = (endRadius - startRadius) / (end - start);
    const radius = startRadius + radialRate * (parameter - start);
    const h = pitch / TAU;
    const cosine = Math.cos(parameter);
    const sine = Math.sin(parameter);
    const point = [radius * cosine, radius * sine, h * parameter];
    const velocity = [
      radialRate * cosine - radius * sine,
      radialRate * sine + radius * cosine,
      h
    ];
    const acceleration = [
      -2 * radialRate * sine - radius * cosine,
      2 * radialRate * cosine - radius * sine,
      0
    ];
    const jerk = [
      -3 * radialRate * cosine + radius * sine,
      -3 * radialRate * sine - radius * cosine,
      0
    ];
    const speed = magnitude(velocity);
    const velocityCrossAcceleration = cross(velocity, acceleration);
    const crossLength = magnitude(velocityCrossAcceleration);
    if (speed <= 1e-12 || crossLength <= 1e-12 * Math.max(1, speed * speed)) {
      throw new RangeError("the Frenet frame is undefined for this degenerate spiral.");
    }
    const tangent = velocity.map(function (value) { return value / speed; });
    const binormal = velocityCrossAcceleration.map(function (value) { return value / crossLength; });
    const normal = cross(binormal, tangent);
    const curvature = crossLength / Math.pow(speed, 3);
    const torsion = dot(velocityCrossAcceleration, jerk) / (crossLength * crossLength);
    const circleRadius = 1 / curvature;
    const center = point.map(function (value, index) { return value + circleRadius * normal[index]; });

    return {
      point,
      tangent,
      normal,
      binormal,
      curvature,
      torsion,
      circleRadius,
      center,
      radius,
      radialRate,
      velocity,
      acceleration,
      jerk
    };
  }

  function osculatingCirclePoint(startRadius, endRadius, pitch, parameter, angle, start, end) {
    finite(angle, "angle");
    const frame = spiralFrame(startRadius, endRadius, pitch, parameter, start, end);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return frame.center.map(function (value, index) {
      return value + frame.circleRadius * (-cosine * frame.normal[index] + sine * frame.tangent[index]);
    });
  }

  function sampleSpiral(startRadius, endRadius, pitch, start, end, count) {
    start = start === undefined ? DOMAIN_START : finite(start, "start");
    end = end === undefined ? DOMAIN_END : finite(end, "end");
    count = count === undefined ? 241 : count;
    if (!Number.isInteger(count) || count < 2) throw new RangeError("count must be an integer of at least two.");
    if (end <= start) throw new RangeError("end must be greater than start.");
    return Array.from({ length: count }, function (_, index) {
      const parameter = start + (end - start) * index / (count - 1);
      return spiralFrame(startRadius, endRadius, pitch, parameter, start, end).point;
    });
  }

  function helixFrame(radius, pitch, parameter) {
    return spiralFrame(radius, radius, pitch, parameter);
  }

  function sampleHelix(radius, pitch, start, end, count) {
    return sampleSpiral(radius, radius, pitch, start, end, count);
  }

  function createViewer(canvas, fallback) {
    const T = typeof window !== "undefined" ? window.THREE : null;
    const unavailable = { available: false, update: function () {}, reset: function () {}, dispose: function () {} };
    function fail(message) {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = message || "3D graphics are unavailable. Enable WebGL or try another browser; the controls and equations remain available.";
      }
      canvas.tabIndex = -1;
      return unavailable;
    }
    if (!T) return fail();

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (_) {
      return fail();
    }
    if (fallback) fallback.hidden = true;

    const scene = new T.Scene();
    scene.background = new T.Color(0x10182d);
    const camera = new T.OrthographicCamera(-4, 4, 4, -4, 0.01, 1000);
    scene.add(new T.AmbientLight(0xc9e7ff, 1.0));
    const key = new T.DirectionalLight(0xffffff, 1.25);
    key.position.set(5, 8, 7);
    scene.add(key);
    const fill = new T.DirectionalLight(0x7e8cff, 0.55);
    fill.position.set(-6, -2, -5);
    scene.add(fill);

    const colors = {
      curve: 0x64d7ff,
      tangent: 0xff7868,
      normal: 0x7ce8b2,
      binormal: 0xbba5ff,
      circle: 0xffd76a,
      point: 0xffffff,
      axis: 0x7f8da9
    };
    const curveGroup = new T.Group();
    const frameGroup = new T.Group();
    const labelTextures = new Map();
    scene.add(curveGroup, frameGroup);
    const events = [];
    const pointers = new Map();
    const worldUp = new T.Vector3(0, 0, 1);
    let pointerPair = [];
    let lastPinchDistance = 0;
    let lastStartRadius = NaN;
    let lastEndRadius = NaN;
    let lastPitch = NaN;
    let fitPoints = [];
    let center = new T.Vector3();
    let span = 4;
    let zoomLevel = 1;
    let azimuth = -0.86;
    let elevation = 0.34;
    let disposed = false;
    let contextLost = false;
    let framePending = false;
    let animationId = 0;

    const vec = function (point) { return new T.Vector3(point[0], point[1], point[2]); };
    const clamp = function (value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); };
    const plus = function (point, direction, scale) {
      return point.map(function (value, index) { return value + direction[index] * scale; });
    };

    function on(name, listener, options) {
      canvas.addEventListener(name, listener, options);
      events.push([name, listener, options]);
    }

    function clear(group) {
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      group.traverse(function (object) {
        if (object.geometry) geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.filter(Boolean).forEach(function (material) {
          materials.add(material);
          if (material.map && !material.map.userData.frenetPersistent) textures.add(material.map);
        });
      });
      geometries.forEach(function (geometry) { geometry.dispose(); });
      textures.forEach(function (texture) { texture.dispose(); });
      materials.forEach(function (material) { material.dispose(); });
      group.clear();
    }

    function addLine(points, color, group, dashed, overlay) {
      const geometry = new T.BufferGeometry().setFromPoints(points.map(vec));
      const settings = { color: color, depthTest: !overlay, depthWrite: false, transparent: true, opacity: 0.8 };
      const material = dashed
        ? new T.LineDashedMaterial(Object.assign({}, settings, { dashSize: span * 0.025, gapSize: span * 0.018 }))
        : new T.LineBasicMaterial(settings);
      const object = new T.Line(geometry, material);
      if (dashed) object.computeLineDistances();
      if (overlay) object.renderOrder = 12;
      group.add(object);
      return object;
    }

    function addTube(points, closed, radius, color, group, opacity) {
      const path = new T.CatmullRomCurve3(points.map(vec), closed, "centripetal");
      const geometry = new T.TubeGeometry(path, closed ? 160 : 360, radius, 8, closed);
      const material = new T.MeshPhongMaterial({
        color: color,
        emissive: new T.Color(color).multiplyScalar(0.12),
        shininess: 52,
        transparent: opacity < 1,
        opacity: opacity,
        depthWrite: opacity >= 1
      });
      const object = new T.Mesh(geometry, material);
      group.add(object);
      return object;
    }

    function addArrow(point, direction, length, color) {
      const object = new T.ArrowHelper(vec(direction).normalize(), vec(point), length, color, length * 0.2, length * 0.09);
      object.traverse(function (child) {
        if (!child.material) return;
        child.material.depthTest = false;
        child.material.depthWrite = false;
        child.renderOrder = 16;
      });
      frameGroup.add(object);
      return object;
    }

    function addLabel(text, anchor, from, color) {
      let map = labelTextures.get(text);
      if (!map) {
        const image = document.createElement("canvas");
        image.width = 64;
        image.height = 48;
        const context = image.getContext("2d");
        context.fillStyle = "rgba(16,24,45,.92)";
        context.fillRect(0, 0, image.width, image.height);
        context.fillStyle = "#" + color.toString(16).padStart(6, "0");
        context.font = "700 30px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, 32, 24);
        map = new T.CanvasTexture(image);
        map.userData.frenetPersistent = true;
        if (T.SRGBColorSpace) map.colorSpace = T.SRGBColorSpace;
        else if (T.sRGBEncoding) map.encoding = T.sRGBEncoding;
        labelTextures.set(text, map);
      }
      const material = new T.SpriteMaterial({ map: map, depthTest: false, depthWrite: false });
      const sprite = new T.Sprite(material);
      sprite.renderOrder = 24;
      sprite.userData = { label: true, anchor: vec(anchor), from: vec(from) };
      frameGroup.add(sprite);
      return sprite;
    }

    function arrowLengthFor(frame, startRadius, endRadius) {
      return clamp(frame.circleRadius * 0.48 + Math.max(startRadius, endRadius) * 0.12, 0.62, 1.35);
    }

    function buildFitPoints(startRadius, endRadius, pitch) {
      const points = sampleSpiral(startRadius, endRadius, pitch);
      for (let sample = 0; sample <= 24; sample++) {
        const parameter = DOMAIN_START + (DOMAIN_END - DOMAIN_START) * sample / 24;
        const frame = spiralFrame(startRadius, endRadius, pitch, parameter);
        for (let index = 0; index < 32; index++) {
          points.push(osculatingCirclePoint(startRadius, endRadius, pitch, parameter, TAU * index / 32));
        }
        const arrowLength = arrowLengthFor(frame, startRadius, endRadius);
        points.push(plus(frame.point, frame.tangent, arrowLength));
        points.push(plus(frame.point, frame.normal, arrowLength));
        points.push(plus(frame.point, frame.binormal, arrowLength));
      }
      const h = pitch / TAU;
      const axisHalfLength = Math.max(Math.abs(h) * 3 * Math.PI + Math.max(startRadius, endRadius) * 0.2, Math.max(startRadius, endRadius) * 0.72);
      points.push([0, 0, -axisHalfLength], [0, 0, axisHalfLength]);
      return points;
    }

    function rebuildCurve(startRadius, endRadius, pitch) {
      clear(curveGroup);
      fitPoints = buildFitPoints(startRadius, endRadius, pitch);
      const box = new T.Box3().setFromPoints(fitPoints.map(vec));
      box.getCenter(center);
      const size = box.getSize(new T.Vector3());
      span = Math.max(size.x, size.y, size.z, 0.5);
      const tubeRadius = clamp(span * 0.0065, 0.026, 0.065);
      addTube(sampleSpiral(startRadius, endRadius, pitch), false, tubeRadius, colors.curve, curveGroup, 1);

      const h = pitch / TAU;
      const halfHeight = Math.max(Math.abs(h) * 3 * Math.PI + tubeRadius * 5, Math.max(startRadius, endRadius) * 0.72);
      addLine([[0, 0, -halfHeight], [0, 0, halfHeight]], colors.axis, curveGroup, true, false);
      zoomLevel = 1;
    }

    function rebuildFrame(startRadius, endRadius, pitch, parameter) {
      clear(frameGroup);
      const frame = spiralFrame(startRadius, endRadius, pitch, parameter);
      const arrowLength = arrowLengthFor(frame, startRadius, endRadius);
      const circleTube = clamp(span * 0.0052, 0.022, 0.052);
      const circlePoints = Array.from({ length: 128 }, function (_, index) {
        return osculatingCirclePoint(startRadius, endRadius, pitch, parameter, TAU * index / 128);
      });

      const disk = new T.Mesh(
        new T.CircleGeometry(frame.circleRadius, 96),
        new T.MeshBasicMaterial({ color: colors.circle, side: T.DoubleSide, transparent: true, opacity: 0.08, depthWrite: false })
      );
      disk.position.copy(vec(frame.center));
      disk.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), vec(frame.binormal).normalize());
      disk.renderOrder = 1;
      frameGroup.add(disk);
      addTube(circlePoints, true, circleTube, colors.circle, frameGroup, 0.96);
      addLine([frame.point, frame.center], colors.circle, frameGroup, true, true);

      const halo = new T.Mesh(
        new T.SphereGeometry(arrowLength * 0.085, 20, 14),
        new T.MeshBasicMaterial({ color: 0x10182d, depthTest: false, depthWrite: false })
      );
      const marker = new T.Mesh(
        new T.SphereGeometry(arrowLength * 0.055, 20, 14),
        new T.MeshBasicMaterial({ color: colors.point, depthTest: false, depthWrite: false })
      );
      halo.position.copy(vec(frame.point));
      marker.position.copy(vec(frame.point));
      halo.renderOrder = 18;
      marker.renderOrder = 19;
      frameGroup.add(halo, marker);

      [
        ["T", frame.tangent, colors.tangent],
        ["N", frame.normal, colors.normal],
        ["B", frame.binormal, colors.binormal]
      ].forEach(function (entry) {
        addArrow(frame.point, entry[1], arrowLength, entry[2]);
        addLabel(entry[0], plus(frame.point, entry[1], arrowLength), frame.point, entry[2]);
      });
    }

    function requestRender() {
      if (framePending || disposed) return;
      framePending = true;
      animationId = window.requestAnimationFrame(render);
    }

    function render() {
      framePending = false;
      if (disposed || contextLost || !fitPoints.length) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      const cosine = Math.cos(elevation);
      const direction = new T.Vector3(cosine * Math.cos(azimuth), cosine * Math.sin(azimuth), Math.sin(elevation));
      camera.up.copy(worldUp);
      camera.position.copy(center).addScaledVector(direction, span * 4);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let halfWidth = 0;
      let halfHeight = 0;
      fitPoints.forEach(function (point) {
        const offset = vec(point).sub(center);
        halfWidth = Math.max(halfWidth, Math.abs(offset.dot(right)));
        halfHeight = Math.max(halfHeight, Math.abs(offset.dot(up)));
      });
      const aspect = width / height;
      const margin = Math.max(span * 0.075, 0.18);
      const extent = Math.max(halfHeight + margin, (halfWidth + margin) / aspect, 0.25) * 1.04 / zoomLevel;
      camera.left = -extent * aspect;
      camera.right = extent * aspect;
      camera.top = extent;
      camera.bottom = -extent;
      camera.near = Math.max(span * 0.001, 0.0001);
      camera.far = Math.max(span * 12, 20);
      camera.updateProjectionMatrix();

      const pixelUnit = extent * 2 / height;
      const placed = [];
      frameGroup.children.forEach(function (object) {
        const data = object.userData;
        if (!data || !data.label) return;
        const anchor = data.anchor.clone().sub(center);
        const from = data.from.clone().sub(center);
        const x = anchor.dot(right) / pixelUnit;
        const y = anchor.dot(up) / pixelUnit;
        const dx = x - from.dot(right) / pixelUnit;
        const dy = y - from.dot(up) / pixelUnit;
        const distance = Math.hypot(dx, dy);
        let offsetX = distance > 2 ? dx / distance * 21 : 16;
        let offsetY = distance > 2 ? dy / distance * 21 : 16;
        for (let attempt = 0; attempt < 5; attempt++) {
          if (!placed.some(function (position) { return Math.abs(x + offsetX - position[0]) < 30 && Math.abs(y + offsetY - position[1]) < 24; })) break;
          offsetY += 24;
        }
        const screenX = clamp(x + offsetX, -width / 2 + 18, width / 2 - 18);
        const screenY = clamp(y + offsetY, -height / 2 + 15, height / 2 - 15);
        placed.push([screenX, screenY]);
        object.scale.set(28 * pixelUnit, 21 * pixelUnit, 1);
        object.position.copy(data.anchor)
          .addScaledVector(right, (screenX - x) * pixelUnit)
          .addScaledVector(up, (screenY - y) * pixelUnit);
      });
      renderer.render(scene, camera);
    }

    function resize() {
      if (disposed || contextLost || !canvas.clientWidth || !canvas.clientHeight) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      requestRender();
    }

    function zoom(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      zoomLevel = clamp(zoomLevel / factor, 0.5, 5);
      requestRender();
    }

    function reset() {
      azimuth = -0.86;
      elevation = 0.34;
      zoomLevel = 1;
      requestRender();
    }

    function syncPinch() {
      const touchIds = Array.from(pointers.keys()).filter(function (id) { return pointers.get(id).type === "touch"; });
      if (touchIds.length < 2) {
        pointerPair = [];
        lastPinchDistance = 0;
        return;
      }
      if (pointerPair.length !== 2 || !pointerPair.every(function (id) { return touchIds.includes(id); })) pointerPair = touchIds.slice(0, 2);
      const first = pointers.get(pointerPair[0]);
      const second = pointers.get(pointerPair[1]);
      lastPinchDistance = Math.hypot(first.x - second.x, first.y - second.y);
    }

    on("pointerdown", function (event) {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
      canvas.setPointerCapture(event.pointerId);
      syncPinch();
    });
    on("pointermove", function (event) {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: previous.type });
      if (pointerPair.length === 2) {
        if (!pointerPair.includes(event.pointerId)) return;
        const first = pointers.get(pointerPair[0]);
        const second = pointers.get(pointerPair[1]);
        const distance = Math.hypot(first.x - second.x, first.y - second.y);
        if (lastPinchDistance > 0 && distance > 0) zoom(lastPinchDistance / distance);
        lastPinchDistance = distance;
        return;
      }
      azimuth -= dx * 0.008;
      elevation = clamp(elevation + dy * 0.008, -1.42, 1.42);
      requestRender();
    });
    function stopPointer(event) {
      if (!pointers.delete(event.pointerId)) return;
      syncPinch();
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    on("pointerup", stopPointer);
    on("pointercancel", stopPointer);
    on("lostpointercapture", stopPointer);
    on("wheel", function (event) {
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      const rate = event.ctrlKey || event.metaKey ? 0.008 : 0.002;
      zoom(Math.exp(clamp(event.deltaY * multiplier, -200, 200) * rate));
    }, { passive: false });
    on("keydown", function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") return reset();
      if (event.key === "+" || event.key === "=") return zoom(0.84);
      if (event.key === "-") return zoom(1.18);
      if (event.key === "ArrowLeft") azimuth -= 0.12;
      if (event.key === "ArrowRight") azimuth += 0.12;
      if (event.key === "ArrowUp") elevation += 0.1;
      if (event.key === "ArrowDown") elevation -= 0.1;
      elevation = clamp(elevation, -1.42, 1.42);
      requestRender();
    });
    on("webglcontextlost", function (event) {
      event.preventDefault();
      contextLost = true;
      fail("The 3D graphics connection was interrupted. Reload the page to restore it; the controls and equations remain available.");
    });
    on("webglcontextrestored", function () {
      contextLost = false;
      if (fallback) fallback.hidden = true;
      resize();
    });

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    else window.addEventListener("resize", resize);
    resize();

    return {
      available: true,
      update: function (startRadius, endRadius, pitch, parameter) {
        if (disposed) return;
        const shapeChanged = startRadius !== lastStartRadius || endRadius !== lastEndRadius || pitch !== lastPitch;
        if (shapeChanged) {
          rebuildCurve(startRadius, endRadius, pitch);
          lastStartRadius = startRadius;
          lastEndRadius = endRadius;
          lastPitch = pitch;
        }
        rebuildFrame(startRadius, endRadius, pitch, parameter);
        requestRender();
      },
      reset: reset,
      dispose: function () {
        if (disposed) return;
        disposed = true;
        window.cancelAnimationFrame(animationId);
        if (observer) observer.disconnect();
        else window.removeEventListener("resize", resize);
        events.forEach(function (entry) { canvas.removeEventListener(entry[0], entry[1], entry[2]); });
        pointers.clear();
        clear(curveGroup);
        clear(frameGroup);
        labelTextures.forEach(function (texture) { texture.dispose(); });
        labelTextures.clear();
        renderer.dispose();
      }
    };
  }

  function mount(lab) {
    if (!lab || lab.dataset.frenetMounted === "true") return null;
    const startRadiusInput = lab.querySelector("[data-start-radius]");
    const endRadiusInput = lab.querySelector("[data-end-radius]");
    const pitchInput = lab.querySelector("[data-pitch]");
    const positionInput = lab.querySelector("[data-position]");
    const canvas = lab.querySelector("[data-frenet-canvas]");
    if (!startRadiusInput || !endRadiusInput || !pitchInput || !positionInput || !canvas) return null;

    lab.dataset.frenetMounted = "true";
    const outputs = {
      startRadius: lab.querySelector("[data-start-radius-output]"),
      endRadius: lab.querySelector("[data-end-radius-output]"),
      pitch: lab.querySelector("[data-pitch-output]"),
      position: lab.querySelector("[data-position-output]"),
      curvature: lab.querySelector("[data-curvature]"),
      torsion: lab.querySelector("[data-torsion]"),
      circleRadius: lab.querySelector("[data-circle-radius]"),
      status: lab.querySelector("[data-frenet-status]")
    };
    const viewer = createViewer(canvas, lab.querySelector("[data-frenet-fallback]"));
    let pendingUpdate = 0;
    let pendingAnnouncement = false;

    function clean(value, digits) {
      const rounded = Math.abs(value) < Math.pow(10, -digits) / 2 ? 0 : value;
      return rounded.toFixed(digits);
    }

    function applyUpdate(announce) {
      const startRadius = Number(startRadiusInput.value);
      const endRadius = Number(endRadiusInput.value);
      const pitch = Number(pitchInput.value);
      const degrees = Number(positionInput.value);
      const parameter = degrees * Math.PI / 180;
      const frame = spiralFrame(startRadius, endRadius, pitch, parameter);
      outputs.startRadius.value = clean(startRadius, 2);
      outputs.endRadius.value = clean(endRadius, 2);
      outputs.pitch.value = clean(pitch, 2);
      outputs.position.value = Math.round(degrees) + "°";
      outputs.curvature.textContent = clean(frame.curvature, 3);
      outputs.torsion.textContent = clean(frame.torsion, 3);
      outputs.circleRadius.textContent = clean(frame.circleRadius, 3);
      viewer.update(startRadius, endRadius, pitch, parameter);
      if (announce && outputs.status) {
        outputs.status.textContent = "Spiral start radius " + clean(startRadius, 2) + ", end radius " + clean(endRadius, 2) + ", pitch " + clean(pitch, 2) + ", point " + Math.round(degrees) + " degrees. Curvature " + clean(frame.curvature, 3) + ", torsion " + clean(frame.torsion, 3) + ".";
      }
    }

    function scheduleUpdate(announce) {
      pendingAnnouncement = pendingAnnouncement || announce;
      if (pendingUpdate) return;
      pendingUpdate = window.requestAnimationFrame(function () {
        pendingUpdate = 0;
        const shouldAnnounce = pendingAnnouncement;
        pendingAnnouncement = false;
        applyUpdate(shouldAnnounce);
      });
    }

    [startRadiusInput, endRadiusInput, pitchInput, positionInput].forEach(function (input) {
      input.addEventListener("input", function () { scheduleUpdate(false); });
      input.addEventListener("change", function () { scheduleUpdate(true); });
    });
    applyUpdate(false);
    return {
      update: function () { applyUpdate(false); },
      dispose: function () {
        if (pendingUpdate) window.cancelAnimationFrame(pendingUpdate);
        viewer.dispose();
      }
    };
  }

  function mountAll(scope) {
    const labs = Array.from(scope.querySelectorAll("[data-frenet-lab]"));
    const instances = labs.map(mount).filter(Boolean);
    if (instances.length && typeof window !== "undefined") {
      window.addEventListener("pagehide", function (event) {
        if (event.persisted) return;
        instances.forEach(function (instance) { instance.dispose(); });
      });
    }
    return instances;
  }

  return {
    spiralFrame: spiralFrame,
    helixFrame: helixFrame,
    osculatingCirclePoint: osculatingCirclePoint,
    sampleSpiral: sampleSpiral,
    sampleHelix: sampleHelix,
    mount: mount,
    mountAll: mountAll
  };
});
