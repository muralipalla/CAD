const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const boundary = require("../cad-modules/euler-characteristic/genus-lab.js");

const root = path.resolve(__dirname, "..");

test("the three construction stages have the intended closed-shell topology", () => {
  const expected = [
    { chi: 2, components: 2, totalGenus: 1, componentChi: [2, 0] },
    { chi: 0, components: 1, totalGenus: 1, componentChi: [0] },
    { chi: -2, components: 1, totalGenus: 2, componentChi: [-2] }
  ];
  expected.forEach((target, stage) => {
    const mesh = boundary.buildBoundaryMesh(stage, 24);
    const counts = boundary.topologyCounts(mesh, []);
    const components = boundary.componentTopologies(mesh, []);
    assert.equal(counts.chi, target.chi);
    assert.equal(components.length, target.components);
    assert.deepEqual(components.map(component => component.chi), target.componentChi);
    assert.equal(boundary.totalGenusFromEuler(counts.chi, components.length), target.totalGenus);
    assert.ok(boundary.collectEdges(mesh.faces, []).every(edge => edge.count === 2));
  });
});

test("the denser display meshes preserve the same components and genus", () => {
  const expectedChi = [2, 0, -2];
  const expectedComponents = [2, 1, 1];
  for (let stage = 0; stage <= 2; stage += 1) {
    const mesh = boundary.buildBoundaryMesh(stage, 42);
    const counts = boundary.topologyCounts(mesh, []);
    const components = boundary.componentTopologies(mesh, []);
    assert.equal(counts.chi, expectedChi[stage]);
    assert.equal(components.length, expectedComponents[stage]);
    assert.ok(boundary.collectEdges(mesh.faces, []).every(edge => edge.count === 2));
  }
});

test("the reference field contains a toroidal cavity and staged connecting passages", () => {
  assert.ok(boundary.boundaryField([0, 0, 0], 0) < 0);
  assert.ok(boundary.boundaryField([0.78, 0, 0], 0) > 0);
  assert.ok(boundary.boundaryField([1.2, 0, 0], 0) < 0);
  assert.ok(boundary.boundaryField([1.2, 0, 0], 1) > 0);
  assert.ok(boundary.boundaryField([0.6, Math.sqrt(3) * 0.6, 0], 1) < 0);
  assert.ok(boundary.boundaryField([0.6, Math.sqrt(3) * 0.6, 0], 2) > 0);
  assert.equal(boundary.surfaceKind([1.45, 0, 0], 0), "outer");
  assert.equal(boundary.surfaceKind([1.02, 0, 0], 0), "inner-torus");
});

test("connected sum and disconnected-shell Euler formulas agree", () => {
  assert.equal(boundary.connectedSumEuler(2, 0), 0);
  assert.equal(boundary.connectedSumEuler(0, 0), -2);
  assert.equal(boundary.totalGenusFromEuler(2, 2), 1);
  assert.equal(boundary.totalGenusFromEuler(0, 1), 1);
  assert.equal(boundary.totalGenusFromEuler(-2, 1), 2);
});

test("the browser adapter exposes shell, connection, and transparency controls", () => {
  const source = fs.readFileSync(path.join(root, "cad-modules", "euler-characteristic", "genus-lab.js"), "utf8");
  const page = fs.readFileSync(path.join(root, "cad-modules", "euler-characteristic", "index.html"), "utf8");
  for (const selector of [
    "data-genus-lab", "data-genus-canvas", "data-connection-input", "data-connection-value",
    "data-shell-count", "data-total-genus", "data-genus-transparency", "data-genus-transparency-value",
    "data-genus-v", "data-genus-e", "data-genus-f", "data-genus-chi", "data-genus-live", "data-connected-sum"
  ]) assert.match(source, new RegExp(selector));
  assert.match(page, /data-genus-live[^>]*aria-live="polite"|aria-live="polite"[^>]*data-genus-live/);
  assert.match(page, /id="connection-input"[^>]*min="0"[^>]*max="2"[^>]*value="0"/);
  assert.match(page, /data-genus-option="edges"(?![^>]*checked)/);
  assert.match(page, /id="genus-transparency"[^>]*min="0"[^>]*max="90"[^>]*value="62"/);
  assert.match(source, /color:\s*0x8fd3ff/);
  assert.match(source, /color:\s*0xf28c28/);
  assert.match(source, /transparent:\s*true/);
  assert.match(source, /opacity:\s*1\s*-\s*shellTransparency/);
  assert.match(source, /depthWrite:\s*false/);
  assert.match(source, /flatShading:\s*false/);
  assert.match(source, /smoothMinimum/);
  assert.match(source, /smoothMaximum/);
  assert.match(source, /buildGenusMesh\(state\.stage,\s*42\)/);
  assert.match(source, /setExteriorTransparency/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /Home/);
});
