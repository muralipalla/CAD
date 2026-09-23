(function (root) {
  "use strict";

  const T = root.THREE;

  function edgeKey(a, b) { return a < b ? a + ":" + b : b + ":" + a; }

  function vecSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vecCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vecDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vecLength(a) { return Math.sqrt(vecDot(a, a)); }
  function vecNormalize(a) { const length = vecLength(a) || 1; return a.map(function (value) { return value / length; }); }
  function centroid(points) {
    const total = points.reduce(function (sum, point) { return [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]]; }, [0, 0, 0]);
    return total.map(function (value) { return value / points.length; });
  }

  function orientFaces(vertices, faces) {
    const bodyCenter = centroid(vertices);
    return faces.map(function (source) {
      const face = source.slice();
      const a = vertices[face[0]], b = vertices[face[1]], c = vertices[face[2]];
      const normal = vecCross(vecSub(b, a), vecSub(c, a));
      const faceCenter = centroid(face.map(function (index) { return vertices[index]; }));
      return vecDot(normal, vecSub(faceCenter, bodyCenter)) < 0 ? face.reverse() : face;
    });
  }

  function makeModels() {
    const tetraVertices = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
    const cubeVertices = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
    ];
    const prismVertices = [];
    for (let layer = 0; layer < 2; layer += 1) {
      for (let i = 0; i < 5; i += 1) {
        const angle = Math.PI / 2 + (i * Math.PI * 2 / 5);
        prismVertices.push([1.2 * Math.cos(angle), 1.2 * Math.sin(angle), layer ? 0.9 : -0.9]);
      }
    }
    const prismFaces = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]];
    for (let i = 0; i < 5; i += 1) prismFaces.push([i, (i + 1) % 5, ((i + 1) % 5) + 5, i + 5]);

    return {
      tetrahedron: {
        label: "Tetrahedron",
        vertices: tetraVertices,
        faces: orientFaces(tetraVertices, [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]),
        netRoot: 0,
        netParents: { 1: 0, 2: 0, 3: 0 }
      },
      cube: {
        label: "Cube",
        vertices: cubeVertices,
        faces: orientFaces(cubeVertices, [[0, 1, 2, 3], [4, 5, 6, 7], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]),
        netRoot: 1,
        netParents: { 0: 4, 2: 1, 3: 1, 4: 1, 5: 1 }
      },
      "pentagonal-prism": {
        label: "Pentagonal prism",
        vertices: prismVertices,
        faces: orientFaces(prismVertices, prismFaces),
        netRoot: 2,
        netParents: { 0: 2, 1: 4, 3: 2, 4: 3, 5: 4, 6: 5 }
      }
    };
  }

  const MODELS = makeModels();

  function faceNormal(model, faceIndex) {
    const face = model.faces[faceIndex], a = model.vertices[face[0]], b = model.vertices[face[1]], c = model.vertices[face[2]];
    return vecNormalize(vecCross(vecSub(b, a), vecSub(c, a)));
  }

  function buildUnfoldPlan(model) {
    const hinges = new Array(model.faces.length).fill(null);
    const rootFace = model.netRoot;
    if (!Number.isInteger(rootFace) || rootFace < 0 || rootFace >= model.faces.length) throw new Error("Invalid net root face.");
    const visiting = new Set(), completed = new Set();
    function visit(faceIndex) {
      if (completed.has(faceIndex)) return;
      if (visiting.has(faceIndex)) throw new Error("Face net contains a cycle.");
      visiting.add(faceIndex);
      if (faceIndex !== rootFace) {
        const parent = model.netParents[faceIndex];
        if (!Number.isInteger(parent) || parent < 0 || parent >= model.faces.length) throw new Error("Every other face needs a parent.");
        visit(parent);
        const parentFace = model.faces[parent], childFace = model.faces[faceIndex];
        let a, b;
        for (let i = 0; i < parentFace.length; i += 1) {
          const first = parentFace[i], second = parentFace[(i + 1) % parentFace.length];
          if (childFace.includes(first) && childFace.includes(second)) { a = first; b = second; break; }
        }
        if (a === undefined) throw new Error("A net hinge must be shared by its two faces.");
        const axis = vecNormalize(vecSub(model.vertices[b], model.vertices[a]));
        const childNormal = faceNormal(model, faceIndex), parentNormal = faceNormal(model, parent);
        const angle = Math.atan2(vecDot(axis, vecCross(childNormal, parentNormal)), vecDot(childNormal, parentNormal));
        hinges[faceIndex] = { face: faceIndex, parent: parent, a: a, b: b, axis: axis, angle: angle };
      }
      visiting.delete(faceIndex); completed.add(faceIndex);
    }
    for (let i = 0; i < model.faces.length; i += 1) visit(i);
    return { root: rootFace, hinges: hinges, normal: faceNormal(model, rootFace) };
  }

  function rotateAroundLine(point, origin, axis, angle) {
    const delta = vecSub(point, origin), cosine = Math.cos(angle), sine = Math.sin(angle);
    const cross = vecCross(axis, delta), parallel = vecDot(axis, delta) * (1 - cosine);
    return [0, 1, 2].map(function (coordinate) {
      return origin[coordinate] + delta[coordinate] * cosine + cross[coordinate] * sine + axis[coordinate] * parallel;
    });
  }

  function unfoldedFaces(model, plan, progress) {
    const transforms = new Array(model.faces.length);
    function transform(faceIndex) {
      if (transforms[faceIndex]) return transforms[faceIndex];
      const hinge = plan.hinges[faceIndex];
      if (!hinge) return (transforms[faceIndex] = function (point) { return point; });
      const parentTransform = transform(hinge.parent), origin = model.vertices[hinge.a];
      return (transforms[faceIndex] = function (point) {
        return parentTransform(rotateAroundLine(point, origin, hinge.axis, hinge.angle * progress));
      });
    }
    return model.faces.map(function (face, index) { return face.map(function (vertexIndex) { return transform(index)(model.vertices[vertexIndex]); }); });
  }

  function netCoordinates(model, plan) {
    const rootFace = model.faces[plan.root], origin = model.vertices[rootFace[0]];
    const u = vecNormalize(vecSub(model.vertices[rootFace[1]], origin)), v = vecCross(plan.normal, u);
    const faces = unfoldedFaces(model, plan, 1).map(function (face) {
      return face.map(function (point) { const delta = vecSub(point, origin); return [vecDot(delta, u), vecDot(delta, v)]; });
    });
    const all = faces.flat(), xs = all.map(function (point) { return point[0]; }), ys = all.map(function (point) { return point[1]; });
    return { faces: faces, origin: origin, u: u, v: v,
      bounds: { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) } };
  }

  function unfoldMatrices(model, plan, progress) {
    if (!T) throw new Error("Three.js is required to display the unfolding.");
    const matrices = new Array(model.faces.length);
    function faceMatrix(index) {
      if (matrices[index]) return matrices[index];
      const hinge = plan.hinges[index];
      if (!hinge) return (matrices[index] = new T.Matrix4());
      const parent = faceMatrix(hinge.parent), origin = model.vertices[hinge.a];
      const rotation = new T.Matrix4().makeTranslation(origin[0], origin[1], origin[2]);
      rotation.multiply(new T.Matrix4().makeRotationAxis(new T.Vector3(hinge.axis[0], hinge.axis[1], hinge.axis[2]), hinge.angle * progress));
      rotation.multiply(new T.Matrix4().makeTranslation(-origin[0], -origin[1], -origin[2]));
      return (matrices[index] = parent.clone().multiply(rotation));
    }
    model.faces.forEach(function (_, index) { faceMatrix(index); });
    return matrices;
  }

  function buildWingedData(model) {
    const records = new Map();
    model.faces.forEach(function (face) {
      face.forEach(function (a, index) {
        const b = face[(index + 1) % face.length];
        const key = edgeKey(a, b);
        if (!records.has(key)) records.set(key, { key: key, a: Math.min(a, b), b: Math.max(a, b) });
      });
    });
    const sorted = Array.from(records.values()).sort(function (one, two) { return one.a - two.a || one.b - two.b; });
    sorted.forEach(function (record, index) { record.id = "E" + index; });

    model.faces.forEach(function (face, faceIndex) {
      const faceEdges = face.map(function (a, index) { return records.get(edgeKey(a, face[(index + 1) % face.length])); });
      face.forEach(function (a, index) {
        const b = face[(index + 1) % face.length];
        const record = faceEdges[index];
        const side = a === record.a && b === record.b ? "left" : "right";
        record[side + "Face"] = "F" + faceIndex;
        record[side + "Prev"] = faceEdges[(index - 1 + faceEdges.length) % faceEdges.length].id;
        record[side + "Next"] = faceEdges[(index + 1) % faceEdges.length].id;
      });
    });
    return { edges: sorted, byKey: records, byId: new Map(sorted.map(function (record) { return [record.id, record]; })) };
  }

  function buildHalfEdgeData(model, wingedData) {
    const edges = wingedData || buildWingedData(model), halfEdges = [], byDirection = new Map();
    model.faces.forEach(function (face, faceIndex) {
      const start = halfEdges.length;
      face.forEach(function (a, index) {
        const b = face[(index + 1) % face.length], direction = a + ":" + b;
        if (byDirection.has(direction)) throw new Error("Two faces use the same directed half-edge.");
        const record = {
          id: "H" + halfEdges.length, a: a, b: b, origin: "V" + a, destination: "V" + b,
          face: "F" + faceIndex, edge: edges.byKey.get(edgeKey(a, b)).id,
          next: "H" + (start + (index + 1) % face.length),
          prev: "H" + (start + (index - 1 + face.length) % face.length),
          twin: ""
        };
        halfEdges.push(record); byDirection.set(direction, record);
      });
    });
    halfEdges.forEach(function (record) {
      const twin = byDirection.get(record.b + ":" + record.a);
      record.twin = twin ? twin.id : "";
    });
    return { halfEdges: halfEdges, byId: new Map(halfEdges.map(function (record) { return [record.id, record]; })) };
  }

  function triangulatedGeometry(vertices, faces) {
    const values = [];
    faces.forEach(function (face) {
      for (let index = 1; index < face.length - 1; index += 1) {
        [face[0], face[index], face[index + 1]].forEach(function (vertexIndex) {
          values.push.apply(values, vertices[vertexIndex]);
        });
      }
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(values, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  function cylinderBetween(a, b, radius, material) {
    const start = new T.Vector3(a[0], a[1], a[2]);
    const end = new T.Vector3(b[0], b[1], b[2]);
    const direction = end.clone().sub(start);
    const cylinder = new T.Mesh(new T.CylinderGeometry(radius, radius, direction.length(), 10), material);
    cylinder.position.copy(start).add(end).multiplyScalar(0.5);
    cylinder.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize());
    return cylinder;
  }

  function labelSprite(text, fill, scale) {
    const canvas = root.document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = 128; canvas.height = 64;
    context.fillStyle = "rgba(12,20,38,.88)";
    context.beginPath(); context.roundRect(6, 6, 116, 52, 13); context.fill();
    context.strokeStyle = fill; context.lineWidth = 4; context.stroke();
    context.fillStyle = fill; context.font = "800 27px Arial"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(text, 64, 33);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(scale * 2, scale, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  function addLabel(group, text, point, color, scale) {
    const sprite = labelSprite(text, color, scale || 0.29);
    sprite.position.set(point[0], point[1], point[2]);
    group.add(sprite);
    return sprite;
  }

  function makeWingedGroup(model, data, plan) {
    const group = new T.Group(), panels = [], edgeObjects = new Map(), pickables = [], labels = [];
    const colors = [0xdcefff, 0xfcebd1, 0xe8e0ff, 0xd8f3e9, 0xffe2dd, 0xe5eaff, 0xf8efd1];
    model.faces.forEach(function (face, faceIndex) {
      const panel = new T.Group(), normal = faceNormal(model, faceIndex);
      panel.matrixAutoUpdate = false;
      panel.userData.faceId = "F" + faceIndex;
      const material = new T.MeshStandardMaterial({ color: colors[faceIndex % colors.length], roughness: 0.68, metalness: 0.02, side: T.DoubleSide });
      const surface = new T.Mesh(triangulatedGeometry(model.vertices, [face]), material);
      surface.userData.faceId = "F" + faceIndex;
      panel.add(surface); pickables.push(surface);
      const faceCenter = centroid(face.map(function (index) { return model.vertices[index]; }));
      labels.push(addLabel(panel, "F" + faceIndex, faceCenter.map(function (value, coordinate) { return value + normal[coordinate] * 0.09; }), "#d2b8ff", 0.3));
      face.forEach(function (a, index) {
        const b = face[(index + 1) % face.length], record = data.byKey.get(edgeKey(a, b));
        const edge = cylinderBetween(model.vertices[a], model.vertices[b], 0.035, new T.MeshBasicMaterial({ color: 0xff2020 }));
        panel.add(edge);
        if (!edgeObjects.has(record.id)) edgeObjects.set(record.id, []);
        edgeObjects.get(record.id).push(edge);
        const hit = cylinderBetween(model.vertices[a], model.vertices[b], 0.105, new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.userData.edgeId = record.id;
        hit.userData.endpoints = [model.vertices[a], model.vertices[b]];
        panel.add(hit); pickables.push(hit);
        const midpoint = centroid([model.vertices[a], model.vertices[b]]);
        labels.push(addLabel(panel, record.id, midpoint.map(function (value, coordinate) { return value + normal[coordinate] * 0.11; }), "#ff4b4b", 0.22));
        const vertex = model.vertices[a];
        labels.push(addLabel(panel, "V" + a, vertex.map(function (value, coordinate) { return value + normal[coordinate] * 0.13; }), "#7ee5ff", 0.2));
        const vertexHit = new T.Mesh(new T.SphereGeometry(0.14, 8, 6), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        vertexHit.position.set(vertex[0], vertex[1], vertex[2]);
        vertexHit.userData.vertexId = a;
        panel.add(vertexHit); pickables.push(vertexHit);
      });
      group.add(panel); panels.push(panel);
    });
    function updateProgress(progress) {
      const matrices = unfoldMatrices(model, plan, progress);
      panels.forEach(function (panel, index) { panel.matrix.copy(matrices[index]); panel.matrixWorldNeedsUpdate = true; });
      group.updateMatrixWorld(true);
    }
    group.userData.edgeObjects = edgeObjects;
    group.userData.pickables = pickables;
    group.userData.updateProgress = updateProgress;
    group.userData.setLabelsVisible = function (visible) { labels.forEach(function (label) { label.visible = visible; }); };
    group.userData.labels = labels;
    updateProgress(0);
    return group;
  }

  function disposeObject(object) {
    object.traverse(function (item) {
      if (item.geometry) item.geometry.dispose();
      if (item.material) {
        const materials = Array.isArray(item.material) ? item.material : [item.material];
        materials.forEach(function (material) { if (material.map) material.map.dispose(); material.dispose(); });
      }
    });
  }

  function createViewer(canvas, fallback, onPick, onZoomChange) {
    if (!T || !canvas) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (_) { if (fallback) fallback.hidden = false; canvas.hidden = true; return null; }
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(36, 1, 0.1, 100);
    scene.add(new T.HemisphereLight(0xeaf7ff, 0x18213b, 2.2));
    const key = new T.DirectionalLight(0xffffff, 3.2); key.position.set(4, 6, 5); scene.add(key);
    const rim = new T.DirectionalLight(0xffa57d, 1.8); rim.position.set(-5, 2, -4); scene.add(rim);
    let model = null, pickables = [], yaw = 0.72, pitch = 0.4, distance = 6.4, baseDistance = 6.4;
    const target = new T.Vector3();
    const zoomMarker = new T.Mesh(new T.SphereGeometry(0.065, 12, 8), new T.MeshBasicMaterial({ color: 0xffd76a, depthTest: false, depthWrite: false }));
    zoomMarker.visible = false; zoomMarker.renderOrder = 30; scene.add(zoomMarker);
    let selectedAnchor = null, zoomFrame = null, lastZoomTime = null, desiredDistance = distance;
    const desiredTarget = new T.Vector3();
    let dragging = false, moved = false, orbitDrag = false, pointerId = null, previousX = 0, previousY = 0, startX = 0, startY = 0;
    let selectedEdgeId = null, hoveredEdgeId = null;
    const raycaster = new T.Raycaster(), pointer = new T.Vector2();

    function syncZoom() { if (onZoomChange) onZoomChange(Math.round(baseDistance / desiredDistance * 100)); }

    function selectedPoint() {
      if (!selectedAnchor || !model) return null;
      selectedAnchor.panel.updateWorldMatrix(true, false);
      return selectedAnchor.panel.localToWorld(selectedAnchor.local.clone());
    }

    function cancelZoom() {
      if (zoomFrame !== null) root.cancelAnimationFrame(zoomFrame);
      zoomFrame = null; lastZoomTime = null;
      desiredDistance = distance; desiredTarget.copy(target);
      syncZoom();
    }

    function zoom(factor) {
      const minimum = onPick ? baseDistance / 4 : 0.65, maximum = onPick ? baseDistance * 2 : 90;
      desiredDistance = Math.max(minimum, Math.min(maximum, desiredDistance * factor));
      const anchor = selectedPoint();
      if (anchor) desiredTarget.copy(anchor);
      syncZoom();
      if (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        distance = desiredDistance; target.copy(desiredTarget); updateCamera(); return;
      }
      if (zoomFrame !== null) return;
      function frame(time) {
        const elapsed = lastZoomTime === null ? 16 : Math.min(64, time - lastZoomTime);
        lastZoomTime = time;
        const blend = 1 - Math.exp(-elapsed / 105);
        const movingAnchor = selectedPoint();
        if (movingAnchor) desiredTarget.copy(movingAnchor);
        distance += (desiredDistance - distance) * blend;
        target.lerp(desiredTarget, blend);
        updateCamera();
        if (Math.abs(desiredDistance - distance) > 0.002 || target.distanceTo(desiredTarget) > 0.002) zoomFrame = root.requestAnimationFrame(frame);
        else { distance = desiredDistance; target.copy(desiredTarget); zoomFrame = null; lastZoomTime = null; updateCamera(); }
      }
      zoomFrame = root.requestAnimationFrame(frame);
    }

    function zoomToSelected() { if (selectedAnchor) zoom(0.55); }
    function setZoomPercent(percent) {
      const bounded = Math.max(50, Math.min(400, Number(percent) || 100));
      zoom(baseDistance / (bounded / 100) / desiredDistance);
    }

    function updateCamera() {
      const cp = Math.cos(pitch);
      camera.position.set(target.x + distance * Math.sin(yaw) * cp, target.y + distance * Math.sin(pitch), target.z + distance * Math.cos(yaw) * cp);
      camera.lookAt(target); render();
    }
    function resize() {
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
    }
    function render() {
      const anchor = selectedPoint();
      if (anchor) zoomMarker.position.copy(anchor);
      renderer.render(scene, camera);
    }
    function reset() { cancelZoom(); target.set(0, 0, 0); camera.up.set(0, 1, 0); yaw = 0.72; pitch = 0.4; distance = baseDistance = 6.4; desiredDistance = distance; syncZoom(); updateCamera(); }
    function setPose(nextTarget, nextYaw, nextPitch, nextDistance, nextUp) {
      cancelZoom();
      target.set(nextTarget[0], nextTarget[1], nextTarget[2]);
      if (nextUp) camera.up.set(nextUp[0], nextUp[1], nextUp[2]);
      yaw = nextYaw; pitch = nextPitch; distance = baseDistance = nextDistance; desiredDistance = distance; syncZoom(); updateCamera();
    }
    function setModel(next, nextPickables) {
      cancelZoom(); selectedAnchor = null; zoomMarker.visible = false; selectedEdgeId = null; hoveredEdgeId = null;
      if (model) { scene.remove(model); disposeObject(model); }
      model = next; pickables = nextPickables || next.userData.pickables || [];
      scene.add(model); render();
    }

    function selectPoint(worldPoint, panel) {
      panel.updateWorldMatrix(true, false);
      selectedAnchor = { panel: panel, local: panel.worldToLocal(worldPoint.clone()) };
      zoomMarker.visible = true; render();
    }
    function updateEdgeAppearance() {
      if (!model || !model.userData.edgeObjects) return;
      model.userData.edgeObjects.forEach(function (edges, id) {
        edges.forEach(function (edge) {
          edge.material.color.setHex(id === hoveredEdgeId ? 0xffee00 : 0xff2020);
          edge.scale.x = edge.scale.z = id === selectedEdgeId ? 1.7 : 1;
        });
      });
      render();
    }
    function highlightEdge(edgeId) { selectedEdgeId = edgeId; updateEdgeAppearance(); }
    function hitAt(event) {
      if (!pickables.length) return null;
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(pickables, false)[0] || null;
    }
    function hover(event) {
      const hit = hitAt(event), next = hit && hit.object.userData.edgeId || null;
      if (next !== hoveredEdgeId) { hoveredEdgeId = next; updateEdgeAppearance(); }
    }
    function pick(event) {
      if (!onPick || !pickables.length) return;
      const hit = hitAt(event);
      if (!hit) return;
      const panel = hit.object.parent, info = hit.object.userData;
      let point = hit.point.clone();
      if (Number.isInteger(info.vertexId)) point = hit.object.getWorldPosition(new T.Vector3());
      else if (info.endpoints) {
        panel.updateWorldMatrix(true, false);
        const a = panel.localToWorld(new T.Vector3(...info.endpoints[0]));
        const b = panel.localToWorld(new T.Vector3(...info.endpoints[1]));
        const direction = b.clone().sub(a);
        const fraction = T.MathUtils.clamp(point.clone().sub(a).dot(direction) / direction.lengthSq(), 0, 1);
        point = a.addScaledVector(direction, fraction);
      }
      selectPoint(point, panel);
      onPick({ edgeId: info.edgeId || null, vertexId: info.vertexId, faceId: info.faceId || panel.userData.faceId || null, point: point.toArray() });
    }
    canvas.addEventListener("pointerdown", function (event) {
      cancelZoom(); hoveredEdgeId = null; updateEdgeAppearance();
      dragging = true; moved = false; orbitDrag = !onPick || !!event.shiftKey; pointerId = event.pointerId;
      previousX = startX = event.clientX; previousY = startY = event.clientY;
      canvas.setPointerCapture(pointerId); canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!dragging) { hover(event); return; }
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - previousX, dy = event.clientY - previousY;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 3) moved = true;
      previousX = event.clientX; previousY = event.clientY;
      if (!moved) return;
      if (orbitDrag) {
        yaw -= dx * 0.009; pitch = Math.max(-1.15, Math.min(1.15, pitch + dy * 0.009));
      } else {
        camera.updateMatrixWorld();
        const unitsPerPixel = 2 * distance * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, canvas.clientHeight);
        const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        target.addScaledVector(right, -dx * unitsPerPixel).addScaledVector(up, dy * unitsPerPixel);
      }
      updateCamera();
    });
    function release(event) {
      if (!dragging || event.pointerId !== pointerId) return;
      dragging = false; if (!moved) pick(event);
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId); pointerId = null;
      hover(event);
    }
    canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("pointerleave", function () { if (hoveredEdgeId) { hoveredEdgeId = null; updateEdgeAppearance(); } });
    canvas.addEventListener("wheel", function (event) {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoom(Math.exp(event.deltaY * unit * 0.001));
    }, { passive: false });
    canvas.addEventListener("keydown", function (event) {
      let handled = true;
      if (event.key === "ArrowLeft") { cancelZoom(); yaw += 0.12; }
      else if (event.key === "ArrowRight") { cancelZoom(); yaw -= 0.12; }
      else if (event.key === "ArrowUp") { cancelZoom(); pitch = Math.max(-1.15, pitch - 0.1); }
      else if (event.key === "ArrowDown") { cancelZoom(); pitch = Math.min(1.15, pitch + 0.1); }
      else if (event.key === "+" || event.key === "=") { zoom(0.78); event.preventDefault(); return; }
      else if (event.key === "-" || event.key === "_") { zoom(1.28); event.preventDefault(); return; }
      else if (event.key === "Home") { reset(); event.preventDefault(); return; }
      else handled = false;
      if (handled) { event.preventDefault(); updateCamera(); }
    });
    canvas.addEventListener("webglcontextlost", function (event) { event.preventDefault(); if (fallback) fallback.hidden = false; });
    if (root.ResizeObserver) new root.ResizeObserver(resize).observe(canvas); else root.addEventListener("resize", resize);
    resize(); reset();
    return { setModel: setModel, highlightEdge: highlightEdge, reset: reset, resize: resize, render: render, setPose: setPose,
      zoom: zoom, setZoomPercent: setZoomPercent, zoomToSelected: zoomToSelected, hasSelectedPoint: function () { return !!selectedAnchor; },
      aspect: function () { return camera.aspect; },
      projectPoint: function (point, width, height) {
        camera.updateMatrixWorld();
        const projected = new T.Vector3(point[0], point[1], point[2]).project(camera);
        return [(projected.x + 1) * width / 2, (1 - projected.y) * height / 2, projected.z];
      } };
  }

  function makeExportDrawing(model, data, plan, progress, projectPoint, width, height) {
    const faces = unfoldedFaces(model, plan, progress).map(function (points, faceIndex) {
      const projected = points.map(function (point) { return projectPoint(point, width, height); });
      const center = [0, 1].map(function (axis) { return projected.reduce(function (sum, point) { return sum + point[axis]; }, 0) / projected.length; });
      const vertices = model.faces[faceIndex];
      return {
        id: "F" + faceIndex,
        depth: projected.reduce(function (sum, point) { return sum + point[2]; }, 0) / projected.length,
        points: projected,
        center: center,
        vertices: vertices.map(function (vertexId, index) {
          const point = projected[index], next = projected[(index + 1) % projected.length];
          const towardCenter = [center[0] - point[0], center[1] - point[1]];
          const length = Math.hypot(towardCenter[0], towardCenter[1]) || 1;
          const edgeMidpoint = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
          const record = data.byKey.get(edgeKey(vertexId, vertices[(index + 1) % vertices.length]));
          return {
            id: "V" + vertexId, point: point,
            label: [point[0] - towardCenter[0] * 13 / length, point[1] - towardCenter[1] * 13 / length],
            edgeId: record.id,
            edgePoint: edgeMidpoint,
            edgeLabel: [edgeMidpoint[0] + (center[0] - edgeMidpoint[0]) * 0.13, edgeMidpoint[1] + (center[1] - edgeMidpoint[1]) * 0.13]
          };
        })
      };
    });
    faces.sort(function (a, b) { return b.depth - a.depth; });
    const seenVertices = new Set(), seenEdges = new Set();
    faces.slice().reverse().forEach(function (face) {
      face.vertices.forEach(function (vertex) {
        const vertexKey = vertex.id + ':' + vertex.point.slice(0, 2).map(function (value) { return Math.round(value); }).join(':');
        const edgeKeyAtPoint = vertex.edgeId + ':' + vertex.edgePoint.map(function (value) { return Math.round(value); }).join(':');
        vertex.showVertexLabel = !seenVertices.has(vertexKey);
        vertex.showEdgeLabel = !seenEdges.has(edgeKeyAtPoint);
        seenVertices.add(vertexKey); seenEdges.add(edgeKeyAtPoint);
      });
    });
    return { width: width, height: height, faces: faces };
  }

  function xmlEscape(value) {
    return String(value).replace(/[&<>"']/g, function (character) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]; });
  }

  function drawingToSvg(drawing) {
    const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + drawing.width + '" height="' + drawing.height + '" viewBox="0 0 ' + drawing.width + ' ' + drawing.height + '">',
      '<rect width="100%" height="100%" fill="#ffffff"/>'];
    drawing.faces.forEach(function (face) {
      parts.push('<polygon points="' + face.points.map(function (point) { return point[0].toFixed(2) + ',' + point[1].toFixed(2); }).join(' ') + '" fill="#ffffff" stroke="#000000" stroke-width="2" stroke-linejoin="round"/>');
      parts.push('<text x="' + face.center[0].toFixed(2) + '" y="' + face.center[1].toFixed(2) + '" text-anchor="middle" dominant-baseline="middle" fill="#000000" font-family="Arial,sans-serif" font-weight="700" font-size="17">' + xmlEscape(face.id) + '</text>');
      face.vertices.forEach(function (vertex) {
        parts.push('<circle cx="' + vertex.point[0].toFixed(2) + '" cy="' + vertex.point[1].toFixed(2) + '" r="3" fill="#000000"/>');
        if (vertex.showVertexLabel) parts.push('<text x="' + vertex.label[0].toFixed(2) + '" y="' + vertex.label[1].toFixed(2) + '" text-anchor="middle" dominant-baseline="middle" fill="#000000" font-family="Arial,sans-serif" font-size="13">' + xmlEscape(vertex.id) + '</text>');
        if (vertex.showEdgeLabel) parts.push('<text x="' + vertex.edgeLabel[0].toFixed(2) + '" y="' + vertex.edgeLabel[1].toFixed(2) + '" text-anchor="middle" dominant-baseline="middle" fill="#000000" font-family="Arial,sans-serif" font-size="13">' + xmlEscape(vertex.edgeId) + '</text>');
      });
    });
    parts.push('</svg>');
    return parts.join('\n');
  }

  function drawingToPdf(drawing) {
    const scale = 800 / drawing.width, pageHeight = Math.round(drawing.height * scale);
    function n(value) { return (value * scale).toFixed(2); }
    function path(points) {
      return n(points[0][0]) + ' ' + n(drawing.height - points[0][1]) + ' m ' + points.slice(1).map(function (point) { return n(point[0]) + ' ' + n(drawing.height - point[1]) + ' l'; }).join(' ') + ' h';
    }
    function label(value, point, size) {
      const safe = String(value).replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');
      const approximateWidth = safe.length * size * scale * 0.32;
      return 'BT /F1 ' + n(size) + ' Tf ' + (Number(n(point[0])) - approximateWidth).toFixed(2) + ' ' + n(drawing.height - point[1] - size * 0.35) + ' Td (' + safe + ') Tj ET';
    }
    const commands = ['1 1 1 rg 0 0 ' + n(drawing.width) + ' ' + n(drawing.height) + ' re f', '0 0 0 RG 0 0 0 rg ' + n(2) + ' w'];
    drawing.faces.forEach(function (face) {
      const outline = path(face.points);
      commands.push('1 1 1 rg ' + outline + ' f', '0 0 0 RG 0 0 0 rg ' + outline + ' S', label(face.id, face.center, 17));
      face.vertices.forEach(function (vertex) {
        commands.push(n(vertex.point[0] - 2) + ' ' + n(drawing.height - vertex.point[1] - 2) + ' ' + n(4) + ' ' + n(4) + ' re f');
        if (vertex.showVertexLabel) commands.push(label(vertex.id, vertex.label, 13));
        if (vertex.showEdgeLabel) commands.push(label(vertex.edgeId, vertex.edgeLabel, 13));
      });
    });
    const stream = commands.join('\n') + '\n';
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 ' + pageHeight + '] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream'
    ];
    let pdf = '%PDF-1.4\n', offsets = [0];
    objects.forEach(function (object, index) { offsets.push(pdf.length); pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
    const xref = pdf.length;
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.slice(1).forEach(function (offset) { pdf += String(offset).padStart(10, '0') + ' 00000 n \n'; });
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return Uint8Array.from(pdf, function (character) { return character.charCodeAt(0); });
  }

  function csvRows(rows) {
    return rows.map(function (row) {
      return row.map(function (cell) {
        return Number.isInteger(cell) ? String(cell) : '"' + String(cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n') + '\r\n';
  }

  function csvId(label) { return label ? Number(label.slice(1)) : ''; }

  function wingedCsv(data) {
    const columns = ['Edge', 'V1', 'V2', 'Left Face', 'Right Face', 'Left Previous', 'Left Next', 'Right Previous', 'Right Next'];
    const rows = data.edges.map(function (record) {
      return [csvId(record.id), record.a, record.b, csvId(record.leftFace), csvId(record.rightFace),
        csvId(record.leftPrev), csvId(record.leftNext), csvId(record.rightPrev), csvId(record.rightNext)];
    });
    return csvRows([columns].concat(rows));
  }

  function halfEdgeCsv(data) {
    const columns = ['Half-edge', 'Origin', 'Destination', 'Twin', 'Next', 'Previous', 'Face', 'Edge'];
    const rows = data.halfEdges.map(function (record) {
      return [csvId(record.id), csvId(record.origin), csvId(record.destination), csvId(record.twin),
        csvId(record.next), csvId(record.prev), csvId(record.face), csvId(record.edge)];
    });
    return csvRows([columns].concat(rows));
  }

  function downloadFile(filename, contents, type) {
    const url = root.URL.createObjectURL(new root.Blob([contents], { type: type }));
    const link = root.document.createElement('a');
    link.href = url; link.download = filename;
    root.document.body.appendChild(link); link.click(); link.remove();
    root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 60000);
  }

  function lineSegmentsGroup(segments, color) {
    const group = new T.Group();
    segments.forEach(function (segment) { group.add(cylinderBetween(segment[0], segment[1], 0.018, new T.MeshBasicMaterial({ color: color }))); });
    return group;
  }

  function boxEdges(width, height, depth) {
    const x = width / 2, y = height / 2, z = depth / 2;
    const v = [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]];
    const pairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    return pairs.map(function (pair) { return [v[pair[0]], v[pair[1]]]; });
  }

  function makeEulerCube() {
    const group = new T.Group();
    group.add(new T.Mesh(new T.BoxGeometry(2.4, 2.4, 2.4), new T.MeshStandardMaterial({ color: 0x8fd5ef, roughness: 0.6, transparent: true, opacity: 0.8 })));
    group.add(lineSegmentsGroup(boxEdges(2.4, 2.4, 2.4), 0x233a5d));
    return group;
  }

  function makeThroughHole() {
    const group = new T.Group(), outer = [[-1.7,-1.25],[1.7,-1.25],[1.7,1.25],[-1.7,1.25]], inner = [[-.55,-.48],[.55,-.48],[.55,.48],[-.55,.48]];
    const triangles = [];
    function point(source, index, z) { return [source[index][0], source[index][1], z]; }
    function quad(a, b, c, d) { triangles.push([a,b,c], [a,c,d]); }
    for (let i = 0; i < 4; i += 1) {
      const n = (i + 1) % 4;
      quad(point(outer,i,.72), point(outer,n,.72), point(inner,n,.72), point(inner,i,.72));
      quad(point(outer,n,-.72), point(outer,i,-.72), point(inner,i,-.72), point(inner,n,-.72));
      quad(point(outer,i,-.72), point(outer,n,-.72), point(outer,n,.72), point(outer,i,.72));
      quad(point(inner,n,-.72), point(inner,i,-.72), point(inner,i,.72), point(inner,n,.72));
    }
    const positions = [];
    triangles.forEach(function (triangle) { triangle.forEach(function (pointValue) { positions.push.apply(positions, pointValue); }); });
    const geometry = new T.BufferGeometry(); geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
    group.add(new T.Mesh(geometry, new T.MeshStandardMaterial({ color: 0x8fd5ef, roughness: 0.62, side: T.DoubleSide, transparent: true, opacity: 0.85 })));
    const segments = [];
    [outer, inner].forEach(function (ring) {
      [-.72, .72].forEach(function (z) { for (let i = 0; i < 4; i += 1) segments.push([point(ring,i,z), point(ring,(i+1)%4,z)]); });
      for (let i = 0; i < 4; i += 1) segments.push([point(ring,i,-.72), point(ring,i,.72)]);
    });
    group.add(lineSegmentsGroup(segments, 0x233a5d));
    return group;
  }

  function makeCavity() {
    const group = new T.Group();
    group.add(new T.Mesh(new T.BoxGeometry(3.15, 2.55, 2.25), new T.MeshStandardMaterial({ color: 0x8fd5ef, roughness: 0.6, transparent: true, opacity: 0.23, side: T.DoubleSide, depthWrite: false })));
    group.add(lineSegmentsGroup(boxEdges(3.15, 2.55, 2.25), 0x4a6b8a));
    group.add(new T.Mesh(new T.BoxGeometry(1.35, 1.05, .95), new T.MeshStandardMaterial({ color: 0xff9d70, roughness: 0.65, transparent: true, opacity: 0.83, side: T.DoubleSide })));
    group.add(lineSegmentsGroup(boxEdges(1.35, 1.05, .95), 0xa73c25));
    return group;
  }

  const EULER_MODELS = {
    cube: { counts: {V:8,E:12,F:6,L:6,S:1,G:0}, make: makeEulerCube, explanation: "A single closed shell. Every face has exactly one outer loop, so L = F." },
    "through-hole": { counts: {V:16,E:24,F:10,L:12,S:1,G:1}, make: makeThroughHole, explanation: "The top and bottom faces each have an outer loop and an inner loop. The tunnel makes the one boundary shell genus 1." },
    cavity: { counts: {V:16,E:24,F:12,L:12,S:2,G:0}, make: makeCavity, explanation: "The enclosed void contributes a second closed boundary shell. It is not an inner loop in a face." }
  };

  function mountEulerLab(lab) {
    const canvas = lab.querySelector("[data-euler-canvas]"), fallback = lab.querySelector("[data-euler-fallback]");
    const viewer = createViewer(canvas, fallback);
    const explanation = lab.querySelector("[data-euler-explanation]"), substitution = lab.querySelector("[data-euler-substitution]");
    const result = lab.querySelector("[data-euler-result]"), status = lab.querySelector("[data-euler-status]");
    function select(name) {
      const example = EULER_MODELS[name], c = example.counts;
      lab.querySelectorAll("[data-count]").forEach(function (node) { node.textContent = c[node.dataset.count]; });
      explanation.textContent = example.explanation;
      const left = c.V - c.E + 2 * c.F - c.L, right = 2 * (c.S - c.G);
      substitution.textContent = c.V + " − " + c.E + " + 2(" + c.F + ") − " + c.L + " = " + left;
      result.textContent = "2(" + c.S + " − " + c.G + ") = " + right + "  ✓";
      status.textContent = example.explanation + " Both sides of the Euler–Poincaré relation equal " + left + ".";
      canvas.setAttribute("aria-label", name.replace("-", " ") + " B-Rep: V " + c.V + ", E " + c.E + ", F " + c.F + ", L " + c.L + ", S " + c.S + ", G " + c.G + ".");
      if (viewer) viewer.setModel(example.make());
    }
    lab.querySelectorAll("input[name='euler-model']").forEach(function (input) { input.addEventListener("change", function () { if (input.checked) select(input.value); }); });
    lab.querySelector("[data-euler-reset]").addEventListener("click", function () { if (viewer) viewer.reset(); });
    select("cube");
  }

  function mountWingedLab(lab) {
    const select = lab.querySelector("[data-winged-solid]"), selectedPointLabel = lab.querySelector("[data-selected-point]");
    const slider = lab.querySelector("[data-winged-progress]"), progressOutput = lab.querySelector("[data-winged-progress-output]");
    const playButton = lab.querySelector("[data-unfold]"), closeButton = lab.querySelector("[data-fold]");
    const zoomSlider = lab.querySelector("[data-zoom-slider]"), zoomOutput = lab.querySelector("[data-zoom-output]");
    const zoomPointButton = lab.querySelector("[data-zoom-point]"), resetViewButton = lab.querySelector("[data-view-reset]");
    const labelsInput = lab.querySelector("[data-show-labels]"), fullscreenButton = lab.querySelector("[data-fullscreen]");
    const svgButton = lab.querySelector("[data-download-svg]"), pdfButton = lab.querySelector("[data-download-pdf]");
    const csvButton = lab.querySelector("[data-download-csv]"), halfEdgeButton = lab.querySelector("[data-download-halfedges]");
    const figure = lab.querySelector(".winged-view");
    const live = lab.querySelector("[data-winged-live]");
    let model, data, halfEdgeData, plan, net, panelGroup, progress = 0, animationFrame = null;
    const viewer = createViewer(lab.querySelector("[data-winged-canvas]"), lab.querySelector("[data-winged-fallback]"), handlePick, function (percent) {
      zoomSlider.value = String(percent); zoomOutput.textContent = percent + "%";
    });
    function stopAnimation() {
      if (animationFrame !== null) root.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    function updateProgress(value) {
      progress = Math.max(0, Math.min(1, value));
      slider.value = String(Math.round(progress * 100));
      progressOutput.textContent = Math.round(progress * 100) + "%" + (progress === 0 ? " · solid" : progress === 1 ? " · planar" : " · opening");
      playButton.textContent = progress >= 1 ? "Replay opening" : progress > 0 ? "Continue opening" : "Open all faces";
      if (panelGroup) panelGroup.userData.updateProgress(progress);
      if (viewer && net && plan) {
        const bounds = net.bounds, centerX = (bounds.minX + bounds.maxX) / 2, centerY = (bounds.minY + bounds.maxY) / 2;
        const center = [0, 1, 2].map(function (coordinate) { return net.origin[coordinate] + net.u[coordinate] * centerX + net.v[coordinate] * centerY; });
        const halfFov = Math.tan(18 * Math.PI / 180), aspect = Math.max(0.25, viewer.aspect());
        const planarDistance = Math.max(6.4, (bounds.maxX - bounds.minX) / (2 * halfFov * aspect), (bounds.maxY - bounds.minY) / (2 * halfFov)) * 1.24;
        const finalYaw = Math.atan2(plan.normal[0], plan.normal[2]), finalPitch = Math.asin(plan.normal[1]);
        const yawDelta = Math.atan2(Math.sin(finalYaw - 0.72), Math.cos(finalYaw - 0.72));
        const blend = progress * progress * (3 - 2 * progress);
        const up = vecNormalize([blend * net.v[0], (1 - blend) + blend * net.v[1], blend * net.v[2]]);
        viewer.setPose(center.map(function (coordinate) { return coordinate * blend; }), 0.72 + yawDelta * blend, 0.4 + (finalPitch - 0.4) * blend, 6.4 + (planarDistance - 6.4) * blend, up);
      }
    }
    function selectEdge(edgeId) {
      const record = data.byId.get(edgeId);
      if (!record) return;
      lab.querySelector("[data-edge-title]").textContent = "Edge " + record.id;
      lab.querySelector("[data-edge-pair]").textContent = "V" + record.a + " → V" + record.b;
      lab.querySelector("[data-edge-field='v1']").textContent = "V" + record.a;
      lab.querySelector("[data-edge-field='v2']").textContent = "V" + record.b;
      ["leftFace", "rightFace", "leftPrev", "leftNext", "rightPrev", "rightNext"].forEach(function (field) {
        lab.querySelector("[data-edge-field='" + field + "']").textContent = record[field] || "boundary";
      });
      lab.querySelector("[data-edge-reading]").textContent = record.id + " is directed from V" + record.a + " to V" + record.b + ". Following that direction, " + record.leftFace + " lies on the left and " + record.rightFace + " lies on the right; the four wing pointers continue the two face loops.";
      if (viewer) viewer.highlightEdge(edgeId);
      live.textContent = "Selected " + record.id + ", endpoints V" + record.a + " and V" + record.b + ", left face " + record.leftFace + ", right face " + record.rightFace + ".";
    }
    function handlePick(selection) {
      const label = Number.isInteger(selection.vertexId) ? "V" + selection.vertexId : selection.edgeId ? "point on " + selection.edgeId : "point on " + selection.faceId;
      selectedPointLabel.textContent = "Zoom point: " + label + " (" + selection.point.map(function (value) { return value.toFixed(2); }).join(", ") + ")";
      zoomPointButton.disabled = false;
      if (selection.edgeId) selectEdge(selection.edgeId);
      else live.textContent = "Selected zoom point " + label + ". Use Zoom to selected point, the slider, or the wheel.";
    }
    function setModel(name) {
      stopAnimation();
      model = MODELS[name]; data = buildWingedData(model); halfEdgeData = buildHalfEdgeData(model, data);
      plan = buildUnfoldPlan(model); net = netCoordinates(model, plan);
      panelGroup = viewer ? makeWingedGroup(model, data, plan) : null;
      if (viewer) {
        panelGroup.userData.setLabelsVisible(labelsInput.checked);
        viewer.setModel(panelGroup, panelGroup.userData.pickables);
      }
      selectedPointLabel.textContent = "Zoom point: model center. Click the solid to select a point.";
      zoomPointButton.disabled = true;
      const canvas = lab.querySelector("[data-winged-canvas]");
      canvas.setAttribute("aria-label", model.label + " with " + model.vertices.length + " labeled vertices, " + data.edges.length + " selectable labeled edges, and " + model.faces.length + " faces that unfold into one plane. Drag to pan, Shift-drag to rotate, or click a point to zoom around it.");
      updateProgress(0);
      selectEdge(data.edges[0].id);
    }
    select.addEventListener("change", function () { setModel(select.value); });
    slider.addEventListener("input", function () { stopAnimation(); updateProgress(Number(slider.value) / 100); });
    closeButton.addEventListener("click", function () { stopAnimation(); updateProgress(0); live.textContent = model.label + " folded into a solid."; });
    zoomSlider.addEventListener("input", function () { if (viewer) viewer.setZoomPercent(zoomSlider.value); });
    zoomPointButton.addEventListener("click", function () { if (viewer) viewer.zoomToSelected(); });
    resetViewButton.addEventListener("click", function () { if (viewer) updateProgress(progress); });
    labelsInput.addEventListener("change", function () {
      if (panelGroup) panelGroup.userData.setLabelsVisible(labelsInput.checked);
      if (viewer) viewer.render();
    });
    function exportDrawing() {
      if (!viewer) { live.textContent = "Diagram export requires a browser with WebGL."; return null; }
      const width = 1200, height = Math.max(400, Math.round(width / viewer.aspect()));
      return makeExportDrawing(model, data, plan, progress, viewer.projectPoint, width, height);
    }
    svgButton.addEventListener("click", function () {
      const drawing = exportDrawing(); if (!drawing) return;
      downloadFile(select.value + "-winged-edge.svg", drawingToSvg(drawing), "image/svg+xml;charset=utf-8");
      live.textContent = model.label + " SVG diagram downloaded.";
    });
    pdfButton.addEventListener("click", function () {
      const drawing = exportDrawing(); if (!drawing) return;
      downloadFile(select.value + "-winged-edge.pdf", drawingToPdf(drawing), "application/pdf");
      live.textContent = model.label + " PDF diagram downloaded.";
    });
    csvButton.addEventListener("click", function () {
      downloadFile(select.value + "-winged-edges.csv", wingedCsv(data), "text/csv;charset=utf-8");
      live.textContent = "All " + data.edges.length + " edges of the " + model.label + " downloaded as CSV.";
    });
    halfEdgeButton.addEventListener("click", function () {
      downloadFile(select.value + "-half-edges.csv", halfEdgeCsv(halfEdgeData), "text/csv;charset=utf-8");
      live.textContent = "All " + halfEdgeData.halfEdges.length + " directed half-edges of the " + model.label + " downloaded as CSV.";
    });
    function syncFullscreen() {
      const active = root.document.fullscreenElement === figure;
      fullscreenButton.textContent = active ? "Exit full screen" : "Full screen";
      fullscreenButton.setAttribute("aria-pressed", String(active));
      if (viewer) root.requestAnimationFrame(function () { viewer.resize(); });
    }
    fullscreenButton.addEventListener("click", function () {
      try {
        const action = root.document.fullscreenElement === figure ? root.document.exitFullscreen && root.document.exitFullscreen() : figure.requestFullscreen && figure.requestFullscreen();
        if (!action || typeof action.catch !== "function") {
          live.textContent = "Full screen is unavailable in this browser.";
          return;
        }
        action.catch(function () { live.textContent = "Full screen could not be opened here."; });
      } catch (_) {
        live.textContent = "Full screen could not be opened here.";
      }
    });
    root.document.addEventListener("fullscreenchange", syncFullscreen);
    playButton.addEventListener("click", function () {
      stopAnimation();
      if (progress >= 1) updateProgress(0);
      if (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        updateProgress(1); live.textContent = model.label + " opened into a single plane."; return;
      }
      const startProgress = progress, duration = 2400 * (1 - startProgress);
      let startTime = null;
      function frame(time) {
        if (startTime === null) startTime = time;
        const fraction = Math.min(1, (time - startTime) / duration);
        updateProgress(startProgress + (1 - startProgress) * fraction);
        if (fraction < 1) animationFrame = root.requestAnimationFrame(frame);
        else { animationFrame = null; live.textContent = model.label + " opened into a single plane. Every face remains attached along the displayed hinge tree."; }
      }
      animationFrame = root.requestAnimationFrame(frame);
    });
    setModel(select.value);
  }

  function mount() {
    root.document.querySelectorAll("[data-euler-lab]").forEach(mountEulerLab);
    root.document.querySelectorAll("[data-winged-lab]").forEach(mountWingedLab);
  }

  const API = { MODELS: MODELS, buildWingedData: buildWingedData, buildHalfEdgeData: buildHalfEdgeData, buildUnfoldPlan: buildUnfoldPlan, unfoldedFaces: unfoldedFaces, unfoldMatrices: unfoldMatrices, netCoordinates: netCoordinates, makeWingedGroup: makeWingedGroup, createViewer: createViewer, makeExportDrawing: makeExportDrawing, drawingToSvg: drawingToSvg, drawingToPdf: drawingToPdf, wingedCsv: wingedCsv, halfEdgeCsv: halfEdgeCsv, orientFaces: orientFaces, edgeKey: edgeKey };
  root.SolidModelingLab = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
