(function (root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  root.ProjectionPlayground = api;

  function start() {
    api.mountAll(root.document);
  }

  if (root.document.readyState === "loading") {
    root.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (host) {
  "use strict";

  const INITIAL_GEOMETRY = Object.freeze({
    viewpoint: Object.freeze([0, -0.7, -3.2]),
    points: Object.freeze([
      Object.freeze([-2, -1.1, 2.5]),
      Object.freeze([0.25, 1.25, 3.1]),
      Object.freeze([2.2, -0.15, 2.2])
    ])
  });
  const INITIAL_CAMERA = Object.freeze({ azimuth: -1.02, elevation: 0.48, zoom: 1 });

  function assertVector(value, length, name) {
    if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
      throw new RangeError(name + " must contain " + length + " finite numbers.");
    }
  }

  function linePlaneIntersection(viewpoint, point, plane, epsilon) {
    const targetPlane = plane === undefined ? [0, 0, 1, 0] : plane;
    const tolerance = epsilon === undefined ? 1e-9 : epsilon;

    assertVector(viewpoint, 3, "Viewpoint");
    assertVector(point, 3, "Point");
    assertVector(targetPlane, 4, "Plane");

    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new RangeError("Epsilon must be a positive finite number.");
    }

    const normalLength = Math.hypot(targetPlane[0], targetPlane[1], targetPlane[2]);
    if (normalLength <= Number.EPSILON) {
      throw new RangeError("The plane normal must be non-zero.");
    }

    const normalizedPlane = targetPlane.map(function (value) {
      return value / normalLength;
    });
    const direction = point.map(function (value, index) {
      return value - viewpoint[index];
    });
    const pointScale = Math.max(
      1,
      Math.hypot(viewpoint[0], viewpoint[1], viewpoint[2]),
      Math.hypot(point[0], point[1], point[2])
    );

    if (Math.hypot(direction[0], direction[1], direction[2]) <= tolerance * pointScale) {
      return { kind: "degenerate", point: null, lambda: null };
    }

    function signedPlaneValue(position) {
      return normalizedPlane[0] * position[0] +
        normalizedPlane[1] * position[1] +
        normalizedPlane[2] * position[2] +
        normalizedPlane[3];
    }

    const atViewpoint = signedPlaneValue(viewpoint);
    const atPoint = signedPlaneValue(point);
    const denominator = atPoint - atViewpoint;
    const planeTolerance = tolerance * Math.max(1, Math.abs(atViewpoint), Math.abs(atPoint));

    if (Math.abs(denominator) <= planeTolerance) {
      if (Math.abs(atViewpoint) <= planeTolerance) {
        return { kind: "contained", point: null, lambda: null };
      }
      return { kind: "parallel", point: null, lambda: null };
    }

    const lambda = -atViewpoint / denominator;
    const intersection = viewpoint.map(function (value, index) {
      return value + lambda * direction[index];
    });

    return { kind: "point", point: intersection, lambda: lambda };
  }

  function projectToZ0(viewpoint, point, epsilon) {
    return linePlaneIntersection(viewpoint, point, [0, 0, 1, 0], epsilon);
  }

  function projectPointsToZ0(viewpoint, points, epsilon) {
    assertVector(viewpoint, 3, "Viewpoint");
    if (!Array.isArray(points) || !points.length) {
      throw new RangeError("Points must be a non-empty array.");
    }
    return points.map(function (point) {
      return projectToZ0(viewpoint, point, epsilon);
    });
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function displayNumber(value) {
    const cleaned = Math.abs(value) < 0.005 ? 0 : value;
    return cleaned.toFixed(2).replace("-", "−");
  }

  function mount(rootElement) {
    const canvas = rootElement.querySelector("[data-projection-canvas]");
    const fallback = rootElement.querySelector("[data-projection-fallback]");
    const readout = rootElement.querySelector("[data-projection-readout]");
    const live = rootElement.querySelector("[data-projection-live]");
    const T = host.THREE;

    if (!canvas || !T) {
      if (fallback) fallback.hidden = false;
      return null;
    }

    let renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (_) {
      if (fallback) fallback.hidden = false;
      return null;
    }

    if (fallback) fallback.hidden = true;

    const scene = new T.Scene();
    scene.background = new T.Color(0x171541);
    const camera = new T.OrthographicCamera(-5, 5, 5, -5, 0.01, 100);
    camera.up.set(0, 0, 1);
    const cameraTarget = new T.Vector3(0, 0, 0.1);
    const cameraState = {
      azimuth: INITIAL_CAMERA.azimuth,
      elevation: INITIAL_CAMERA.elevation,
      zoom: INITIAL_CAMERA.zoom
    };
    const state = {
      viewpoint: new T.Vector3().fromArray(INITIAL_GEOMETRY.viewpoint),
      points: INITIAL_GEOMETRY.points.map(function (point) {
        return new T.Vector3().fromArray(point);
      }),
      results: []
    };
    const colors = [0xffcf5c, 0x70dcc2, 0xb9a6f2];
    const labels = [];
    const listeners = [];
    const pointObjects = new Map();
    const pickObjects = [];
    const pointMeshes = [];
    const primeMeshes = [];
    const rays = [];
    const pointers = new Map();
    const raycaster = new T.Raycaster();
    const pointer = new T.Vector2();
    const dragPlane = new T.Plane();
    const dragHit = new T.Vector3();
    const horizontalNormal = new T.Vector3(0, 0, 1);
    let activeKey = "point-0";
    let gesture = null;
    let pendingFrame = null;
    let lost = false;
    let observer = null;
    let disposed = false;

    if (T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setClearColor(scene.background);

    scene.add(new T.HemisphereLight(0xf1f7ff, 0x22204f, 1.55));
    const keyLight = new T.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, -5, 8);
    scene.add(keyLight);
    const fillLight = new T.DirectionalLight(0x77cde7, 1.15);
    fillLight.position.set(-5, 3, -2);
    scene.add(fillLight);

    const planeMesh = new T.Mesh(
      new T.PlaneGeometry(8.6, 5.8),
      new T.MeshBasicMaterial({
        color: 0x73c7df,
        transparent: true,
        opacity: 0.2,
        side: T.DoubleSide,
        depthWrite: false
      })
    );
    planeMesh.renderOrder = 1;
    scene.add(planeMesh);

    const grid = new T.GridHelper(8.6, 10, 0x8ecde5, 0x53618a);
    grid.rotation.x = Math.PI / 2;
    grid.scale.z = 5.8 / 8.6;
    grid.position.z = 0.018;
    grid.material.transparent = true;
    grid.material.opacity = 0.52;
    grid.material.depthWrite = false;
    grid.renderOrder = 2;
    scene.add(grid);

    const borderPoints = [
      [-4.3, -2.9, 0.028],
      [4.3, -2.9, 0.028],
      [4.3, 2.9, 0.028],
      [-4.3, 2.9, 0.028],
      [-4.3, -2.9, 0.028]
    ].map(function (point) {
      return new T.Vector3().fromArray(point);
    });
    const planeBorder = new T.Line(
      new T.BufferGeometry().setFromPoints(borderPoints),
      new T.LineBasicMaterial({ color: 0x9ed9ec, transparent: true, opacity: 0.86, depthTest: false })
    );
    planeBorder.renderOrder = 4;
    scene.add(planeBorder);

    const planeLabelAnchor = new T.Object3D();
    planeLabelAnchor.position.set(3.15, 2.28, 0.05);
    scene.add(planeLabelAnchor);

    function drawRoundedRectangle(context, x, y, width, height, radius) {
      context.beginPath();
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
      context.closePath();
    }

    function makeLabel(text, color, anchor, offset) {
      const pixelRatio = 2;
      const image = host.document.createElement("canvas");
      const context = image.getContext("2d");
      const font = "700 18px system-ui, sans-serif";
      context.font = font;
      const logicalWidth = Math.ceil(context.measureText(text).width) + 18;
      const logicalHeight = 34;
      image.width = logicalWidth * pixelRatio;
      image.height = logicalHeight * pixelRatio;
      context.scale(pixelRatio, pixelRatio);
      context.font = font;
      drawRoundedRectangle(context, 0, 0, logicalWidth, logicalHeight, 7);
      context.fillStyle = "rgba(23,21,65,.86)";
      context.fill();
      context.fillStyle = "#" + color.toString(16).padStart(6, "0");
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, logicalWidth / 2, logicalHeight / 2 + 0.5);

      const texture = new T.CanvasTexture(image);
      if (T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
      const sprite = new T.Sprite(new T.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
      }));
      sprite.renderOrder = 50;
      sprite.userData = {
        label: true,
        anchor: anchor,
        offset: offset,
        width: logicalWidth,
        height: logicalHeight
      };
      labels.push(sprite);
      scene.add(sprite);
      return sprite;
    }

    makeLabel("Π · z = 0", 0xa7dded, planeLabelAnchor, [-12, -12]);

    function movablePoint(key, position, color, labelText, offset, radius) {
      const mesh = new T.Mesh(
        new T.SphereGeometry(radius, 22, 14),
        new T.MeshPhongMaterial({
          color: color,
          emissive: new T.Color(color).multiplyScalar(0.14),
          shininess: 85,
          depthTest: false
        })
      );
      mesh.position.copy(position);
      mesh.renderOrder = 20;
      mesh.userData.key = key;
      scene.add(mesh);

      const picker = new T.Mesh(
        new T.SphereGeometry(radius * 2.15, 12, 8),
        new T.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          colorWrite: false,
          depthWrite: false
        })
      );
      picker.position.copy(position);
      picker.userData.key = key;
      scene.add(picker);
      pickObjects.push(picker);
      pointObjects.set(key, { mesh: mesh, picker: picker });
      makeLabel(labelText, color, mesh, offset);
      return mesh;
    }

    const viewpointMesh = movablePoint("viewpoint", state.viewpoint, 0xff806b, "V", [16, 19], 0.19);
    state.points.forEach(function (point, index) {
      pointMeshes.push(movablePoint(
        "point-" + index,
        point,
        colors[index],
        ["P₁", "P₂", "P₃"][index],
        [16, -20],
        0.16
      ));
    });

    const selectionHalo = new T.Mesh(
      new T.SphereGeometry(0.28, 18, 12),
      new T.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
        depthTest: false
      })
    );
    selectionHalo.renderOrder = 25;
    scene.add(selectionHalo);

    const primeGeometry = new T.RingGeometry(0.09, 0.16, 28);
    state.points.forEach(function (_, index) {
      const marker = new T.Mesh(
        primeGeometry,
        new T.MeshBasicMaterial({
          color: colors[index],
          side: T.DoubleSide,
          depthTest: false,
          depthWrite: false
        })
      );
      marker.position.z = 0.035;
      marker.renderOrder = 24;
      scene.add(marker);
      primeMeshes.push(marker);
      makeLabel(["P′₁", "P′₂", "P′₃"][index], colors[index], marker, [18, 17]);

      const ray = new T.ArrowHelper(
        new T.Vector3(0, 0, 1),
        state.viewpoint,
        1,
        colors[index],
        0.24,
        0.13
      );
      ray.line.material.transparent = true;
      ray.line.material.opacity = 0.92;
      ray.line.material.depthTest = false;
      ray.cone.material.transparent = true;
      ray.cone.material.opacity = 0.92;
      ray.cone.material.depthTest = false;
      ray.line.renderOrder = 10;
      ray.cone.renderOrder = 10;
      scene.add(ray);
      rays.push(ray);
    });

    function positionForKey(key) {
      if (key === "viewpoint") return state.viewpoint;
      const index = Number(key.split("-")[1]);
      return state.points[index];
    }

    function labelForKey(key) {
      if (key === "viewpoint") return "V";
      return ["P₁", "P₂", "P₃"][Number(key.split("-")[1])];
    }

    function resultText() {
      if (activeKey === "viewpoint") {
        return "Selected V · below Π · V = (" +
          displayNumber(state.viewpoint.x) + ", " +
          displayNumber(state.viewpoint.y) + ", " +
          displayNumber(state.viewpoint.z) + ")";
      }

      const index = Number(activeKey.split("-")[1]);
      const result = state.results[index];
      if (!result || result.kind !== "point") {
        return "Selected " + labelForKey(activeKey) + " · no finite projection";
      }

      return "Selected " + labelForKey(activeKey) + " · " +
        ["P′₁", "P′₂", "P′₃"][index] + " = (" +
        displayNumber(result.point[0]) + ", " +
        displayNumber(result.point[1]) + ", 0)";
    }

    function setReadout(announcement) {
      const text = resultText();
      if (readout) {
        readout.value = text;
        readout.textContent = text;
      }
      if (announcement && live) {
        live.textContent = announcement + ". " + text;
      }
    }

    function requestRender() {
      if (disposed || pendingFrame !== null) return;
      pendingFrame = host.requestAnimationFrame(render);
    }

    function updateScene(announcement) {
      viewpointMesh.position.copy(state.viewpoint);
      pointObjects.get("viewpoint").picker.position.copy(state.viewpoint);
      state.results = projectPointsToZ0(
        state.viewpoint.toArray(),
        state.points.map(function (point) { return point.toArray(); })
      );

      state.points.forEach(function (point, index) {
        pointMeshes[index].position.copy(point);
        pointObjects.get("point-" + index).picker.position.copy(point);

        const direction = point.clone().sub(state.viewpoint);
        const length = direction.length();
        rays[index].position.copy(state.viewpoint);
        rays[index].setDirection(direction.normalize());
        rays[index].setLength(length, 0.24, 0.13);

        const result = state.results[index];
        if (result.kind === "point") {
          primeMeshes[index].visible = true;
          primeMeshes[index].position.fromArray(result.point);
          primeMeshes[index].position.z = 0.035;
        } else {
          primeMeshes[index].visible = false;
        }
      });

      pointMeshes.forEach(function (mesh, index) {
        mesh.scale.setScalar(activeKey === "point-" + index ? 1.16 : 1);
      });
      viewpointMesh.scale.setScalar(activeKey === "viewpoint" ? 1.16 : 1);
      selectionHalo.position.copy(positionForKey(activeKey));
      setReadout(announcement);
      requestRender();
    }

    function selectPoint(key, announce) {
      if (!pointObjects.has(key)) return;
      activeKey = key;
      updateScene(announce ? labelForKey(key) + " selected" : "");
    }

    function positionCamera(width, height) {
      const direction = new T.Vector3(
        Math.cos(cameraState.elevation) * Math.cos(cameraState.azimuth),
        Math.cos(cameraState.elevation) * Math.sin(cameraState.azimuth),
        Math.sin(cameraState.elevation)
      );
      camera.position.copy(cameraTarget).addScaledVector(direction, 14);
      camera.lookAt(cameraTarget);
      camera.updateMatrixWorld();

      const aspect = width / height;
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      let halfWidth = 0;
      let halfHeight = 0;
      for (const x of [-4.3, 4.3]) {
        for (const y of [-2.9, 2.9]) {
          for (const z of [-3.2, 3.1]) {
            const relative = new T.Vector3(x, y, z).sub(cameraTarget);
            halfWidth = Math.max(halfWidth, Math.abs(relative.dot(right)));
            halfHeight = Math.max(halfHeight, Math.abs(relative.dot(up)));
          }
        }
      }
      const extent = Math.max(halfHeight, halfWidth / aspect) * 1.16 / cameraState.zoom;
      camera.left = -extent * aspect;
      camera.right = extent * aspect;
      camera.top = extent;
      camera.bottom = -extent;
      camera.updateProjectionMatrix();
    }

    function render() {
      pendingFrame = null;
      if (disposed || lost) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;

      positionCamera(width, height);
      scene.updateMatrixWorld(true);
      const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const worldUnitsPerPixel = (camera.top - camera.bottom) / height;
      const anchor = new T.Vector3();
      const projected = new T.Vector3();

      labels.forEach(function (sprite) {
        const data = sprite.userData;
        data.anchor.getWorldPosition(anchor);
        sprite.scale.set(data.width * worldUnitsPerPixel, data.height * worldUnitsPerPixel, 1);
        projected.copy(anchor).project(camera);
        sprite.visible = projected.z >= -1 && projected.z <= 1 &&
          Math.abs(projected.x) <= 1.04 && Math.abs(projected.y) <= 1.04;
        if (!sprite.visible) return;

        const anchorX = (projected.x * 0.5 + 0.5) * width;
        const anchorY = (-projected.y * 0.5 + 0.5) * height;
        const labelX = clamp(
          anchorX + data.offset[0],
          data.width / 2 + 5,
          width - data.width / 2 - 5
        );
        const labelY = clamp(
          anchorY + data.offset[1],
          data.height / 2 + 5,
          height - data.height / 2 - 5
        );
        sprite.position.copy(anchor)
          .addScaledVector(right, (labelX - anchorX) * worldUnitsPerPixel)
          .addScaledVector(up, -(labelY - anchorY) * worldUnitsPerPixel);
      });

      renderer.render(scene, camera);
    }

    function resize() {
      if (disposed || lost || !canvas.clientWidth || !canvas.clientHeight) return;
      renderer.setPixelRatio(Math.min(host.devicePixelRatio || 1, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      requestRender();
    }

    function updateRaycaster(event) {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return false;
      positionCamera(bounds.width, bounds.height);
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      return true;
    }

    function pickedKey(event) {
      if (!updateRaycaster(event)) return null;
      const hit = raycaster.intersectObjects(pickObjects, false)[0];
      return hit ? hit.object.userData.key : null;
    }

    function touchPointers() {
      return Array.from(pointers.values()).filter(function (item) {
        return item.type === "touch";
      });
    }

    function beginPinch() {
      const touches = touchPointers();
      if (touches.length < 2) return false;
      gesture = {
        type: "pinch",
        distance: Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y)
      };
      canvas.classList.add("is-dragging");
      return true;
    }

    function on(name, handler, options) {
      canvas.addEventListener(name, handler, options);
      listeners.push([name, handler, options]);
    }

    on("pointerdown", function (event) {
      if (event.pointerType !== "touch" && event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      pointers.set(event.pointerId, {
        id: event.pointerId,
        type: event.pointerType,
        x: event.clientX,
        y: event.clientY
      });
      canvas.setPointerCapture(event.pointerId);

      if (beginPinch()) {
        event.preventDefault();
        return;
      }

      const key = pickedKey(event);
      if (key) {
        selectPoint(key, false);
        const position = positionForKey(key);
        dragPlane.set(horizontalNormal, -position.z);
        updateRaycaster(event);
        raycaster.ray.intersectPlane(dragPlane, dragHit);
        gesture = {
          type: "point",
          pointerId: event.pointerId,
          key: key,
          offsetX: position.x - dragHit.x,
          offsetY: position.y - dragHit.y
        };
      } else {
        gesture = {
          type: "orbit",
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY
        };
      }

      canvas.classList.add("is-dragging");
      canvas.classList.remove("is-point-hover");
      event.preventDefault();
    });

    on("pointermove", function (event) {
      const tracked = pointers.get(event.pointerId);
      if (!tracked) {
        if (event.pointerType === "mouse") {
          canvas.classList.toggle("is-point-hover", Boolean(pickedKey(event)));
        }
        return;
      }

      tracked.x = event.clientX;
      tracked.y = event.clientY;

      if (gesture && gesture.type === "pinch") {
        const touches = touchPointers();
        if (touches.length >= 2) {
          const distance = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
          if (gesture.distance > 0 && distance > 0) {
            cameraState.zoom = clamp(cameraState.zoom * distance / gesture.distance, 0.62, 2.4);
            gesture.distance = distance;
            requestRender();
          }
        }
        return;
      }

      if (!gesture || gesture.pointerId !== event.pointerId) return;

      if (gesture.type === "point") {
        updateRaycaster(event);
        if (raycaster.ray.intersectPlane(dragPlane, dragHit)) {
          const position = positionForKey(gesture.key);
          position.x = clamp(dragHit.x + gesture.offsetX, -3.45, 3.45);
          position.y = clamp(dragHit.y + gesture.offsetY, -2.2, 2.2);
          updateScene("");
        }
        return;
      }

      const deltaX = event.clientX - gesture.x;
      const deltaY = event.clientY - gesture.y;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      cameraState.azimuth -= deltaX * 0.008;
      cameraState.elevation = clamp(cameraState.elevation + deltaY * 0.007, 0.2, 1.12);
      requestRender();
    });

    function stopPointer(event) {
      const completedPoint = gesture && gesture.type === "point" && gesture.pointerId === event.pointerId
        ? gesture.key
        : null;
      pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      const remainingTouches = touchPointers();
      if (remainingTouches.length >= 2) {
        beginPinch();
      } else if (remainingTouches.length === 1) {
        gesture = {
          type: "orbit",
          pointerId: remainingTouches[0].id,
          x: remainingTouches[0].x,
          y: remainingTouches[0].y
        };
      } else {
        gesture = null;
        canvas.classList.remove("is-dragging");
      }

      if (completedPoint) {
        setReadout(labelForKey(completedPoint) + " moved");
      }
    }

    on("pointerup", stopPointer);
    on("pointercancel", stopPointer);
    on("lostpointercapture", function (event) {
      if (pointers.has(event.pointerId)) stopPointer(event);
    });
    on("pointerleave", function () {
      if (!gesture) canvas.classList.remove("is-point-hover");
    });

    on("wheel", function (event) {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      const delta = clamp(event.deltaY * unit, -220, 220);
      cameraState.zoom = clamp(cameraState.zoom * Math.exp(-delta * 0.002), 0.62, 2.4);
      requestRender();
    }, { passive: false });

    on("keydown", function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const selectionKeys = { v: "viewpoint", "0": "viewpoint", "1": "point-0", "2": "point-1", "3": "point-2" };

      if (selectionKeys[key]) {
        selectPoint(selectionKeys[key], true);
        event.preventDefault();
        return;
      }

      if (key === "home") {
        state.viewpoint.fromArray(INITIAL_GEOMETRY.viewpoint);
        state.points.forEach(function (point, index) {
          point.fromArray(INITIAL_GEOMETRY.points[index]);
        });
        cameraState.azimuth = INITIAL_CAMERA.azimuth;
        cameraState.elevation = INITIAL_CAMERA.elevation;
        cameraState.zoom = INITIAL_CAMERA.zoom;
        activeKey = "point-0";
        updateScene("Projection scene reset");
        event.preventDefault();
        return;
      }

      if (key === "+" || key === "=" || key === "-") {
        cameraState.zoom = clamp(cameraState.zoom * (key === "-" ? 0.86 : 1.16), 0.62, 2.4);
        requestRender();
        event.preventDefault();
        return;
      }

      if (!["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) return;

      const step = event.shiftKey ? 0.32 : 0.12;
      const rightX = -Math.sin(cameraState.azimuth);
      const rightY = Math.cos(cameraState.azimuth);
      const upX = -Math.cos(cameraState.azimuth);
      const upY = -Math.sin(cameraState.azimuth);
      const position = positionForKey(activeKey);

      if (key === "arrowleft") {
        position.x -= rightX * step;
        position.y -= rightY * step;
      } else if (key === "arrowright") {
        position.x += rightX * step;
        position.y += rightY * step;
      } else if (key === "arrowup") {
        position.x += upX * step;
        position.y += upY * step;
      } else {
        position.x -= upX * step;
        position.y -= upY * step;
      }

      position.x = clamp(position.x, -3.45, 3.45);
      position.y = clamp(position.y, -2.2, 2.2);
      updateScene(labelForKey(activeKey) + " moved");
      event.preventDefault();
    });

    on("webglcontextlost", function (event) {
      event.preventDefault();
      lost = true;
      if (fallback) {
        fallback.textContent = "The 3D graphics connection was interrupted. Reload the page to restore it; the projection derivation remains available below.";
        fallback.hidden = false;
      }
    });

    on("webglcontextrestored", function () {
      lost = false;
      if (fallback) fallback.hidden = true;
      resize();
    });

    if (host.ResizeObserver) {
      observer = new host.ResizeObserver(resize);
      observer.observe(canvas);
    } else {
      host.addEventListener("resize", resize);
      listeners.push(["window-resize", resize]);
    }

    updateScene("");
    resize();

    return {
      state: state,
      select: selectPoint,
      reset: function () {
        state.viewpoint.fromArray(INITIAL_GEOMETRY.viewpoint);
        state.points.forEach(function (point, index) {
          point.fromArray(INITIAL_GEOMETRY.points[index]);
        });
        cameraState.azimuth = INITIAL_CAMERA.azimuth;
        cameraState.elevation = INITIAL_CAMERA.elevation;
        cameraState.zoom = INITIAL_CAMERA.zoom;
        activeKey = "point-0";
        updateScene("Projection scene reset");
      },
      dispose: function () {
        disposed = true;
        if (pendingFrame !== null) host.cancelAnimationFrame(pendingFrame);
        if (observer) observer.disconnect();
        listeners.forEach(function (entry) {
          if (entry[0] === "window-resize") host.removeEventListener("resize", entry[1]);
          else canvas.removeEventListener(entry[0], entry[1], entry[2]);
        });
        const disposedGeometry = new Set();
        const disposedMaterial = new Set();
        scene.traverse(function (object) {
          if (object.geometry && !disposedGeometry.has(object.geometry)) {
            object.geometry.dispose();
            disposedGeometry.add(object.geometry);
          }
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.filter(Boolean).forEach(function (material) {
            if (disposedMaterial.has(material)) return;
            if (material.map) material.map.dispose();
            material.dispose();
            disposedMaterial.add(material);
          });
        });
        renderer.dispose();
      }
    };
  }

  function mountAll(documentRoot) {
    return Array.from(documentRoot.querySelectorAll("[data-projection-explorer]")).map(mount);
  }

  return {
    INITIAL_GEOMETRY: INITIAL_GEOMETRY,
    linePlaneIntersection: linePlaneIntersection,
    projectToZ0: projectToZ0,
    projectPointsToZ0: projectPointsToZ0,
    mount: mount,
    mountAll: mountAll
  };
});
