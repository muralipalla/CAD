const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

function localTargets(relativePage) {
  const pagePath = path.join(root, relativePage);
  const html = fs.readFileSync(pagePath, "utf8");
  return Array.from(html.matchAll(/(?:href|src)="([^"]+)"/g), match => match[1])
    .filter(raw => !/^(?:https?:|mailto:|tel:|data:)/.test(raw))
    .map(raw => {
      const [rawPath, fragment] = raw.split("#");
      const cleanPath = rawPath.split("?")[0];
      let target = cleanPath ? path.resolve(path.dirname(pagePath), cleanPath) : pagePath;
      if (cleanPath.endsWith("/")) target = path.join(target, "index.html");
      return { raw, target, fragment };
    });
}

test("the proof is a standalone module linked from Solid Modeling", () => {
  const solids = read("cad-modules", "solid-modeling", "index.html");
  const page = read("cad-modules", "euler-characteristic", "index.html");
  assert.match(solids, /href="\.\.\/euler-characteristic\/index\.html"/);
  assert.doesNotMatch(solids, /data-square-lab|data-sphere-lab|data-torus-lab/);
  assert.match(page, /Euler characteristic: from a planar disk to a torus/);
  assert.match(page, /href="\.\.\/solid-modeling\/index\.html"/);
});

test("the planar proof provides one editable partition with four shape choices", () => {
  const page = read("cad-modules", "euler-characteristic", "index.html");
  const runtime = read("cad-modules", "euler-characteristic", "square-lab.js");
  assert.equal((page.match(/data-square-lab/g) || []).length, 1);
  assert.match(page, /data-shape="rectangle"/);
  assert.doesNotMatch(page, /data-square-(?:randomize|restore|reset)-all/);
  assert.match(runtime, /triangle: "Triangle"/);
  assert.match(runtime, /rectangle: "Rectangle"/);
  assert.match(runtime, /circle: "Circle"/);
  assert.match(runtime, /ellipse: "Ellipse"/);
  assert.match(runtime, /data-square-shape/);
  assert.match(runtime, /New random partition/);
  assert.match(page, /click the same empty region again to restore it/);
  assert.match(page, /An edge disappears only when no remaining triangle uses it/);
  assert.match(page, /a vertex disappears only when no remaining face contains it/);
  assert.doesNotMatch(page, /square-home-outline/);
  assert.match(page, /shared handle controls an interior edge for both neighboring faces/);
  assert.match(page, /with no special center vertex/);
  assert.match(page, /Figure 2 · A closed surface/);
  assert.match(page, /Figure 3 · A quotient surface/);
});

test("Three.js loads before both closed-surface labs", () => {
  const page = read("cad-modules", "euler-characteristic", "index.html");
  const three = page.indexOf("assets/vendor/three.min.js");
  const sphere = page.indexOf("sphere-lab.js");
  const torus = page.indexOf("torus-lab.js");
  assert.ok(three >= 0 && sphere > three && torus > three);
  assert.match(page, /data-sphere-option="nodes"/);
  assert.match(page, /data-sphere-option="tessellation"/);
  assert.match(page, /data-sphere-action="remove"/);
  assert.match(page, /data-sphere-action="flatten"/);
  assert.ok(page.indexOf('data-sphere-action="remove"') < page.indexOf('data-sphere-action="flatten"'));
  assert.match(page, /Step 1 · Remove one triangle/);
  assert.match(page, /Step 2 · Flatten punctured sphere/);
  assert.match(page, /data-sphere-progress[^>]*disabled/);
  assert.match(page, /data-torus-stage="rectangle"/);
  assert.match(page, /data-torus-stage="cylinder"/);
  assert.match(page, /data-torus-stage="torus"/);
  assert.match(page, /data-torus-option="labels"/);
});

test("the proofs state the exact cell counts and distinguish gluing from deformation", () => {
  const page = read("cad-modules", "euler-characteristic", "index.html");
  assert.match(page, /\(V,E,F\)=\(4,5,2\)/);
  assert.match(page, /\(V,E,F\)=\(8,13,6\)/);
  assert.match(page, /V=42\\\), \\\(E=120\\\), and \\\(F=80/);
  assert.match(page, /42-120\+79=1/);
  assert.match(page, /\(V,E,F\)=\(9,16,8\)/);
  assert.match(page, /\(6,14,8\)/);
  assert.match(page, /\(4,12,8\)/);
  assert.match(page, /quotient operations, not continuous deformations/);
  assert.match(page, /not a planar embedding of the torus itself/);
});

test("the cited source is present in the shared bibliography", () => {
  const page = read("cad-modules", "euler-characteristic", "index.html");
  const references = read("cad-modules", "references", "index.html");
  assert.match(page, /references\/index\.html#ref-42/);
  assert.match(references, /id="ref-42"/);
  assert.match(references, /A Mathematical Gift, I/);
  assert.match(references, /Kenji Ueno, Koji Shiga, and Shigeyuki Morita/);
});

test("the standalone module has no missing local assets or fragments", () => {
  for (const item of localTargets(path.join("cad-modules", "euler-characteristic", "index.html"))) {
    assert.equal(fs.existsSync(item.target), true, `missing local target ${item.raw}`);
    if (item.fragment && path.extname(item.target).toLowerCase() === ".html") {
      const targetHtml = fs.readFileSync(item.target, "utf8");
      const escaped = item.fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(targetHtml, new RegExp(`id="${escaped}"`), `missing fragment ${item.raw}`);
    }
  }
});

test("the module page does not repeat HTML ids", () => {
  const page = read("cad-modules", "euler-characteristic", "index.html");
  const ids = Array.from(page.matchAll(/\sid="([^"]+)"/g), match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
