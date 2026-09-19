(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EulerSquareLab = api;

  if (root && root.document) {
    const start = function () { api.mountAll(root.document); };
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", start, { once: true });
    } else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEW_SIZE = 360;
  const INSET = 38;
  const MOVE_MARGIN = 16;
  const MIN_BARYCENTRIC_WEIGHT = 0.14;
  const MAX_BEND = 0.32;
  const MAX_CONTROL_ALONG = 0.45;
  const EPSILON = 1e-9;
  const FACE_COLORS = ["#f4a261", "#e9c46a", "#8ecae6", "#90be6d", "#cdb4db", "#ffafcc"];
  const DEFAULT_SHAPE = "rectangle";
  const SHAPE_LABELS = Object.freeze({
    triangle: "Triangle",
    rectangle: "Rectangle",
    circle: "Circle",
    ellipse: "Ellipse"
  });

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function seedToUint32(seed) {
    const text = String(seed == null ? "euler-square" : seed);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return hash >>> 0;
  }

  function createSeededRandom(seed) {
    let state = seedToUint32(seed) || 0x6d2b79f5;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function edgeKey(a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) {
      throw new RangeError("An edge requires two distinct integer vertex ids.");
    }
    return a < b ? a + ":" + b : b + ":" + a;
  }

  function signedArea2(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function faceArea2(face, vertices) {
    const ids = face.vertices;
    return signedArea2(vertices[ids[0]], vertices[ids[1]], vertices[ids[2]]);
  }

  function orientedFace(id, a, b, c, vertices) {
    const ids = signedArea2(vertices[a], vertices[b], vertices[c]) >= 0 ? [a, b, c] : [a, c, b];
    return { id, vertices: ids, active: true, homeArea2: 0 };
  }

  function buildEdges(faces) {
    if (!Array.isArray(faces)) throw new TypeError("Faces must be an array.");
    const byKey = new Map();
    faces.forEach(function (face) {
      if (!face || !Array.isArray(face.vertices) || face.vertices.length !== 3) {
        throw new RangeError("Every face must contain three vertex ids.");
      }
      for (let i = 0; i < 3; i++) {
        const a = face.vertices[i], b = face.vertices[(i + 1) % 3];
        const key = edgeKey(a, b);
        if (!byKey.has(key)) {
          byKey.set(key, {
            id: "e-" + key.replace(":", "-"), key, a: Math.min(a, b), b: Math.max(a, b),
            bend: 0, homeBend: 0, controlAlong: 0, homeControlAlong: 0, faces: []
          });
        }
        byKey.get(key).faces.push(face.id);
      }
    });
    return Array.from(byKey.values()).sort(function (left, right) {
      return left.a - right.a || left.b - right.b;
    });
  }

  function normalizeShape(shape) {
    const key = String(shape == null ? DEFAULT_SHAPE : shape).trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(SHAPE_LABELS, key)) {
      throw new RangeError("Shape must be triangle, rectangle, circle, or ellipse.");
    }
    return key;
  }

  function makeVertex(id, x, y, boundary) {
    return { id, x, y, homeX: x, homeY: y, boundary: Boolean(boundary) };
  }

  function projectedControl(a, b, control) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < EPSILON) return { along: 0, bend: 0 };
    const midpointX = (a.x + b.x) / 2, midpointY = (a.y + b.y) / 2;
    return {
      along: ((control.x - midpointX) * (dx / length) + (control.y - midpointY) * (dy / length)) / length,
      bend: ((control.x - midpointX) * (-dy / length) + (control.y - midpointY) * (dx / length)) / length
    };
  }

  function projectedBend(a, b, control) {
    return projectedControl(a, b, control).bend;
  }

  function triangulateConvexBoundary(boundary, vertices, random, nextFaceId) {
    const ring = boundary.slice(), faces = [];
    while (ring.length > 3) {
      const earIndex = Math.floor(random() * ring.length);
      const previous = ring[(earIndex + ring.length - 1) % ring.length];
      const current = ring[earIndex];
      const next = ring[(earIndex + 1) % ring.length];
      faces.push(orientedFace(nextFaceId++, previous, current, next, vertices));
      ring.splice(earIndex, 1);
    }
    faces.push(orientedFace(nextFaceId++, ring[0], ring[1], ring[2], vertices));
    return { faces, nextFaceId };
  }

  function createBaseShape(shape, random) {
    const vertices = [], faces = [], boundary = [], boundaryControls = new Map();
    let nextFaceId = 0;

    if (shape === "triangle") {
      [[180, 38], [322, 300], [38, 300]].forEach(function (point, id) {
        vertices.push(makeVertex(id, point[0], point[1], true)); boundary.push(id);
      });
      faces.push(orientedFace(nextFaceId++, 0, 1, 2, vertices));
    } else if (shape === "rectangle") {
      [[38, 76], [322, 76], [322, 284], [38, 284]].forEach(function (point, id) {
        vertices.push(makeVertex(id, point[0], point[1], true)); boundary.push(id);
      });
      if (random() < 0.5) {
        faces.push(orientedFace(nextFaceId++, 0, 1, 2, vertices), orientedFace(nextFaceId++, 0, 2, 3, vertices));
      } else {
        faces.push(orientedFace(nextFaceId++, 0, 1, 3, vertices), orientedFace(nextFaceId++, 1, 2, 3, vertices));
      }
    } else {
      const segmentCount = 8, centerX = VIEW_SIZE / 2, centerY = VIEW_SIZE / 2;
      const radiusX = 142, radiusY = shape === "circle" ? 142 : 98;
      const step = Math.PI * 2 / segmentCount;
      for (let index = 0; index < segmentCount; index++) {
        const angle = -Math.PI / 2 + index * step;
        vertices.push(makeVertex(index, centerX + radiusX * Math.cos(angle), centerY + radiusY * Math.sin(angle), true));
        boundary.push(index);
      }
      for (let index = 0; index < segmentCount; index++) {
        const next = (index + 1) % segmentCount;
        const middleAngle = -Math.PI / 2 + (index + 0.5) * step;
        boundaryControls.set(edgeKey(index, next), {
          x: centerX + radiusX * Math.cos(middleAngle) / Math.cos(step / 2),
          y: centerY + radiusY * Math.sin(middleAngle) / Math.cos(step / 2)
        });
      }
      const triangulation = triangulateConvexBoundary(boundary, vertices, random, nextFaceId);
      faces.push.apply(faces, triangulation.faces);
      nextFaceId = triangulation.nextFaceId;
    }

    return { vertices, faces, boundary, boundaryControls, nextFaceId };
  }

  function interiorBarycentric(random) {
    for (let attempt = 0; attempt < 160; attempt++) {
      let u = random(), v = random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const weights = [1 - u - v, u, v];
      if (Math.min.apply(null, weights) >= MIN_BARYCENTRIC_WEIGHT) return weights;
    }
    return [1 / 3, 1 / 3, 1 / 3];
  }

  function weightedFaceIndex(faces, vertices, random) {
    const weights = faces.map(function (face) { return Math.max(EPSILON, Math.abs(faceArea2(face, vertices))); });
    const total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    let target = random() * total;
    for (let i = 0; i < weights.length; i++) {
      target -= weights[i];
      if (target <= 0) return i;
    }
    return faces.length - 1;
  }

  function generateTriangulation(options) {
    options = options || {};
    const splitCount = options.splits == null ? 4 : Number(options.splits);
    if (!Number.isInteger(splitCount) || splitCount < 0 || splitCount > 14) {
      throw new RangeError("Use an integer split count from 0 to 14.");
    }
    const shape = normalizeShape(options.shape);
    const seed = options.seed == null ? "euler-partition" : String(options.seed);
    const random = createSeededRandom(seed);
    const base = createBaseShape(shape, random);
    const vertices = base.vertices, faces = base.faces, boundary = base.boundary;
    let nextFaceId = base.nextFaceId;

    for (let split = 0; split < splitCount; split++) {
      const selectedIndex = weightedFaceIndex(faces, vertices, random);
      const selected = faces[selectedIndex];
      const weights = interiorBarycentric(random);
      const points = selected.vertices.map(function (id) { return vertices[id]; });
      const x = points.reduce(function (sum, point, index) { return sum + point.x * weights[index]; }, 0);
      const y = points.reduce(function (sum, point, index) { return sum + point.y * weights[index]; }, 0);
      const vertexId = vertices.length;
      vertices.push({ id: vertexId, x, y, homeX: x, homeY: y, boundary: false });
      const ids = selected.vertices;
      const replacements = [
        orientedFace(nextFaceId++, ids[0], ids[1], vertexId, vertices),
        orientedFace(nextFaceId++, ids[1], ids[2], vertexId, vertices),
        orientedFace(nextFaceId++, ids[2], ids[0], vertexId, vertices)
      ];
      faces.splice.apply(faces, [selectedIndex, 1].concat(replacements));
    }
    const edges = buildEdges(faces);
    edges.forEach(function (edge) {
      const desiredControl = base.boundaryControls.get(edge.key);
      const projection = desiredControl
        ? projectedControl(vertices[edge.a], vertices[edge.b], desiredControl)
        : { along: 0, bend: 0 };
      edge.homeControlAlong = clamp(projection.along, -MAX_CONTROL_ALONG, MAX_CONTROL_ALONG);
      edge.controlAlong = edge.homeControlAlong;
      edge.homeBend = clamp(projection.bend, -MAX_BEND, MAX_BEND);
      edge.bend = edge.homeBend;
    });
    faces.forEach(function (face) { face.homeArea2 = faceArea2(face, vertices); });
    return { shape, seed, splitCount, vertices, faces, edges, boundary };
  }

  function counts(mesh) {
    if (!mesh || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.edges) || !Array.isArray(mesh.faces)) {
      throw new TypeError("A triangulation mesh is required.");
    }
    const cells = activeCellSets(mesh);
    const V = cells.vertexIds.size;
    const E = cells.edgeKeys.size;
    const F = cells.faceIds.size;
    return { V, E, F, chi: V - E + F };
  }

  function activeCellSets(mesh) {
    if (!mesh || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces) || !Array.isArray(mesh.edges)) {
      throw new TypeError("A triangulation mesh is required.");
    }
    const faceIds = new Set(), edgeKeys = new Set(), vertexIds = new Set();
    mesh.faces.forEach(function (face) {
      if (face.active === false) return;
      faceIds.add(face.id);
      face.vertices.forEach(function (vertexId) { vertexIds.add(vertexId); });
    });
    mesh.edges.forEach(function (edge) {
      if (edge.faces.some(function (faceId) { return faceIds.has(faceId); })) edgeKeys.add(edge.key);
    });
    return { faceIds, edgeKeys, vertexIds };
  }

  function removedEdgeKeys(mesh) {
    const active = activeCellSets(mesh).edgeKeys;
    return new Set(mesh.edges.filter(function (edge) { return !active.has(edge.key); }).map(function (edge) { return edge.key; }));
  }

  function removedVertexIds(mesh) {
    const active = activeCellSets(mesh).vertexIds;
    return new Set(mesh.vertices.filter(function (vertex) { return !active.has(vertex.id); }).map(function (vertex) { return vertex.id; }));
  }

  function controlPoint(edge, vertices) {
    const a = vertices[edge.a], b = vertices[edge.b];
    if (!a || !b) throw new RangeError("The edge refers to a missing vertex.");
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (length < EPSILON) return midpoint;
    const along = Number.isFinite(edge.controlAlong) ? edge.controlAlong : 0;
    return { x: midpoint.x + dx * along - dy * edge.bend, y: midpoint.y + dy * along + dx * edge.bend };
  }

  function edgeCurvePoints(edge, vertices, segments) {
    const count = segments == null ? 20 : Math.max(4, Math.round(segments));
    const a = vertices[edge.a], b = vertices[edge.b], control = controlPoint(edge, vertices);
    const points = [];
    for (let index = 0; index <= count; index++) {
      const t = index / count, u = 1 - t;
      points.push({
        x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
        y: u * u * a.y + 2 * u * t * control.y + t * t * b.y
      });
    }
    return points;
  }

  function formatNumber(value) {
    return Number(value.toFixed(2)).toString();
  }

  function facePath(mesh, face) {
    const edges = new Map(mesh.edges.map(function (edge) { return [edge.key, edge]; }));
    const ids = face.vertices;
    const p0 = mesh.vertices[ids[0]], p1 = mesh.vertices[ids[1]], p2 = mesh.vertices[ids[2]];
    const h01 = controlPoint(edges.get(edgeKey(ids[0], ids[1])), mesh.vertices);
    const h12 = controlPoint(edges.get(edgeKey(ids[1], ids[2])), mesh.vertices);
    const h20 = controlPoint(edges.get(edgeKey(ids[2], ids[0])), mesh.vertices);
    return "M " + formatNumber(p0.x) + " " + formatNumber(p0.y) +
      " Q " + formatNumber(h01.x) + " " + formatNumber(h01.y) + " " + formatNumber(p1.x) + " " + formatNumber(p1.y) +
      " Q " + formatNumber(h12.x) + " " + formatNumber(h12.y) + " " + formatNumber(p2.x) + " " + formatNumber(p2.y) +
      " Q " + formatNumber(h20.x) + " " + formatNumber(h20.y) + " " + formatNumber(p0.x) + " " + formatNumber(p0.y) + " Z";
  }

  function orientation(a, b, c) {
    const value = signedArea2(a, b, c);
    return Math.abs(value) <= EPSILON ? 0 : Math.sign(value);
  }

  function properSegmentsIntersect(a, b, c, d) {
    return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
  }

  function boundarySelfIntersects(boundary) {
    const count = boundary.length;
    for (let first = 0; first < count; first++) {
      const firstNext = (first + 1) % count;
      for (let second = first + 1; second < count; second++) {
        const secondNext = (second + 1) % count;
        if (first === second || firstNext === second || secondNext === first) continue;
        if (properSegmentsIntersect(boundary[first], boundary[firstNext], boundary[second], boundary[secondNext])) return true;
      }
    }
    return false;
  }

  function isValidVertexMove(mesh, vertexId, x, y) {
    if (!Number.isInteger(vertexId) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < MOVE_MARGIN || x > VIEW_SIZE - MOVE_MARGIN || y < MOVE_MARGIN || y > VIEW_SIZE - MOVE_MARGIN) return false;
    if (!mesh.vertices[vertexId]) return false;
    const vertices = mesh.vertices.map(function (vertex) {
      return vertex.id === vertexId ? Object.assign({}, vertex, { x, y }) : vertex;
    });
    for (const face of mesh.faces) {
      const area = faceArea2(face, vertices);
      const homeSign = Math.sign(face.homeArea2 || 1);
      const minimum = Math.max(3, Math.abs(face.homeArea2) * 0.025);
      if (Math.sign(area) !== homeSign || Math.abs(area) < minimum) return false;
    }
    const boundary = mesh.boundary.map(function (id) { return vertices[id]; });
    if (boundarySelfIntersects(boundary)) return false;
    return true;
  }

  function moveVertex(mesh, vertexId, x, y) {
    if (!isValidVertexMove(mesh, vertexId, x, y)) return mesh;
    return Object.assign({}, mesh, {
      vertices: mesh.vertices.map(function (vertex) {
        return vertex.id === vertexId ? Object.assign({}, vertex, { x, y }) : vertex;
      })
    });
  }

  function setEdgeControl(mesh, key, along, bend) {
    if (!Number.isFinite(along) || !Number.isFinite(bend)) throw new RangeError("Edge control coordinates must be finite.");
    const index = mesh.edges.findIndex(function (edge) { return edge.key === key; });
    if (index < 0) throw new RangeError("Unknown edge " + key + ".");
    const safeAlong = clamp(along, -MAX_CONTROL_ALONG, MAX_CONTROL_ALONG);
    const safeBend = clamp(bend, -MAX_BEND, MAX_BEND);
    return Object.assign({}, mesh, {
      edges: mesh.edges.map(function (edge, edgeIndex) {
        return edgeIndex === index ? Object.assign({}, edge, { controlAlong: safeAlong, bend: safeBend }) : edge;
      })
    });
  }

  function setEdgeBend(mesh, key, bend) {
    if (!Number.isFinite(bend)) throw new RangeError("Edge bend must be finite.");
    const edge = mesh.edges.find(function (item) { return item.key === key; });
    if (!edge) throw new RangeError("Unknown edge " + key + ".");
    return setEdgeControl(mesh, key, edge.controlAlong || 0, bend);
  }

  function isValidEdgeControl(mesh, key, along, bend) {
    if (!Number.isFinite(along) || !Number.isFinite(bend)) return false;
    let candidate;
    try { candidate = setEdgeControl(mesh, key, along, bend); }
    catch (_error) { return false; }
    const target = candidate.edges.find(function (edge) { return edge.key === key; });
    const targetPoints = edgeCurvePoints(target, candidate.vertices);
    return candidate.edges.every(function (edge) {
      if (edge.key === key) return true;
      const otherPoints = edgeCurvePoints(edge, candidate.vertices);
      for (let first = 0; first < targetPoints.length - 1; first++) {
        for (let second = 0; second < otherPoints.length - 1; second++) {
          if (properSegmentsIntersect(targetPoints[first], targetPoints[first + 1], otherPoints[second], otherPoints[second + 1])) {
            return false;
          }
        }
      }
      return true;
    });
  }

  function moveEdgeControl(mesh, key, along, bend) {
    return isValidEdgeControl(mesh, key, along, bend) ? setEdgeControl(mesh, key, along, bend) : mesh;
  }

  function setFaceActive(mesh, faceId, active) {
    const index = mesh.faces.findIndex(function (face) { return face.id === faceId; });
    if (index < 0) throw new RangeError("Unknown face " + faceId + ".");
    return Object.assign({}, mesh, {
      faces: mesh.faces.map(function (face, faceIndex) {
        return faceIndex === index ? Object.assign({}, face, { active: Boolean(active) }) : face;
      })
    });
  }

  function removeFace(mesh, faceId) {
    return setFaceActive(mesh, faceId, false);
  }

  function restoreFaces(mesh) {
    return Object.assign({}, mesh, {
      faces: mesh.faces.map(function (face) { return Object.assign({}, face, { active: true }); })
    });
  }

  function resetGeometry(mesh) {
    return Object.assign({}, mesh, {
      vertices: mesh.vertices.map(function (vertex) {
        return Object.assign({}, vertex, { x: vertex.homeX, y: vertex.homeY });
      }),
      edges: mesh.edges.map(function (edge) {
        return Object.assign({}, edge, {
          bend: edge.homeBend || 0,
          controlAlong: edge.homeControlAlong || 0
        });
      })
    });
  }

  function validateTriangulation(mesh) {
    const errors = [];
    const completeChi = mesh.vertices.length - mesh.edges.length + mesh.faces.length;
    if (completeChi !== 1) errors.push("The complete triangulation must have Euler characteristic 1.");
    mesh.faces.forEach(function (face) {
      if (faceArea2(face, mesh.vertices) <= EPSILON) errors.push("Face " + face.id + " is degenerate or reversed.");
    });
    mesh.edges.forEach(function (edge) {
      if (edge.faces.length < 1 || edge.faces.length > 2) errors.push("Edge " + edge.key + " has invalid face incidence.");
    });
    const boundaryEdges = mesh.edges.filter(function (edge) { return edge.faces.length === 1; });
    if (boundaryEdges.length !== mesh.boundary.length) errors.push("The triangulation must retain one outer edge per boundary segment.");
    for (let index = 0; index < mesh.boundary.length; index++) {
      const key = edgeKey(mesh.boundary[index], mesh.boundary[(index + 1) % mesh.boundary.length]);
      const edge = mesh.edges.find(function (item) { return item.key === key; });
      if (!edge || edge.faces.length !== 1) errors.push("Boundary segment " + key + " is missing or has invalid incidence.");
    }
    return { valid: errors.length === 0, errors };
  }

  function htmlElement(documentRef, tag, className, text) {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function svgElement(documentRef, tag, attributes) {
    const element = documentRef.createElementNS(SVG_NS, tag);
    Object.keys(attributes || {}).forEach(function (name) { element.setAttribute(name, String(attributes[name])); });
    return element;
  }

  let nextLabId = 0;

  function mount(host, options) {
    if (!host || !host.ownerDocument) throw new TypeError("mount requires a DOM element.");
    if (host.__eulerSquareLab) return host.__eulerSquareLab;
    const documentRef = host.ownerDocument;
    const windowRef = documentRef.defaultView || (typeof window !== "undefined" ? window : null);
    const id = "euler-square-lab-" + (++nextLabId);
    const requestedSplits = options && options.splits != null ? options.splits : host.getAttribute("data-splits");
    const splits = requestedSplits == null || requestedSplits === "" ? 4 : clamp(Math.round(Number(requestedSplits) || 0), 0, 14);
    const initialSeed = options && options.seed != null ? String(options.seed) : (host.getAttribute("data-seed") || id);
    const requestedShape = options && options.shape != null ? options.shape : host.getAttribute("data-shape");
    let selectedShape = normalizeShape(requestedShape);
    const titleText = options && options.title ? options.title : (host.getAttribute("data-title") || "Editable planar partition");
    let generation = 0;
    let mesh = generateTriangulation({ seed: initialSeed, splits, shape: selectedShape });
    let drag = null;
    let handlesVisible = false;

    host.classList.add("square-lab-card");
    host.setAttribute("data-square-mounted", "true");
    host.replaceChildren();

    const top = htmlElement(documentRef, "div", "square-lab-top");
    const title = htmlElement(documentRef, "h3", "square-lab-title", titleText);
    title.id = id + "-title";
    const seedReadout = htmlElement(documentRef, "span", "square-lab-seed");
    seedReadout.setAttribute("data-square-seed", "");
    top.append(title, seedReadout);

    const svg = svgElement(documentRef, "svg", {
      class: "square-lab-svg",
      viewBox: "0 0 " + VIEW_SIZE + " " + VIEW_SIZE,
      role: "group",
      "aria-labelledby": id + "-svg-title " + id + "-svg-desc"
    });
    svg.setAttribute("data-square-svg", "");
    const svgTitle = svgElement(documentRef, "title", { id: id + "-svg-title" });
    svgTitle.textContent = titleText + ": an editable triangulation of a " + SHAPE_LABELS[selectedShape].toLowerCase();
    const svgDescription = svgElement(documentRef, "desc", { id: id + "-svg-desc" });
    svgDescription.textContent = "Choose a boundary shape, drag the numbered circular vertices, or drag violet diamond handles to curve edges. Activate a colored triangle to erase it; activate the empty region again to restore it. Unused edges and vertices disappear automatically.";
    const faceLayer = svgElement(documentRef, "g", { class: "square-face-layer" });
    const edgeLayer = svgElement(documentRef, "g", { class: "square-edge-layer", "aria-hidden": "true" });
    const handleLayer = svgElement(documentRef, "g", { class: "square-handle-layer" });
    const vertexLayer = svgElement(documentRef, "g", { class: "square-vertex-layer" });
    svg.append(svgTitle, svgDescription, faceLayer, edgeLayer, handleLayer, vertexLayer);

    const countStrip = htmlElement(documentRef, "dl", "square-count-strip");
    countStrip.setAttribute("data-square-counts", "");
    const outputs = {};
    [["V", "Vertices"], ["E", "Edges"], ["F", "Faces"], ["chi", "Euler characteristic"]].forEach(function (entry) {
      const item = htmlElement(documentRef, "div", "square-count-item");
      const term = htmlElement(documentRef, "dt", "", entry[0] === "chi" ? "χ" : entry[0]);
      const value = htmlElement(documentRef, "dd", "", "0");
      value.setAttribute("data-square-" + entry[0], "");
      value.setAttribute("aria-label", entry[1]);
      item.append(term, value); countStrip.append(item); outputs[entry[0]] = value;
    });

    const controls = htmlElement(documentRef, "div", "square-lab-controls");
    const shapePicker = htmlElement(documentRef, "fieldset", "square-shape-picker");
    const shapeLegend = htmlElement(documentRef, "legend", "square-shape-legend", "Boundary shape");
    const shapeOptions = htmlElement(documentRef, "div", "square-shape-options");
    const shapeInputs = [];
    Object.keys(SHAPE_LABELS).forEach(function (shape) {
      const wrapper = htmlElement(documentRef, "span", "square-shape-option");
      const input = htmlElement(documentRef, "input");
      const label = htmlElement(documentRef, "label", "", SHAPE_LABELS[shape]);
      input.type = "radio"; input.name = id + "-shape"; input.value = shape;
      input.id = id + "-shape-" + shape; input.checked = shape === selectedShape;
      input.setAttribute("data-square-shape", shape);
      label.setAttribute("for", input.id);
      wrapper.append(input, label); shapeOptions.append(wrapper); shapeInputs.push(input);
    });
    shapePicker.append(shapeLegend, shapeOptions);
    const randomButton = htmlElement(documentRef, "button", "button square-randomize", "New random partition");
    randomButton.type = "button"; randomButton.setAttribute("data-square-action", "randomize");
    const restoreButton = htmlElement(documentRef, "button", "button secondary square-restore", "Restore removed triangles");
    restoreButton.type = "button"; restoreButton.setAttribute("data-square-action", "restore");
    const resetButton = htmlElement(documentRef, "button", "button secondary square-reset", "Reset geometry");
    resetButton.type = "button"; resetButton.setAttribute("data-square-action", "reset");
    const toggleLabel = htmlElement(documentRef, "label", "square-handle-toggle");
    const toggle = htmlElement(documentRef, "input");
    toggle.type = "checkbox"; toggle.checked = false; toggle.setAttribute("data-square-handles", "");
    toggleLabel.append(toggle, documentRef.createTextNode(" Show edge-curve handles"));
    controls.append(shapePicker, randomButton, restoreButton, resetButton, toggleLabel);

    const legend = htmlElement(documentRef, "p", "square-lab-legend");
    legend.innerHTML = "<span class=\"square-node-key\" aria-hidden=\"true\"></span> numbered vertex &nbsp; <span class=\"square-handle-key\" aria-hidden=\"true\"></span> edge-curve handle";
    const status = htmlElement(documentRef, "p", "square-lab-status");
    status.setAttribute("data-square-status", "");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    host.append(top, svg, countStrip, controls, legend, status);

    const faceElements = new Map(), edgeElements = new Map(), handleElements = new Map(), vertexElements = new Map();

    function describeCounts(prefix) {
      const value = counts(mesh);
      return prefix + " V=" + value.V + ", E=" + value.E + ", F=" + value.F + ", χ=" + value.chi + ".";
    }

    function announce(message) { status.textContent = message; }

    function rebuildGraphic() {
      faceElements.clear(); edgeElements.clear(); handleElements.clear(); vertexElements.clear();
      faceLayer.replaceChildren(); edgeLayer.replaceChildren(); handleLayer.replaceChildren(); vertexLayer.replaceChildren();
      mesh.faces.forEach(function (face, index) {
        const path = svgElement(documentRef, "path", {
          class: "square-face square-face-" + (index % FACE_COLORS.length),
          fill: FACE_COLORS[index % FACE_COLORS.length], "fill-opacity": 0.72,
          role: "button", tabindex: "0", "data-face-id": face.id,
          "aria-label": "Triangle " + (index + 1) + " is present. Press Enter or Space to remove it."
        });
        faceLayer.append(path); faceElements.set(face.id, path);
      });
      mesh.edges.forEach(function (edge) {
        const path = svgElement(documentRef, "path", {
          class: "square-edge", fill: "none", stroke: "#183642", "stroke-width": 2.2,
          "vector-effect": "non-scaling-stroke", "data-edge-line": edge.key
        });
        edgeLayer.append(path); edgeElements.set(edge.key, path);
        const group = svgElement(documentRef, "g", { class: "square-edge-handle", "data-handle-group": edge.key });
        const guide = svgElement(documentRef, "path", {
          class: "square-handle-guide", fill: "none", stroke: "#7b2cbf", "stroke-opacity": 0.45,
          "stroke-width": 1.2, "stroke-dasharray": "4 4", "vector-effect": "non-scaling-stroke", "aria-hidden": "true"
        });
        const diamond = svgElement(documentRef, "path", {
          class: "square-handle-diamond", fill: "#7b2cbf", stroke: "#fff", "stroke-width": 1.4,
          "vector-effect": "non-scaling-stroke", "aria-hidden": "true"
        });
        const hit = svgElement(documentRef, "circle", {
          class: "square-handle-hit", r: 12, fill: "transparent", tabindex: "0", role: "slider",
          "aria-label": "Curve handle for edge from vertex " + (edge.a + 1) + " to vertex " + (edge.b + 1),
          "aria-valuemin": -Math.round(MAX_BEND * 100), "aria-valuemax": Math.round(MAX_BEND * 100), "aria-valuenow": 0,
          "data-edge-handle": edge.key
        });
        group.append(guide, diamond, hit); handleLayer.append(group);
        handleElements.set(edge.key, { group, guide, diamond, hit });
      });
      mesh.vertices.forEach(function (vertex) {
        const group = svgElement(documentRef, "g", { class: "square-vertex-group" });
        const circle = svgElement(documentRef, "circle", {
          class: "square-node", r: 9, fill: "#ffd166", stroke: "#5b4300", "stroke-width": 2,
          tabindex: "0", role: "button", "data-vertex-id": vertex.id,
          "aria-label": "Draggable vertex " + (vertex.id + 1) + ". Use arrow keys to move it; hold Shift for a larger step."
        });
        const label = svgElement(documentRef, "text", {
          class: "square-node-label", "text-anchor": "middle", "dominant-baseline": "central",
          "font-size": 8, "font-weight": 700, fill: "#382b00", "pointer-events": "none", "aria-hidden": "true"
        });
        label.textContent = String(vertex.id + 1);
        group.append(circle, label); vertexLayer.append(group);
        vertexElements.set(vertex.id, { group, circle, label });
      });
      render();
    }

    function render() {
      const active = activeCellSets(mesh);
      mesh.faces.forEach(function (face, index) {
        const path = faceElements.get(face.id);
        if (!path) return;
        path.setAttribute("d", facePath(mesh, face));
        const faceActive = active.faceIds.has(face.id);
        path.style.display = "";
        path.setAttribute("data-active", String(faceActive));
        path.setAttribute("fill-opacity", faceActive ? "0.72" : "0");
        path.setAttribute("pointer-events", "all");
        path.setAttribute("aria-label", "Triangle " + (index + 1) + (faceActive
          ? " is present. Press Enter or Space to remove it."
          : " is removed. Press Enter or Space to restore it."));
        path.setAttribute("aria-pressed", String(faceActive));
        path.setAttribute("aria-hidden", "false");
        path.setAttribute("tabindex", "0");
      });
      mesh.edges.forEach(function (edge) {
        const a = mesh.vertices[edge.a], b = mesh.vertices[edge.b], handle = controlPoint(edge, mesh.vertices);
        const path = edgeElements.get(edge.key);
        const edgeHidden = !active.edgeKeys.has(edge.key);
        path.setAttribute("d", "M " + formatNumber(a.x) + " " + formatNumber(a.y) + " Q " + formatNumber(handle.x) + " " + formatNumber(handle.y) + " " + formatNumber(b.x) + " " + formatNumber(b.y));
        path.style.display = edgeHidden ? "none" : "";
        const elements = handleElements.get(edge.key);
        elements.group.style.display = handlesVisible && !edgeHidden ? "" : "none";
        elements.hit.setAttribute("tabindex", handlesVisible && !edgeHidden ? "0" : "-1");
        elements.hit.setAttribute("aria-hidden", handlesVisible && !edgeHidden ? "false" : "true");
        elements.guide.setAttribute("d", "M " + formatNumber(a.x) + " " + formatNumber(a.y) + " L " + formatNumber(handle.x) + " " + formatNumber(handle.y) + " L " + formatNumber(b.x) + " " + formatNumber(b.y));
        const radius = 6;
        elements.diamond.setAttribute("d", "M " + handle.x + " " + (handle.y - radius) + " L " + (handle.x + radius) + " " + handle.y + " L " + handle.x + " " + (handle.y + radius) + " L " + (handle.x - radius) + " " + handle.y + " Z");
        elements.hit.setAttribute("cx", handle.x); elements.hit.setAttribute("cy", handle.y);
        elements.hit.setAttribute("aria-valuenow", String(Math.round(edge.bend * 100)));
        elements.hit.setAttribute("aria-valuetext", Math.abs(edge.bend) < 0.005 ? "straight" : (Math.round(Math.abs(edge.bend) * 100) + " percent bend " + (edge.bend > 0 ? "left" : "right")));
      });
      mesh.vertices.forEach(function (vertex) {
        const elements = vertexElements.get(vertex.id);
        const vertexHidden = !active.vertexIds.has(vertex.id);
        elements.group.style.display = vertexHidden ? "none" : "";
        elements.circle.setAttribute("tabindex", vertexHidden ? "-1" : "0");
        elements.circle.setAttribute("aria-hidden", vertexHidden ? "true" : "false");
        elements.circle.setAttribute("cx", vertex.x); elements.circle.setAttribute("cy", vertex.y);
        elements.label.setAttribute("x", vertex.x); elements.label.setAttribute("y", vertex.y + 0.5);
      });
      const value = counts(mesh);
      outputs.V.textContent = value.V; outputs.E.textContent = value.E; outputs.F.textContent = value.F; outputs.chi.textContent = value.chi;
      outputs.V.setAttribute("aria-label", "Vertices: " + value.V);
      outputs.E.setAttribute("aria-label", "Edges: " + value.E);
      outputs.F.setAttribute("aria-label", "Faces: " + value.F);
      outputs.chi.setAttribute("aria-label", "Euler characteristic: " + value.chi);
      seedReadout.textContent = SHAPE_LABELS[mesh.shape] + " · seed " + mesh.seed;
      host.setAttribute("data-current-seed", mesh.seed);
      host.setAttribute("data-current-shape", mesh.shape);
      host.setAttribute("data-current-chi", String(value.chi));
    }

    function svgPoint(event) {
      if (svg.createSVGPoint && svg.getScreenCTM()) {
        const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
        return point.matrixTransform(svg.getScreenCTM().inverse());
      }
      const rect = svg.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * VIEW_SIZE / rect.width, y: (event.clientY - rect.top) * VIEW_SIZE / rect.height };
    }

    function startDrag(event, type, identity, target) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      drag = { pointerId: event.pointerId, type, identity, target, changed: false, rejected: false };
      if (target.setPointerCapture) target.setPointerCapture(event.pointerId);
    }

    function finishDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const ended = drag; drag = null;
      if (ended.target.releasePointerCapture && ended.target.hasPointerCapture && ended.target.hasPointerCapture(event.pointerId)) {
        ended.target.releasePointerCapture(event.pointerId);
      }
      if (ended.rejected) announce(describeCounts(ended.type === "vertex"
        ? "Move stopped before a triangle could flip or leave the drawing area."
        : "Curve stopped before the edge could cross another edge."));
      else if (ended.changed && ended.type === "vertex") announce(describeCounts("Vertex " + (ended.identity + 1) + " moved; the indexed topology is unchanged."));
      else if (ended.changed) announce(describeCounts("Edge " + ended.identity + " curved; every incident face uses the same edge."));
    }

    svg.addEventListener("pointerdown", function (event) {
      const vertexTarget = event.target.closest && event.target.closest("[data-vertex-id]");
      if (vertexTarget) return startDrag(event, "vertex", Number(vertexTarget.getAttribute("data-vertex-id")), vertexTarget);
      const handleTarget = event.target.closest && event.target.closest("[data-edge-handle]");
      if (handleTarget) startDrag(event, "edge", handleTarget.getAttribute("data-edge-handle"), handleTarget);
    });
    svg.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const point = svgPoint(event);
      if (drag.type === "vertex") {
        const next = moveVertex(mesh, drag.identity, point.x, point.y);
        if (next === mesh) drag.rejected = true;
        else { mesh = next; drag.changed = true; drag.rejected = false; render(); }
      } else {
        const edge = mesh.edges.find(function (item) { return item.key === drag.identity; });
        const a = mesh.vertices[edge.a], b = mesh.vertices[edge.b];
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        if (length > EPSILON) {
          const midpointX = (a.x + b.x) / 2, midpointY = (a.y + b.y) / 2;
          const bend = ((point.x - midpointX) * (-dy / length) + (point.y - midpointY) * (dx / length)) / length;
          const next = moveEdgeControl(mesh, edge.key, edge.controlAlong || 0, bend);
          if (next === mesh) drag.rejected = true;
          else { mesh = next; drag.changed = true; drag.rejected = false; render(); }
        }
      }
    });
    svg.addEventListener("pointerup", finishDrag);
    svg.addEventListener("pointercancel", finishDrag);
    svg.addEventListener("lostpointercapture", finishDrag);

    function activateFace(faceId) {
      const face = mesh.faces.find(function (item) { return item.id === faceId; });
      if (!face) return;
      const before = counts(mesh);
      const removing = face.active !== false;
      mesh = setFaceActive(mesh, faceId, !removing);
      const after = counts(mesh);
      render();
      if (removing) {
        const removedVertices = before.V - after.V, removedEdges = before.E - after.E;
        const remainder = after.F === 0 ? " No cells remain." : " Cells shared with visible triangles remain.";
        announce(describeCounts("Triangle removed with " + removedEdges + " unused edge" + (removedEdges === 1 ? "" : "s") + " and " + removedVertices + " unused " + (removedVertices === 1 ? "vertex" : "vertices") + "." + remainder + " Activate the empty triangle again to restore it."));
      } else {
        const restoredVertices = after.V - before.V, restoredEdges = after.E - before.E;
        announce(describeCounts("Triangle restored with " + restoredEdges + " required edge" + (restoredEdges === 1 ? "" : "s") + " and " + restoredVertices + " required " + (restoredVertices === 1 ? "vertex" : "vertices") + "."));
      }
    }

    svg.addEventListener("click", function (event) {
      const target = event.target.closest && event.target.closest("[data-face-id]");
      if (target) activateFace(Number(target.getAttribute("data-face-id")));
    });
    svg.addEventListener("keydown", function (event) {
      const faceTarget = event.target.closest && event.target.closest("[data-face-id]");
      if (faceTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault(); activateFace(Number(faceTarget.getAttribute("data-face-id"))); return;
      }
      const vertexTarget = event.target.closest && event.target.closest("[data-vertex-id]");
      if (vertexTarget && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) {
        event.preventDefault();
        const vertexId = Number(vertexTarget.getAttribute("data-vertex-id"));
        const vertex = mesh.vertices[vertexId];
        const step = event.shiftKey ? 10 : 3;
        const destination = event.key === "Home" ? { x: vertex.homeX, y: vertex.homeY } : {
          x: vertex.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
          y: vertex.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)
        };
        const next = moveVertex(mesh, vertexId, destination.x, destination.y);
        if (next === mesh) announce(describeCounts("That vertex move would flip a triangle or leave the drawing area."));
        else { mesh = next; render(); announce(describeCounts("Vertex " + (vertexId + 1) + " moved; topology unchanged.")); }
        return;
      }
      const handleTarget = event.target.closest && event.target.closest("[data-edge-handle]");
      if (handleTarget && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) {
        event.preventDefault();
        const key = handleTarget.getAttribute("data-edge-handle");
        const edge = mesh.edges.find(function (item) { return item.key === key; });
        const delta = event.shiftKey ? 0.05 : 0.015;
        const nextAlong = event.key === "Home" ? edge.homeControlAlong : edge.controlAlong;
        const nextBend = event.key === "Home" ? edge.homeBend : edge.bend + (["ArrowLeft", "ArrowDown"].includes(event.key) ? -delta : delta);
        const next = moveEdgeControl(mesh, key, nextAlong, nextBend);
        if (next === mesh) announce(describeCounts("That curve edit would cross another edge."));
        else { mesh = next; render(); announce(describeCounts("Edge " + key + " curved; topology unchanged.")); }
      }
    });

    function entropy() {
      if (windowRef && windowRef.crypto && windowRef.crypto.getRandomValues) {
        const value = new Uint32Array(1); windowRef.crypto.getRandomValues(value); return value[0].toString(36);
      }
      return Date.now().toString(36) + "-" + Math.round(Math.random() * 1e9).toString(36);
    }

    function randomize() {
      generation++;
      mesh = generateTriangulation({ seed: initialSeed + "-" + selectedShape + "-" + generation + "-" + entropy(), splits, shape: selectedShape });
      rebuildGraphic(); announce(describeCounts("New random " + SHAPE_LABELS[selectedShape].toLowerCase() + " partition generated."));
    }
    function setShape(nextShape) {
      selectedShape = normalizeShape(nextShape);
      generation++;
      mesh = generateTriangulation({ seed: initialSeed + "-" + selectedShape + "-" + generation, splits, shape: selectedShape });
      shapeInputs.forEach(function (input) { input.checked = input.value === selectedShape; });
      svgTitle.textContent = titleText + ": an editable triangulation of a " + SHAPE_LABELS[selectedShape].toLowerCase();
      rebuildGraphic();
      announce(describeCounts(SHAPE_LABELS[selectedShape] + " partition ready."));
    }
    function restore() {
      mesh = restoreFaces(mesh); render(); announce(describeCounts("All triangles and their required edges and vertices restored."));
    }
    function reset() {
      mesh = resetGeometry(mesh); render(); announce(describeCounts("Geometry returned to the original " + SHAPE_LABELS[selectedShape].toLowerCase() + " partition."));
    }
    shapeInputs.forEach(function (input) {
      input.addEventListener("change", function () { if (input.checked) setShape(input.value); });
    });
    randomButton.addEventListener("click", randomize);
    restoreButton.addEventListener("click", restore);
    resetButton.addEventListener("click", reset);
    toggle.addEventListener("change", function () {
      handlesVisible = toggle.checked; render();
      announce(handlesVisible ? "Violet edge-curve handles shown." : "Edge-curve handles hidden.");
    });

    const instance = {
      host, randomize, setShape, restoreFaces: restore, resetGeometry: reset,
      getMesh: function () { return mesh; },
      getShape: function () { return selectedShape; },
      getCounts: function () { return counts(mesh); },
      dispose: function () { host.replaceChildren(); delete host.__eulerSquareLab; }
    };
    host.__eulerSquareLab = instance;
    rebuildGraphic();
    announce(describeCounts(SHAPE_LABELS[selectedShape] + " partition ready. Activate a triangle to remove it; activate the empty region again to restore it. Tick Show edge-curve handles to edit curves."));
    return instance;
  }

  function mountAll(rootNode) {
    rootNode = rootNode || (typeof document !== "undefined" ? document : null);
    if (!rootNode || !rootNode.querySelectorAll) return [];
    return Array.from(rootNode.querySelectorAll("[data-square-lab]")).map(function (host) { return mount(host); });
  }

  return {
    VIEW_SIZE,
    INSET,
    MAX_BEND,
    DEFAULT_SHAPE,
    SHAPE_LABELS,
    seedToUint32,
    createSeededRandom,
    edgeKey,
    signedArea2,
    faceArea2,
    buildEdges,
    normalizeShape,
    projectedControl,
    projectedBend,
    generateTriangulation,
    counts,
    activeCellSets,
    removedEdgeKeys,
    removedVertexIds,
    controlPoint,
    edgeCurvePoints,
    facePath,
    isValidVertexMove,
    moveVertex,
    setEdgeControl,
    setEdgeBend,
    isValidEdgeControl,
    moveEdgeControl,
    setFaceActive,
    removeFace,
    restoreFaces,
    resetGeometry,
    validateTriangulation,
    mount,
    mountAll
  };
});
