const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const square = require("../cad-modules/euler-characteristic/square-lab.js");
const SHAPES = ["triangle", "rectangle", "circle", "ellipse"];
const BASE_COUNTS = {
  triangle: { V: 3, E: 3, F: 1, boundary: 3 },
  rectangle: { V: 4, E: 5, F: 2, boundary: 4 },
  circle: { V: 8, E: 13, F: 6, boundary: 8 },
  ellipse: { V: 8, E: 13, F: 6, boundary: 8 }
};

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test("seeded partitions are deterministic for every boundary shape", () => {
  for (const shape of SHAPES) {
    const first = square.generateTriangulation({ shape, seed: "partition-a", splits: 6 });
    const repeat = square.generateTriangulation({ shape, seed: "partition-a", splits: 6 });
    const other = square.generateTriangulation({ shape, seed: "partition-b", splits: 6 });
    assert.deepEqual(first, repeat);
    assert.notDeepEqual(
      first.vertices.map(vertex => [vertex.x, vertex.y]),
      other.vertices.map(vertex => [vertex.x, vertex.y])
    );
  }
  const random = square.createSeededRandom("fixed-sequence");
  assert.deepEqual(
    [random(), random(), random()],
    (() => { const again = square.createSeededRandom("fixed-sequence"); return [again(), again(), again()]; })()
  );
});

test("every stellar split preserves Euler characteristic one for every shape", () => {
  for (const shape of SHAPES) {
    const base = BASE_COUNTS[shape];
    for (let splits = 0; splits <= 12; splits++) {
      const mesh = square.generateTriangulation({ shape, seed: shape + "-count-" + splits, splits });
      assert.deepEqual(square.counts(mesh), {
        V: base.V + splits,
        E: base.E + 3 * splits,
        F: base.F + 2 * splits,
        chi: 1
      });
      assert.deepEqual(square.validateTriangulation(mesh), { valid: true, errors: [] });
    }
  }
});

test("generated partitions are conforming simplicial disks", () => {
  for (const shape of SHAPES) {
    for (const seed of ["alpha", "beta"]) {
      const mesh = square.generateTriangulation({ shape, seed, splits: 9 });
    const keys = new Set(mesh.edges.map(edge => edge.key));
    assert.equal(keys.size, mesh.edges.length);
      assert.equal(mesh.boundary.length, BASE_COUNTS[shape].boundary);
      assert.equal(mesh.edges.filter(edge => edge.faces.length === 1).length, mesh.boundary.length);
    mesh.edges.forEach(edge => {
      assert.ok(edge.faces.length === 1 || edge.faces.length === 2);
      assert.equal(edge.key, square.edgeKey(edge.a, edge.b));
    });
    mesh.faces.forEach(face => assert.ok(square.faceArea2(face, mesh.vertices) > 0));
    mesh.vertices.forEach(vertex => {
      assert.ok(vertex.x >= square.INSET && vertex.x <= square.VIEW_SIZE - square.INSET);
      assert.ok(vertex.y >= square.INSET && vertex.y <= square.VIEW_SIZE - square.INSET);
    });
    for (let i = 0; i < mesh.faces.length; i++) {
      for (let j = i + 1; j < mesh.faces.length; j++) {
        const shared = mesh.faces[i].vertices.filter(id => mesh.faces[j].vertices.includes(id));
        assert.ok(shared.length <= 2, "two different triangles cannot share all three vertices");
        if (shared.length === 2) assert.ok(keys.has(square.edgeKey(shared[0], shared[1])));
      }
    }
    }
  }
});

