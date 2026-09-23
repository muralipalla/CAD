const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const THREE = require("../assets/vendor/three.min.js");

const source = fs.readFileSync(require.resolve("../cad-modules/solid-modeling/solid-modeling-lab.js"), "utf8");
const page = fs.readFileSync(require.resolve("../cad-modules/solid-modeling/index.html"), "utf8");
const fakeCanvas = { width: 0, height: 0, getContext() { return { beginPath() {}, roundRect() {}, fill() {}, stroke() {}, fillText() {} }; } };
const context = { window: { THREE, document: { readyState: "loading", addEventListener() {}, createElement() { return fakeCanvas; } } } };
vm.runInNewContext(source, context);
const api = context.window.SolidModelingLab;

test("the module states the loop-aware Euler–Poincaré relation and mounts both interactives", () => {
  assert.match(page, /V-E\+2F-L=2\(S-G\)/);
  assert.match(page, /data-euler-lab/);
  assert.match(page, /value="square-pocket"/);
  assert.match(page, /data-euler-zoom-slider/);
  assert.match(page, /data-euler-zoom-output/);
  assert.match(page, /data-euler-fullscreen/);
  assert.match(page, /data-winged-lab/);
  assert.match(page, /Tetrahedron/);
  assert.match(page, /Pentagonal prism/);
  assert.match(page, /data-zoom-point/);
  assert.match(page, /data-zoom-slider/);
  assert.doesNotMatch(page, /data-zoom-in\b|data-zoom-out\b(?!put)/);
  assert.match(page, /data-fullscreen/);
  assert.match(page, /data-show-labels/);
  assert.match(page, /data-download-svg/);
  assert.match(page, /data-download-pdf/);
  assert.match(page, /data-download-csv/);
  assert.match(page, /data-download-halfedges/);
  assert.match(page, /href="#winged-lab-downloads"/);
  assert.equal((page.match(/data-edge-field=/g) || []).length, 8);
  assert.doesNotMatch(page, /data-winged-net/);
});

