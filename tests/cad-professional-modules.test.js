const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const exchange = require("../cad-modules/cad-software-data-exchange/exchange-lab.js");
const workflow = require("../cad-modules/cad-workflow/mbd-lab.js");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

test("exchange profiles distinguish exact, mesh, drawing, and lightweight delivery", () => {
  assert.equal(exchange.formatProfile("step").geometry, "Exact B-Rep/NURBS");
  assert.equal(exchange.formatProfile("stl").view, "mesh");
  assert.equal(exchange.formatProfile("dxf").view, "drawing");
  assert.equal(exchange.formatProfile("gltf").view, "lightweight");
  assert.match(exchange.formatProfile("gltf").units, /Metres by specification/);
  assert.match(exchange.formatProfile("stl").topology, /No explicit topology/);
  assert.equal(exchange.meshDependent("stl"), true);
  assert.equal(exchange.meshDependent("jt"), true);
  assert.equal(exchange.meshDependent("step"), false);

  const copy = exchange.formatProfile("step");
  assert.notEqual(copy, exchange.FORMAT_PROFILES.step);
  assert.throws(() => exchange.formatProfile("unknown"), RangeError);
});

test("mesh detail settings progress from coarse to very fine", () => {
  const segments = exchange.DETAIL_LEVELS.map((_, index) => exchange.detailLevel(index).segments);
  assert.deepEqual(segments, [6, 12, 24, 48]);
  assert.throws(() => exchange.detailLevel(-1), RangeError);
  assert.throws(() => exchange.detailLevel(1.5), RangeError);
});

test("position-tolerance result uses diametrical axis deviation", () => {
  const passing = workflow.positionResult(0.08, 0.05, 0.4);
  assert.ok(Math.abs(passing.radialOffset - Math.hypot(0.08, 0.05)) < 1e-12);
  assert.ok(Math.abs(passing.diametricalDeviation - 2 * Math.hypot(0.08, 0.05)) < 1e-12);
  assert.equal(passing.pass, true);

  assert.equal(workflow.positionResult(0.2, 0, 0.4).pass, true);
  assert.equal(workflow.positionResult(0.3, 0.3, 0.4).pass, false);
  assert.throws(() => workflow.positionResult(0, 0, 0), RangeError);
  assert.throws(() => workflow.positionResult(Number.NaN, 0, 0.4), RangeError);
});

test("workflow stages reveal product-definition layers progressively", () => {
  assert.equal(workflow.STAGES.length, 6);
  assert.deepEqual(workflow.stageState(0), {
    index: 0,
    label: "Nominal model",
    description: "Begin with the theoretically exact plate and hole.",
    showDatumFeatures: false,
    showDatumFrame: false,
    showPmi: false,
    showToleranceZone: false,
    showInspection: false
  });
  assert.equal(workflow.stageState(3).showPmi, true);
  assert.equal(workflow.stageState(3).showToleranceZone, false);
  assert.equal(workflow.stageState(5).showInspection, true);
  assert.throws(() => workflow.stageState(workflow.STAGES.length), RangeError);
});