test("circle and ellipse presets use editable curved boundary edges", () => {
  for (const shape of ["circle", "ellipse"]) {
    const mesh = square.generateTriangulation({ shape, seed: "curved-" + shape, splits: 4 });
    const boundaryKeys = new Set(mesh.boundary.map((id, index) =>
      square.edgeKey(id, mesh.boundary[(index + 1) % mesh.boundary.length])
    ));
    const boundaryEdges = mesh.edges.filter(edge => boundaryKeys.has(edge.key));
    assert.equal(boundaryEdges.length, 8);
    boundaryEdges.forEach(edge => {
      assert.notEqual(edge.homeBend, 0);
      assert.equal(edge.bend, edge.homeBend);
    });
    mesh.edges.filter(edge => !boundaryKeys.has(edge.key)).forEach(edge => assert.equal(edge.homeBend, 0));

    const edited = square.setEdgeControl(mesh, boundaryEdges[0].key, 0.2, 0);
    const reset = square.resetGeometry(edited);
    const resetBoundary = reset.edges.find(edge => edge.key === boundaryEdges[0].key);
    assert.equal(resetBoundary.bend, boundaryEdges[0].homeBend);
    assert.equal(resetBoundary.controlAlong, boundaryEdges[0].homeControlAlong);
  }

  const circle = square.generateTriangulation({ shape: "circle", seed: "outline", splits: 0 });
  const ellipse = square.generateTriangulation({ shape: "ellipse", seed: "outline", splits: 0 });
  const circleWidth = Math.max(...circle.vertices.slice(0, 8).map(v => v.x)) - Math.min(...circle.vertices.slice(0, 8).map(v => v.x));
  const circleHeight = Math.max(...circle.vertices.slice(0, 8).map(v => v.y)) - Math.min(...circle.vertices.slice(0, 8).map(v => v.y));
  const ellipseWidth = Math.max(...ellipse.vertices.slice(0, 8).map(v => v.x)) - Math.min(...ellipse.vertices.slice(0, 8).map(v => v.x));
  const ellipseHeight = Math.max(...ellipse.vertices.slice(0, 8).map(v => v.y)) - Math.min(...ellipse.vertices.slice(0, 8).map(v => v.y));
  close(circleWidth, circleHeight);
  assert.ok(ellipseWidth > ellipseHeight);
});

test("circle and ellipse start without an artificial center vertex", () => {
  for (const shape of ["circle", "ellipse"]) {
    const mesh = square.generateTriangulation({ shape, seed: "no-center-" + shape, splits: 0 });
    assert.deepEqual(square.counts(mesh), { V: 8, E: 13, F: 6, chi: 1 });
    assert.equal(mesh.vertices.every(vertex => vertex.boundary), true);
    assert.equal(mesh.vertices.some(vertex => Math.abs(vertex.x - 180) < 1e-9 && Math.abs(vertex.y - 180) < 1e-9), false);
    mesh.faces.forEach(face => face.vertices.forEach(id => assert.ok(mesh.boundary.includes(id))));

    const first = square.generateTriangulation({ shape, seed: "partition-a", splits: 0 });
    const repeat = square.generateTriangulation({ shape, seed: "partition-a", splits: 0 });
    const other = square.generateTriangulation({ shape, seed: "partition-b", splits: 0 });
    const interiorKeys = candidate => candidate.edges.filter(edge => edge.faces.length === 2).map(edge => edge.key);
    assert.deepEqual(interiorKeys(first), interiorKeys(repeat));
    assert.notDeepEqual(interiorKeys(first), interiorKeys(other));
    assert.equal(first.edges.filter(edge => edge.faces.length === 1).length, 8);
    assert.equal(first.edges.filter(edge => edge.faces.length === 2).length, 5);
  }
});

test("a quadratic edge control is shared by both incident triangle paths", () => {
  const mesh = square.generateTriangulation({ seed: "curves", splits: 5 });
  const shared = mesh.edges.find(edge => edge.faces.length === 2);
  assert.ok(shared);
  const adjacent = shared.faces.map(id => mesh.faces.find(face => face.id === id));
  const straightPaths = adjacent.map(face => square.facePath(mesh, face));
  const curved = square.setEdgeBend(mesh, shared.key, 0.17);
  const control = square.controlPoint(curved.edges.find(edge => edge.key === shared.key), curved.vertices);
  const curvedPaths = adjacent.map(face => square.facePath(curved, face));
  assert.notDeepEqual(curvedPaths, straightPaths);
  curvedPaths.forEach(pathData => {
    assert.match(pathData, new RegExp(`${Number(control.x.toFixed(2))} ${Number(control.y.toFixed(2))}`));
  });
  assert.equal(mesh.edges.find(edge => edge.key === shared.key).bend, 0, "curve edits are immutable");
  assert.equal(square.setEdgeBend(mesh, shared.key, 99).edges.find(edge => edge.key === shared.key).bend, square.MAX_BEND);
});