test("the OpenSCAD pocket has a visible open top, a floor, and loop-aware Euler counts", () => {
  const model = api.EULER_MODELS["square-pocket"];
  assert.deepEqual({ ...model.counts }, { V: 16, E: 24, F: 11, L: 12, S: 1, G: 0 });
  const c = model.counts;
  assert.equal(c.V - c.E + 2 * c.F - c.L, 2 * (c.S - c.G));
  assert.equal(c.L - c.F, 1, "the top B-Rep face has one inner loop");
  const group = model.make();
  assert.equal(group.children[2].children.length, c.E, "the graphic draws every B-Rep edge");
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  function topHit(x, z) {
    ray.set(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObjects(group.children.slice(0, 2), false)[0].point.y;
  }
  assert.ok(Math.abs(topHit(0, 0) - 0.6) < 1e-6, "the center ray reaches the pocket floor");
  assert.ok(Math.abs(topHit(0.9, 0) - 1.2) < 1e-6, "the surrounding top face remains at cube height");
});

test("winged-edge examples have the expected Euler counts", () => {
  const expected = {
    tetrahedron: { V: 4, E: 6, F: 4 },
    cube: { V: 8, E: 12, F: 6 },
    "pentagonal-prism": { V: 10, E: 15, F: 7 }
  };
  Object.entries(api.MODELS).forEach(([name, model]) => {
    const data = api.buildWingedData(model);
    assert.deepEqual(
      { V: model.vertices.length, E: data.edges.length, F: model.faces.length },
      expected[name]
    );
    assert.equal(model.vertices.length - data.edges.length + model.faces.length, 2);
  });
});

test("every closed-solid edge has two faces and four valid wing pointers", () => {
  Object.values(api.MODELS).forEach(model => {
    const data = api.buildWingedData(model);
    data.edges.forEach(edge => {
      assert.match(edge.leftFace, /^F\d+$/);
      assert.match(edge.rightFace, /^F\d+$/);
      for (const field of ["leftPrev", "leftNext", "rightPrev", "rightNext"]) {
        assert.ok(data.byId.has(edge[field]), `${edge.id}.${field} points to an existing edge`);
      }
      assert.notEqual(edge.leftFace, edge.rightFace);
    });
  });
});

test("complete WEDS CSV exports vertex, face, and edge tables with valid seed edges", () => {
  Object.values(api.MODELS).forEach(model => {
    const data = api.buildWingedData(model);
    const csv = api.wingedCsv(data);
    const rows = csv.trimEnd().split("\r\n"), vertices = model.vertices.length, faces = model.faces.length;
    const faceTitle = 4 + vertices, edgeTitle = faceTitle + 4 + faces;
    assert.equal(rows.length, edgeTitle + 3 + data.edges.length);
    assert.deepEqual(rows.slice(0, 3), ["Vertex Table", "Number of Vertices=" + vertices, "Vertex,Edge Number"]);
    data.vertexTable.forEach((record, index) => {
      assert.equal(rows[3 + index], index + "," + record.edge.slice(1));
      const edge = data.byId.get(record.edge);
      assert.ok(edge.a === index || edge.b === index);
    });
    assert.deepEqual(rows.slice(faceTitle - 1, faceTitle + 3), ["", "Face Table", "Number of Faces=" + faces, "Face,Edge Number"]);
    data.faceTable.forEach((record, index) => {
      assert.equal(rows[faceTitle + 3 + index], index + "," + record.edge.slice(1));
      const edge = data.byId.get(record.edge);
      assert.ok(edge.leftFace === "F" + index || edge.rightFace === "F" + index);
    });
    assert.deepEqual(rows.slice(edgeTitle - 1, edgeTitle + 3), ["", "Edge Table", "Number of Edges=" + data.edges.length,
      "Edge,V1,V2,Left Face,Right Face,Left Previous,Left Next,Right Previous,Right Next"]);
    data.edges.forEach((edge, index) => {
      assert.equal(rows[edgeTitle + 3 + index], [edge.id.slice(1), edge.a, edge.b, edge.leftFace.slice(1), edge.rightFace.slice(1),
        edge.leftPrev.slice(1), edge.leftNext.slice(1), edge.rightPrev.slice(1), edge.rightNext.slice(1)].join(","));
      assert.match(rows[edgeTitle + 3 + index], /^\d+(,\d+){8}$/);
    });
  });
});

test("half-edge CSV exports complete, reciprocal face loops for every solid", () => {
  Object.values(api.MODELS).forEach(model => {
    const winged = api.buildWingedData(model), data = api.buildHalfEdgeData(model, winged);
    assert.equal(data.halfEdges.length, winged.edges.length * 2);
    data.halfEdges.forEach(record => {
      const twin = data.byId.get(record.twin), next = data.byId.get(record.next), prev = data.byId.get(record.prev);
      assert.ok(twin && next && prev, `${record.id} has complete pointers`);
      assert.equal(twin.twin, record.id);
      assert.equal(twin.origin, record.destination);
      assert.equal(twin.destination, record.origin);
      assert.equal(twin.edge, record.edge);
      assert.equal(next.prev, record.id);
      assert.equal(prev.next, record.id);
      assert.equal(next.origin, record.destination);
      assert.equal(prev.destination, record.origin);
      assert.equal(next.face, record.face);
      assert.equal(prev.face, record.face);
      assert.ok(winged.byId.has(record.edge));
    });
    const csv = api.halfEdgeCsv(data);
    const rows = csv.trim().split("\r\n").map(row => row.split(",").map(cell => cell.replace(/^"|"$/g, "")));
    assert.deepEqual(rows[0], ["Half-edge", "Origin", "Destination", "Twin", "Next", "Previous", "Face", "Edge"]);
    assert.equal(rows.length, data.halfEdges.length + 1);
    data.halfEdges.forEach((record, index) => {
      assert.deepEqual(rows[index + 1], [record.id, record.origin, record.destination, record.twin, record.next, record.prev, record.face, record.edge].map(value => value.slice(1)));
      assert.match(csv.split("\r\n")[index + 1], /^\d+(,\d+){7}$/);
    });
  });
});

test("SVG and PDF exports contain monochrome labeled diagrams for each solid", () => {
  Object.values(api.MODELS).forEach(model => {
    const data = api.buildWingedData(model), plan = api.buildUnfoldPlan(model);
    for (const progress of [0, 1]) {
      const project = (point, width, height) => [width / 2 + point[0] * 110, height / 2 - point[1] * 110, point[2]];
      const drawing = api.makeExportDrawing(model, data, plan, progress, project, 1200, 800);
      const svg = api.drawingToSvg(drawing);
      assert.match(svg, /<rect width="100%" height="100%" fill="#ffffff"\/>/);
      assert.equal((svg.match(/<polygon /g) || []).length, model.faces.length);
      assert.deepEqual([...new Set(svg.match(/#[0-9a-f]{6}/g))].sort(), ["#000000", "#ffffff"]);
      for (const faceIndex of model.faces.keys()) assert.match(svg, new RegExp(">F" + faceIndex + "<"));
      data.edges.forEach(edge => assert.match(svg, new RegExp(">" + edge.id + "<")));
      model.vertices.forEach((_, vertexIndex) => assert.match(svg, new RegExp(">V" + vertexIndex + "<")));
      const pdf = Buffer.from(api.drawingToPdf(drawing));
      assert.match(pdf.toString("latin1", 0, 8), /^%PDF-1\.4/);
      const contents = pdf.toString("latin1");
      assert.match(contents, /\/MediaBox \[0 0 800 533\]/);
      assert.match(contents, /\/BaseFont \/Helvetica/);
      assert.match(contents, /1 1 1 rg/);
      assert.match(contents, /0 0 0 RG 0 0 0 rg/);
      data.edges.forEach(edge => assert.ok(contents.includes("(" + edge.id + ")")));
      const xrefOffset = Number(contents.match(/startxref\n(\d+)\n%%EOF/)[1]);
      assert.equal(contents.slice(xrefOffset, xrefOffset + 4), "xref");
    }
  });
});

function distance(a, b) {
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

function interiorsOverlap(a, b) {
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index++) {
      const first = polygon[index], second = polygon[(index + 1) % polygon.length];
      const axis = [first[1] - second[1], second[0] - first[0]];
      const projectedA = a.map(point => point[0] * axis[0] + point[1] * axis[1]);
      const projectedB = b.map(point => point[0] * axis[0] + point[1] * axis[1]);
      if (Math.max(...projectedA) <= Math.min(...projectedB) + 1e-8 ||
          Math.max(...projectedB) <= Math.min(...projectedA) + 1e-8) return false;
    }
  }
  return true;
}

test("all face hinges stay joined while the Three.js panels unfold", () => {
  Object.values(api.MODELS).forEach(model => {
    const plan = api.buildUnfoldPlan(model);
    assert.equal(plan.hinges.filter(Boolean).length, model.faces.length - 1);
    for (const progress of [0, 0.3, 0.7, 1]) {
      const faces = api.unfoldedFaces(model, plan, progress);
      const matrices = api.unfoldMatrices(model, plan, progress);
      model.faces.forEach((face, faceIndex) => {
        face.forEach((vertexIndex, corner) => {
          const actual = new THREE.Vector3(...model.vertices[vertexIndex]).applyMatrix4(matrices[faceIndex]).toArray();
          assert.ok(distance(actual, faces[faceIndex][corner]) < 1e-9);
        });
      });
      plan.hinges.filter(Boolean).forEach(hinge => {
        for (const vertexIndex of [hinge.a, hinge.b]) {
          const parentCorner = model.faces[hinge.parent].indexOf(vertexIndex);
          const childCorner = model.faces[hinge.face].indexOf(vertexIndex);
          assert.ok(distance(faces[hinge.parent][parentCorner], faces[hinge.face][childCorner]) < 1e-9);
        }
      });
    }
  });
});

test("the final tetrahedron, cube, and prism nets are planar and do not overlap", () => {
  Object.values(api.MODELS).forEach(model => {
    const plan = api.buildUnfoldPlan(model);
    const rootPoint = model.vertices[model.faces[plan.root][0]];
    const finalFaces = api.unfoldedFaces(model, plan, 1);
    finalFaces.flat().forEach(point => {
      const planeDistance = point.reduce((sum, value, index) => sum + (value - rootPoint[index]) * plan.normal[index], 0);
      assert.ok(Math.abs(planeDistance) < 1e-9);
    });
    const net = api.netCoordinates(model, plan);
    for (let first = 0; first < net.faces.length; first++) {
      for (let second = first + 1; second < net.faces.length; second++) {
        assert.equal(interiorsOverlap(net.faces[first], net.faces[second]), false, `${model.label}: F${first} overlaps F${second}`);
      }
    }
  });
});

test("Three.js creates moving panels and selectable vertices, edges, and faces", () => {
  Object.values(api.MODELS).forEach(model => {
    const data = api.buildWingedData(model), plan = api.buildUnfoldPlan(model);
    const group = api.makeWingedGroup(model, data, plan);
    assert.equal(group.children.length, model.faces.length);
    assert.equal(group.userData.pickables.length, model.faces.length + data.edges.length * 4);
    data.edges.forEach(edge => assert.equal(group.userData.edgeObjects.get(edge.id).length, 2));
    data.edges.forEach(edge => group.userData.edgeObjects.get(edge.id).forEach(object => assert.equal(object.material.color.getHex(), 0xff2020)));
    assert.equal(group.userData.pickables.filter(object => object.userData.faceId).length, model.faces.length);
    assert.equal(group.userData.pickables.filter(object => Number.isInteger(object.userData.vertexId)).length, data.edges.length * 2);
    group.userData.setLabelsVisible(false);
    assert.ok(group.userData.labels.length > 0 && group.userData.labels.every(label => !label.visible));
    group.userData.setLabelsVisible(true);
    assert.ok(group.userData.labels.every(label => label.visible));
    group.userData.updateProgress(1);
    group.children.forEach((panel, faceIndex) => {
      const expected = api.unfoldMatrices(model, plan, 1)[faceIndex];
      assert.ok(panel.matrix.equals(expected));
    });
  });
});

test("edges hover yellow, dragging pans, Shift-drag rotates, and the slider zooms smoothly", () => {
  let camera, scene, nextFrameId = 1, selection, zoomPercent;
  const frames = new Map(), events = {};
  class Renderer {
    setPixelRatio() {}
    setSize() {}
    render(nextScene, nextCamera) {
      scene = nextScene; camera = nextCamera;
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    }
  }
  const window = {
    THREE: { ...THREE, WebGLRenderer: Renderer },
    document: { readyState: "loading", addEventListener() {}, createElement() { return fakeCanvas; } },
    devicePixelRatio: 1,
    ResizeObserver: class { observe() {} },
    requestAnimationFrame(callback) { const id = nextFrameId++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    matchMedia() { return { matches: false }; }
  };
  const zoomContext = { window };
  vm.runInNewContext(source, zoomContext);
  const runtime = window.SolidModelingLab;
  const canvas = {
    clientWidth: 700, clientHeight: 500,
    addEventListener(name, callback) { events[name] = callback; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 700, height: 500 }; },
    setPointerCapture() {}, hasPointerCapture() { return false; }, focus() {}, setAttribute() {}
  };
  const viewer = runtime.createViewer(canvas, { hidden: true }, value => { selection = value; }, value => { zoomPercent = value; });
  const model = runtime.MODELS.cube, data = runtime.buildWingedData(model);
  const group = runtime.makeWingedGroup(model, data, runtime.buildUnfoldPlan(model));
  viewer.setModel(group, group.userData.pickables);
  assert.equal(zoomPercent, 100);
  let foundHover = false;
  for (const hit of group.userData.pickables.filter(object => object.userData.edgeId)) {
    const position = hit.getWorldPosition(new THREE.Vector3()).project(camera);
    if (Math.abs(position.x) >= 1 || Math.abs(position.y) >= 1) continue;
    events.pointermove({ clientX: (position.x + 1) * 350, clientY: (1 - position.y) * 250 });
    foundHover = [...group.userData.edgeObjects.values()].flat().some(edge => edge.material.color.getHex() === 0xffee00);
    if (foundHover) break;
  }
  assert.equal(foundHover, true, "a visible edge turns yellow on hover");
  events.pointerleave({});
  assert.ok([...group.userData.edgeObjects.values()].flat().every(edge => edge.material.color.getHex() === 0xff2020));
  const ndc = new THREE.Vector3(0, 0, 1).project(camera);
  const event = { pointerId: 1, clientX: (ndc.x + 1) * 350, clientY: (1 - ndc.y) * 250 };
  events.pointerdown(event); events.pointerup(event);
  assert.ok(selection && selection.point.length === 3);
  assert.equal(viewer.hasSelectedPoint(), true);
  const focus = new THREE.Vector3(...selection.point);
  const startingDistance = camera.position.distanceTo(focus);
  viewer.zoomToSelected();
  assert.ok(frames.size > 0, "zoom schedules animation frames");
  for (let frame = 1; frames.size && frame <= 120; frame++) {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(frame * 16));
  }
  assert.equal(frames.size, 0, "smooth zoom converges");
  assert.ok(camera.position.distanceTo(focus) < startingDistance);
  const centered = focus.clone().project(camera);
  assert.ok(Math.abs(centered.x) < 1e-3 && Math.abs(centered.y) < 1e-3);
  viewer.setZoomPercent(250);
  assert.equal(zoomPercent, 250);
  for (let frame = 1; frames.size && frame <= 120; frame++) {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(frame * 16));
  }
  assert.ok(Math.abs(camera.position.distanceTo(focus) - 6.4 / 2.5) < 0.01);
  const directionBeforePan = camera.getWorldDirection(new THREE.Vector3());
  const positionBeforePan = camera.position.clone();
  events.pointerdown({ pointerId: 2, clientX: 350, clientY: 250 });
  events.pointermove({ pointerId: 2, clientX: 400, clientY: 280 });
  events.pointerup({ pointerId: 2, clientX: 400, clientY: 280 });
  assert.ok(camera.position.distanceTo(positionBeforePan) > 0.1);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(directionBeforePan) < 1e-9, "pan keeps the orientation");
  const directionBeforeOrbit = camera.getWorldDirection(new THREE.Vector3());
  events.pointerdown({ pointerId: 3, clientX: 350, clientY: 250, shiftKey: true });
  events.pointermove({ pointerId: 3, clientX: 400, clientY: 280 });
  events.pointerup({ pointerId: 3, clientX: 400, clientY: 280 });
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(directionBeforeOrbit) > 0.01, "Shift-drag rotates");
  const eulerEvents = {};
  const eulerCanvas = { ...canvas, addEventListener(name, callback) { eulerEvents[name] = callback; } };
  const eulerViewer = runtime.createViewer(eulerCanvas, { hidden: true });
  eulerViewer.setModel(new THREE.Group());
  const eulerDirection = camera.getWorldDirection(new THREE.Vector3());
  eulerEvents.pointerdown({ pointerId: 4, clientX: 350, clientY: 250 });
  eulerEvents.pointermove({ pointerId: 4, clientX: 400, clientY: 280 });
  eulerEvents.pointerup({ pointerId: 4, clientX: 400, clientY: 280 });
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(eulerDirection) > 0.01, "Euler figures retain drag-to-orbit");
});