test("new modules are wired into the course sequence and local Three.js runtime", () => {
  const home = read("index.html");
  const hub = read("cad-modules", "index.html");
  const solids = read("cad-modules", "solid-modeling", "index.html");
  const exchangePage = read("cad-modules", "cad-software-data-exchange", "index.html");
  const workflowPage = read("cad-modules", "cad-workflow", "index.html");
  const references = read("cad-modules", "references", "index.html");

  assert.doesNotMatch(home, /id="learning-outcomes-title"/);
  assert.match(home, /cad-modules\/index\.html#learning-outcomes/);
  assert.match(hub, /id="learning-outcomes-title"/);
  assert.ok(hub.indexOf("cad-software-data-exchange/index.html") < hub.indexOf("cad-workflow/index.html"));
  assert.match(solids, /\.\.\/cad-software-data-exchange\/index\.html/);

  assert.match(exchangePage, /id="interactive-data-exchange"/);
  assert.match(exchangePage, /data-exchange-lab/);
  assert.ok(exchangePage.indexOf('id="exchange-formats"') < exchangePage.indexOf('id="interactive-data-exchange"'));
  assert.ok(exchangePage.indexOf("assets/vendor/three.min.js") < exchangePage.indexOf("exchange-lab.js"));

  assert.match(workflowPage, /id="interactive-mbd-inspection"/);
  assert.match(workflowPage, /data-mbd-lab/);
  assert.ok(workflowPage.indexOf('id="model-based-definition"') < workflowPage.indexOf('id="interactive-mbd-inspection"'));
  assert.ok(workflowPage.indexOf('id="interactive-mbd-inspection"') < workflowPage.indexOf('id="release-and-revision"'));
  assert.ok(workflowPage.indexOf('id="release-and-revision"') < workflowPage.indexOf('id="exchange-validation"'));
  assert.ok(workflowPage.indexOf('id="exchange-validation"') < workflowPage.indexOf('id="digital-thread"'));
  assert.ok(workflowPage.indexOf("assets/vendor/three.min.js") < workflowPage.indexOf("mbd-lab.js"));

  assert.match(references, /id="ref-19"/);
  assert.match(references, /id="ref-41"/);
});

test("solid modeling separates kernel representations from feature history", () => {
  const solids = read("cad-modules", "solid-modeling", "index.html");
  assert.match(solids, /Solid Representations and Modeling Layers/);
  assert.match(solids, /Feature-based modeling is not normally a separate geometric representation/);
  assert.match(solids, /CSG belongs to the geometric representation or construction layer/);
  assert.match(solids, /Parametric features belong to the design-history layer/);
  assert.match(solids, /Intersection generally has no direct manufacturing analogue/);
  assert.doesNotMatch(solids, /Boolean operations correspond to manufacturing-like operations/);
});

test("solid modeling presents Euler checks as necessary but not sufficient", () => {
  const solids = read("cad-modules", "solid-modeling", "index.html");
  assert.match(solids, /Necessary, Not Sufficient/);
  assert.match(solids, /Passing the applicable Euler check is not proof that a model is valid/);
  assert.match(solids, /face–face self-intersection/);
  assert.match(solids, /passing them is not a validity proof/);
  assert.match(solids, /separate topological and geometric tests are still required/);
});

test("changed course pages resolve their local links, assets, and fragments", () => {
  const pages = [
    "index.html",
    path.join("cad-modules", "index.html"),
    path.join("cad-modules", "solid-modeling", "index.html"),
    path.join("cad-modules", "cad-software-data-exchange", "index.html"),
    path.join("cad-modules", "cad-workflow", "index.html"),
    path.join("cad-modules", "references", "index.html")
  ];

  pages.forEach((relativePage) => {
    const pagePath = path.join(root, relativePage);
    const pageHtml = fs.readFileSync(pagePath, "utf8");
    for (const match of pageHtml.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const raw = match[1];
      if (/^(?:https?:|mailto:|tel:|data:)/.test(raw)) continue;
      const [rawPath, fragment] = raw.split("#");
      const cleanPath = rawPath.split("?")[0];
      let targetPath = cleanPath ? path.resolve(path.dirname(pagePath), cleanPath) : pagePath;
      if (cleanPath.endsWith("/")) targetPath = path.join(targetPath, "index.html");

      assert.equal(fs.existsSync(targetPath), true, `${relativePage} has a missing local target: ${raw}`);
      if (fragment && path.extname(targetPath).toLowerCase() === ".html") {
        const targetHtml = fs.readFileSync(targetPath, "utf8");
        assert.match(targetHtml, new RegExp(`id="${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `${relativePage} has a missing fragment: ${raw}`);
      }
    }
  });
});