test("interactive curve edits stop before crossing another edge", () => {
  for (const shape of SHAPES) {
    const mesh = square.generateTriangulation({ shape, seed: "safe-curves-" + shape, splits: 4 });
    mesh.edges.forEach(edge => {
      assert.equal(square.isValidEdgeControl(mesh, edge.key, edge.controlAlong, edge.bend), true);
    });
  }

  const mesh = square.generateTriangulation({ shape: "rectangle", seed: "planar-disk", splits: 4 });
  const edge = mesh.edges.find(item => item.key === "0:2");
  assert.ok(edge);
  assert.equal(square.isValidEdgeControl(mesh, edge.key, edge.controlAlong, -square.MAX_BEND), false);
  assert.equal(square.moveEdgeControl(mesh, edge.key, edge.controlAlong, -square.MAX_BEND), mesh);
  const safe = square.moveEdgeControl(mesh, edge.key, edge.controlAlong, -0.02);
  assert.notEqual(safe, mesh);
});

test("node motion preserves orientation and reset restores the selected partition", () => {
  const mesh = square.generateTriangulation({ shape: "ellipse", seed: "drag", splits: 6 });
  const interior = mesh.vertices.find(vertex => !vertex.boundary);
  assert.ok(square.isValidVertexMove(mesh, interior.id, interior.x + 1, interior.y + 1));
  const moved = square.moveVertex(mesh, interior.id, interior.x + 1, interior.y + 1);
  assert.notEqual(moved, mesh);
  assert.equal(mesh.vertices[interior.id].x, interior.x, "vertex edits are immutable");
  assert.equal(square.isValidVertexMove(mesh, interior.id, -50, -50), false);
  assert.equal(square.moveVertex(mesh, interior.id, -50, -50), mesh, "an invalid edit returns the unchanged mesh");

  const edge = moved.edges[0];
  const deformed = square.setEdgeBend(moved, edge.key, -0.2);
  const reset = square.resetGeometry(deformed);
  reset.vertices.forEach(vertex => {
    close(vertex.x, vertex.homeX);
    close(vertex.y, vertex.homeY);
  });
  reset.edges.forEach(item => {
    close(item.bend, item.homeBend);
    close(item.controlAlong, item.homeControlAlong);
  });
});

test("removing a triangle erases only edges not shared with a remaining triangle", () => {
  const mesh = square.generateTriangulation({ seed: "remove", splits: 0 });
  const before = square.counts(mesh);
  const removed = square.removeFace(mesh, mesh.faces[0].id);
  assert.deepEqual(square.counts(removed), { V: before.V - 1, E: before.E - 2, F: before.F - 1, chi: 1 });
  assert.equal(square.removedEdgeKeys(removed).size, 2);
  assert.equal(square.removedVertexIds(removed).size, 1);
  const shared = mesh.edges.find(edge => edge.faces.length === 2);
  assert.ok(shared);
  assert.equal(square.removedEdgeKeys(removed).has(shared.key), false, "the diagonal remains for the active neighboring triangle");
  assert.equal(mesh.faces[0].active, true, "face edits are immutable");
  const restored = square.restoreFaces(removed);
  assert.deepEqual(square.counts(restored), before);
  assert.ok(restored.faces.every(face => face.active));
});

