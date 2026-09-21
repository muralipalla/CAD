const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const genus = require("../cad-modules/euler-characteristic/genus-lab.js");

const root = path.resolve(__dirname, "..");

test("implicit Boolean models are closed orientable meshes with chi = 2 - 2g", () => {
  for (let handles = 0; handles <= 3; handles += 1) {
    const mesh = genus.buildGenusMesh(handles, 20);
    const counts = genus.topologyCounts(mesh, []);
    assert.equal(counts.chi, 2 - 2 * handles);
    assert.ok(counts.V > 0 && counts.E > 0 && counts.F > 0);
    assert.ok(genus.collectEdges(mesh.faces, []).every(edge => edge.count === 2));
    assert.equal(genus.genusFromEuler(counts.chi, 0), handles);
  }
});

test("the denser display meshes remain closed and preserve genus", () => {
  for (let handles = 0; handles <= 3; handles += 1) {
    const mesh = genus.buildGenusMesh(handles, 36);
    const counts = genus.topologyCounts(mesh, []);
    assert.equal(counts.chi, 2 - 2 * handles);
    assert.ok(genus.collectEdges(mesh.faces, []).every(edge => edge.count === 2));
  }
});

test("removing disjoint triangular disks creates the requested boundary loops", () => {
  for (let handles = 0; handles <= 3; handles += 1) {
    const mesh = genus.buildGenusMesh(handles, 20);
    const closed = genus.topologyCounts(mesh, []);
    for (let boundaries = 1; boundaries <= 3; boundaries += 1) {
      const omitted = genus.selectBoundaryFaces(mesh, boundaries);
      const open = genus.topologyCounts(mesh, omitted);
      assert.equal(omitted.length, boundaries);
      assert.equal(genus.boundaryComponentCount(mesh, omitted), boundaries);
      assert.equal(open.V, closed.V);
      assert.equal(open.E, closed.E);
      assert.equal(open.F, closed.F - boundaries);
      assert.equal(open.chi, 2 - 2 * handles - boundaries);
      assert.equal(genus.genusFromEuler(open.chi, boundaries), handles);
    }
  }
});

test("connected sum subtracts two from Euler characteristic", () => {
  assert.equal(genus.connectedSumEuler(2, 0), 0);
  assert.equal(genus.connectedSumEuler(0, 0), -2);
  assert.equal(genus.connectedSumEuler(-2, 0), -4);
});

test("the Boolean field removes a through-cylinder from the sphere", () => {
  assert.ok(genus.genusField([0, 0, 0], 0) < 0);
  assert.ok(genus.genusField([0, 0, 0], 1) > 0);
  assert.ok(genus.genusField([0.5, 0, 0], 1) < 0);
  assert.equal(genus.surfaceKind([0.285, 0, 0], 1), "tunnel");
});

test("the browser adapter exposes genus, boundary, and accessibility controls", () => {
  const source = fs.readFileSync(path.join(root, "cad-modules", "euler-characteristic", "genus-lab.js"), "utf8");
  const page = fs.readFileSync(path.join(root, "cad-modules", "euler-characteristic", "index.html"), "utf8");
  for (const selector of [
    "data-genus-lab", "data-genus-canvas", "data-genus-input", "data-boundary-input",
    "data-genus-transparency", "data-genus-transparency-value",
    "data-genus-v", "data-genus-e", "data-genus-f", "data-genus-chi",
    "data-genus-live", "data-connected-sum"
  ]) assert.match(source, new RegExp(selector));
  assert.match(page, /data-genus-live[^>]*aria-live="polite"|aria-live="polite"[^>]*data-genus-live/);
  assert.match(source, /color:\s*0x8fd3ff/);
  assert.match(source, /color:\s*0xf28c28/);
  assert.match(source, /color:\s*0x54e3ff/);
  assert.match(source, /transparent:\s*true/);
  assert.match(source, /opacity:\s*1\s*-\s*shellTransparency/);
  assert.match(source, /depthWrite:\s*false/);
  assert.match(source, /flatShading:\s*false/);
  assert.match(source, /buildGenusMesh\(state\.genus,\s*36\)/);
  assert.match(source, /Math\.max\(sphere,\s*-cutter\)/);
  assert.match(source, /new T\.TubeGeometry\(curve,\s*96,\s*0\.022,\s*8,\s*true\)/);
  assert.match(source, /setExteriorTransparency/);
  assert.match(source, /vGenusPosition/);
  assert.match(source, /discard/);
  assert.match(page, /data-genus-option="edges"(?![^>]*checked)/);
  assert.match(page, /id="genus-transparency"[^>]*min="0"[^>]*max="90"[^>]*value="62"/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /Home/);
});
