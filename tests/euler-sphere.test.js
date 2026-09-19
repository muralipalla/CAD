const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sphere = require("../cad-modules/euler-characteristic/sphere-lab.js");

const root = path.resolve(__dirname, "..");
const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};

test("indexed icospheres have the exact expected V, E, F counts", () => {
  for (let detail = 0; detail <= 2; detail += 1) {
    const mesh = sphere.buildIcosphere(detail);
    const factor = 4 ** detail;
    const counts = sphere.topologyCounts(mesh);
    assert.deepEqual(counts, { V: 10 * factor + 2, E: 30 * factor, F: 20 * factor, chi: 2 });
    assert.equal(mesh.vertices.length, counts.V);
    assert.equal(mesh.edges.length, counts.E);
  }
  assert.deepEqual(sphere.topologyCounts(sphere.buildIcosphere(1)), { V: 42, E: 120, F: 80, chi: 2 });
});

test("the closed sphere has two faces at every edge", () => {
  const mesh = sphere.buildIcosphere(1);
  const edges = sphere.collectEdges(mesh.faces);
  assert.equal(edges.length, 120);
  assert.ok(edges.every(edge => edge.count === 2));
  assert.equal(edges.reduce((sum, edge) => sum + edge.count, 0), 3 * mesh.faces.length);
});

test("removing one open triangle preserves its three boundary edges and changes chi to one", () => {
  const mesh = sphere.buildIcosphere(1);
  const removedFace = 0;
  const counts = sphere.topologyCounts(mesh, removedFace);
  const edges = sphere.collectEdges(mesh.faces, removedFace);
  const boundary = edges.filter(edge => edge.count === 1);
  assert.deepEqual(counts, { V: 42, E: 120, F: 79, chi: 1 });
  assert.equal(boundary.length, 3);
  assert.ok(edges.filter(edge => edge.count === 2).length === 117);
  const removedKeys = new Set([[mesh.faces[0][0], mesh.faces[0][1]], [mesh.faces[0][1], mesh.faces[0][2]], [mesh.faces[0][2], mesh.faces[0][0]]].map(pair => sphere.edgeKey(pair[0], pair[1])));
  assert.deepEqual(new Set(boundary.map(edge => sphere.edgeKey(edge.a, edge.b))), removedKeys);
  assert.equal(3 * counts.F, 2 * counts.E - boundary.length);
});

test("the Schlegel family starts at the punctured sphere and ends in a centered equilateral planar boundary", () => {
  const mesh = sphere.buildIcosphere(1);
  const plan = sphere.prepareSchlegel(mesh, 3);
  assert.equal(plan.boundaryEdges.length, 3);
  assert.deepEqual(plan.closedCounts, { V: 42, E: 120, F: 80, chi: 2 });
  assert.deepEqual(plan.openCounts, { V: 42, E: 120, F: 79, chi: 1 });
  assert.ok(plan.height > 0);

  const start = sphere.schlegelPositions(plan, 0);
  const middle = sphere.schlegelPositions(plan, 0.47);
  const flat = sphere.schlegelPositions(plan, 1);
  start.forEach((point, index) => point.forEach((value, coordinate) => close(value, plan.localVertices[index][coordinate])));
  flat.forEach(point => close(point[2], 0, 1e-12));
  assert.ok(middle.every(point => point.every(Number.isFinite)));
  const boundary = plan.boundary.map(index => flat[index]);
  const lengths = boundary.map((point, index) => {
    const next = boundary[(index + 1) % boundary.length];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
  close(lengths[0], lengths[1]);
  close(lengths[1], lengths[2]);
  close(boundary.reduce((sum, point) => sum + point[0], 0) / 3, 0);
  close(boundary.reduce((sum, point) => sum + point[1], 0) / 3, 0);

  const cosine = -0.5, sine = Math.sqrt(3) / 2;
  for (const point of flat) {
    const rotated = [cosine * point[0] - sine * point[1], sine * point[0] + cosine * point[1]];
    assert.ok(flat.some(candidate => Math.hypot(candidate[0] - rotated[0], candidate[1] - rotated[1]) < 1e-9));
  }
});

test("the flattened Schlegel diagram has nondegenerate consistently oriented active triangles", () => {
  const mesh = sphere.buildIcosphere(1);
  const plan = sphere.prepareSchlegel(mesh, 3);
  const flat = sphere.schlegelPositions(plan, 1);
  let orientation = 0;
  for (const faceIndex of plan.activeFaceIndices) {
    const face = mesh.faces[faceIndex], a = flat[face[0]], b = flat[face[1]], c = flat[face[2]];
    const signedTwiceArea = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    assert.ok(Math.abs(signedTwiceArea) > 1e-12, `face ${faceIndex} collapsed`);
    const sign = Math.sign(signedTwiceArea);
    if (!orientation) orientation = sign;
    else assert.equal(sign, orientation, `face ${faceIndex} flipped`);
  }
});

test("the browser adapter uses the documented optional data selectors", () => {
  const source = fs.readFileSync(path.join(root, "cad-modules", "euler-characteristic", "sphere-lab.js"), "utf8");
  for (const selector of [
    "data-sphere-lab", "data-sphere-canvas", "data-sphere-fallback", "data-sphere-progress",
    "data-sphere-action", "data-sphere-option", "data-sphere-v", "data-sphere-e", "data-sphere-f",
    "data-sphere-chi", "data-sphere-stage-label", "data-sphere-live"
  ]) assert.match(source, new RegExp(selector));
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /webglcontextlost/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /removed:\s*false/);
  assert.match(source, /progress:\s*0/);
  assert.match(source, /function removeTriangle/);
  assert.match(source, /function flattenSphere/);
  assert.match(source, /progressInput\.disabled = !state\.removed/);
  assert.doesNotMatch(source, /removeAndFlatten/);
});

test("the sphere uses opaque yellow exterior faces, orange interior faces, and solid red edges", () => {
  const source = fs.readFileSync(path.join(root, "cad-modules", "euler-characteristic", "sphere-lab.js"), "utf8");
  assert.match(source, /const exteriorFaceMaterial = \{[\s\S]*?color:\s*0xf2c94c/);
  assert.match(source, /const interiorFaceMaterial = Object\.assign\(\{\}, exteriorFaceMaterial, \{[\s\S]*?color:\s*0xf28c28/);
  assert.match(source, /side:\s*T\.FrontSide/);
  assert.match(source, /side:\s*T\.BackSide/);
  assert.match(source, /transparent:\s*false/);
  assert.match(source, /opacity:\s*1/);
  assert.match(source, /depthWrite:\s*true/);
  assert.match(source, /new T\.MeshPhongMaterial\(exteriorFaceMaterial\)/);
  assert.match(source, /new T\.MeshPhongMaterial\(interiorFaceMaterial\)/);
  assert.match(source, /removableExterior\.visible = !removed/);
  assert.match(source, /removableInterior\.visible = !removed/);
  assert.match(source, /LineBasicMaterial\(\{ color:\s*0xc91f37, transparent:\s*false, opacity:\s*1 \}\)/);
  assert.match(source, /let azimuth = 0, elevation = 0, distance = 5\.1/);
  assert.match(source, /azimuth = 0; elevation = 0; distance = 5\.1; requestRender\(\)/);
});