test("a shared edge disappears only after both incident triangles are erased", () => {
  const mesh = square.generateTriangulation({ seed: "shared-remove", splits: 0 });
  const shared = mesh.edges.find(edge => edge.faces.length === 2);
  assert.ok(shared);
  const first = square.removeFace(mesh, shared.faces[0]);
  const second = square.removeFace(first, shared.faces[1]);
  assert.equal(square.removedEdgeKeys(first).size, 2);
  assert.equal(square.removedEdgeKeys(first).has(shared.key), false);
  assert.equal(square.removedEdgeKeys(second).size, 5);
  const before = square.counts(mesh), after = square.counts(second);
  assert.deepEqual(after, { V: 0, E: 0, F: 0, chi: 0 });
  assert.deepEqual(square.counts(square.removeFace(second, shared.faces[1])), after, "repeated removal is idempotent");
  const oneStillRemoved = square.setFaceActive(second, shared.faces[0], true);
  assert.equal(square.removedEdgeKeys(oneStillRemoved).has(shared.key), false, "a shared edge returns as soon as either incident face is active");
  assert.deepEqual(square.counts(oneStillRemoved), { V: 3, E: 3, F: 1, chi: 1 });
  const bothRestored = square.setFaceActive(oneStillRemoved, shared.faces[1], true);
  assert.equal(square.removedEdgeKeys(bothRestored).has(shared.key), false);
});

test("reactivating a removed face restores exactly its required cells", () => {
  const mesh = square.generateTriangulation({ seed: "toggle", splits: 0 });
  const faceId = mesh.faces[0].id;
  const removed = square.setFaceActive(mesh, faceId, false);
  const restored = square.setFaceActive(removed, faceId, true);
  assert.deepEqual(square.counts(restored), square.counts(mesh));
  assert.equal(square.removedEdgeKeys(restored).size, 0);
  assert.equal(square.removedVertexIds(restored).size, 0);
});

test("active cells are exactly the union of visible faces for every shape", () => {
  for (const shape of SHAPES) {
    const mesh = square.generateTriangulation({ shape, seed: "active-" + shape, splits: 3 });
    const removed = square.setFaceActive(mesh, mesh.faces[1].id, false);
    const activeFaces = removed.faces.filter(face => face.active !== false);
    const expectedVertices = new Set(activeFaces.flatMap(face => face.vertices));
    const expectedEdges = new Set();
    activeFaces.forEach(face => {
      for (let index = 0; index < 3; index++) {
        expectedEdges.add(square.edgeKey(face.vertices[index], face.vertices[(index + 1) % 3]));
      }
    });
    assert.deepEqual(square.counts(removed), {
      V: expectedVertices.size,
      E: expectedEdges.size,
      F: activeFaces.length,
      chi: expectedVertices.size - expectedEdges.size + activeFaces.length
    });
    assert.deepEqual(square.validateTriangulation(removed), { valid: true, errors: [] });
    assert.deepEqual(square.counts(square.setFaceActive(removed, mesh.faces[1].id, true)), square.counts(mesh));
  }
});

test("the browser runtime exposes the documented mounting and accessibility hooks", () => {
  const sourcePath = path.join(__dirname, "../cad-modules/euler-characteristic/square-lab.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.equal(typeof square.mount, "function");
  assert.equal(typeof square.mountAll, "function");
  assert.match(source, /querySelectorAll\("\[data-square-lab\]"\)/);
  assert.match(source, /data-square-shape/);
  assert.match(source, /Boundary shape/);
  assert.match(source, /function setShape/);
  assert.match(source, /let handlesVisible = false/);
  assert.match(source, /toggle\.checked = false/);
  assert.doesNotMatch(source, /data-square-randomize-all/);
  assert.match(source, /aria-live/);
  assert.match(source, /role:\s*"slider"/);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.key === " "/);
  assert.match(source, /is removed\. Press Enter or Space to restore it/);
  assert.doesNotMatch(source, /square-home-outline/);
  assert.match(source, /root && root\.document/);
});

test("public helpers reject malformed inputs", () => {
  assert.throws(() => square.generateTriangulation({ splits: -1 }), RangeError);
  assert.throws(() => square.generateTriangulation({ splits: 1.5 }), RangeError);
  assert.throws(() => square.generateTriangulation({ shape: "hexagon" }), RangeError);
  assert.throws(() => square.edgeKey(1, 1), RangeError);
  assert.throws(() => square.buildEdges([{ id: 0, vertices: [0, 1] }]), RangeError);
  assert.throws(() => square.counts(null), TypeError);
  const mesh = square.generateTriangulation({ seed: "errors", splits: 2 });
  assert.throws(() => square.setEdgeBend(mesh, "missing", 0.1), RangeError);
  assert.throws(() => square.removeFace(mesh, 9999), RangeError);
});
