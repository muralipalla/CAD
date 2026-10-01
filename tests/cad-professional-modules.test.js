const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const exchange = require("../cad-modules/cad-software-data-exchange/exchange-lab.js");
const workflow = require("../cad-modules/cad-workflow/mbd-lab.js");
const workflowThree = require("../cad-modules/cad-workflow/mbd-three.js");

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

test("GD&T zoom slider increases magnification to the right and round-trips camera distance", () => {
  assert.equal(workflowThree.distanceFromZoom(0), 18);
  assert.equal(workflowThree.distanceFromZoom(100), 6);
  assert.equal(workflowThree.distanceFromZoom(50), 12);
  assert.equal(workflowThree.zoomFromDistance(18), 0);
  assert.equal(workflowThree.zoomFromDistance(6), 100);
  assert.equal(workflowThree.zoomFromDistance(12), 50);
  assert.equal(workflowThree.distanceFromZoom(150), 6);
  assert.equal(workflowThree.distanceFromZoom(-1), 18);
});

test("ordinary wheel scrolls the lesson while modified or full-screen wheel zooms the model", () => {
  assert.equal(workflowThree.shouldZoomOnWheel({ ctrlKey: false, metaKey: false }, false), false);
  assert.equal(workflowThree.shouldZoomOnWheel({ ctrlKey: true, metaKey: false }, false), true);
  assert.equal(workflowThree.shouldZoomOnWheel({ ctrlKey: false, metaKey: true }, false), true);
  assert.equal(workflowThree.shouldZoomOnWheel({ ctrlKey: false, metaKey: false }, true), true);
});

test("GD&T orthographic view presets face the intended datums with consistent screen axes", () => {
  function closeVector(actual, expected, label) {
    assert.equal(actual.length, 3, `${label} has three coordinates`);
    actual.forEach((coordinate, axis) => {
      assert.ok(Math.abs(coordinate - expected[axis]) < 1e-12,
        `${label} axis ${axis}: expected ${expected[axis]}, got ${coordinate}`);
    });
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  const expected = {
    top: { towardCamera: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0], screenUp: [0, 1, 0] },
    front: { towardCamera: [0, -1, 0], up: [0, 0, 1], right: [1, 0, 0], screenUp: [0, 0, 1] },
    side: { towardCamera: [-1, 0, 0], up: [0, 0, 1], right: [0, -1, 0], screenUp: [0, 0, 1] }
  };
  for (const [name, axes] of Object.entries(expected)) {
    const preset = workflowThree.viewPreset(name);
    const direction = [
      Math.cos(preset.elevation) * Math.cos(preset.azimuth),
      Math.cos(preset.elevation) * Math.sin(preset.azimuth),
      Math.sin(preset.elevation)
    ];
    closeVector(direction, axes.towardCamera, `${name} camera direction`);
    closeVector(preset.up, axes.up, `${name} camera up`);
    const right = cross(preset.up, direction);
    closeVector(right, axes.right, `${name} screen right`);
    closeVector(cross(direction, right), axes.screenUp, `${name} screen up`);
  }
  assert.throws(() => workflowThree.viewPreset("unknown"), RangeError);
});

test("GD&T axial views use an orthographic camera and connect all three controls", () => {
  const viewer = read("cad-modules", "cad-workflow", "mbd-three.js");
  const lab = read("cad-modules", "cad-workflow", "mbd-lab.js");
  const page = read("cad-modules", "cad-workflow", "index.html");
  assert.ok(/new T\.OrthographicCamera\(/.test(viewer), "axial views use an orthographic camera");
  for (const edge of ["left", "right", "top", "bottom"]) {
    assert.ok(new RegExp(`\\.${edge}\\s*=`).test(viewer), `orthographic ${edge} frustum edge is updated`);
  }
  assert.ok(/updateProjectionMatrix\(\)/.test(viewer), "the camera projection matrix is updated");
  for (const name of ["top", "front", "side"]) {
    assert.match(page, new RegExp(`<button[^>]*data-gdt-${name}-view`));
    assert.ok(lab.includes(`"[data-gdt-${name}-view]", "${name}View", "${name}"`), `${name} button maps to the matching viewer method`);
    assert.match(viewer, new RegExp(`\\b${name}View\\b`));
  }
  assert.match(lab, /viewer\[method\]\(\)/);
  assert.match(lab, /viewer\.onViewChange\(/, "selected view is announced on the controls");
});

test("GD&T full screen uses the native API and falls back when unavailable or rejected", async () => {
  function classList() {
    const values = new Set();
    return { contains: name => values.has(name), toggle(name, force) {
      if (force === undefined ? !values.has(name) : force) values.add(name);
      else values.delete(name);
    } };
  }
  function target() {
    const listeners = new Map();
    return { addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(callback);
    }, emit(name, event = {}) { for (const callback of listeners.get(name) || []) callback(event); } };
  }
  function harness() {
    const doc = target(), button = target(), label = { textContent: "" };
    const attributes = new Map();
    doc.documentElement = { classList: classList() };
    button.querySelector = () => label;
    button.setAttribute = (name, value) => attributes.set(name, value);
    const lab = { ownerDocument: doc, classList: classList(), querySelector: () => button };
    let resized = 0, preserved = 0;
    const viewer = { resize() { resized++; }, preserveZoom() { preserved++; } };
    const controller = workflow.createFullscreenController(lab, viewer);
    return { doc, button, label, attributes, lab, controller, get resized() { return resized; }, get preserved() { return preserved; } };
  }
  const native = harness();
  let requests = 0, exits = 0;
  native.lab.requestFullscreen = () => { requests++; native.doc.fullscreenElement = native.lab; native.doc.emit("fullscreenchange"); return Promise.resolve(); };
  native.doc.exitFullscreen = () => { exits++; native.doc.fullscreenElement = null; native.doc.emit("fullscreenchange"); return Promise.resolve(); };
  const entering = native.controller.toggle();
  assert.equal(requests, 1, "requestFullscreen is called within the click gesture");
  await entering;
  assert.equal(native.controller.isFull(), true);
  assert.equal(native.attributes.get("aria-pressed"), "true");
  assert.equal(native.lab.classList.contains("gdt-fallback-fullscreen"), false);
  await native.controller.toggle();
  assert.equal(exits, 1);
  assert.equal(native.controller.isFull(), false);
  assert.equal(native.preserved, 2);
  assert.ok(native.resized >= 3);

  const fallback = harness();
  await fallback.controller.toggle();
  assert.equal(fallback.lab.classList.contains("gdt-fallback-fullscreen"), true);
  assert.equal(fallback.doc.documentElement.classList.contains("gdt-fallback-page"), true);
  fallback.doc.emit("keydown", { key: "Escape" });
  assert.equal(fallback.controller.isFull(), false);
  assert.equal(fallback.doc.documentElement.classList.contains("gdt-fallback-page"), false);

  const rejected = harness();
  rejected.lab.requestFullscreen = () => Promise.reject(new Error("Full screen denied"));
  await rejected.controller.toggle();
  assert.equal(rejected.lab.classList.contains("gdt-fallback-fullscreen"), true);
});

test("GD&T studio offers only controls applicable to each modeled feature", () => {
  const hole = workflow.availableControls("hole", 3).map((control) => control.id);
  const slot = workflow.availableControls("slot", 3).map((control) => control.id);
  const surface = workflow.availableControls("surface", 3).map((control) => control.id);
  assert.ok(hole.includes("circularity") && hole.includes("cylindricity") && hole.includes("position"));
  assert.ok(slot.includes("flatness") && slot.includes("position"));
  assert.deepEqual(surface, ["flatness", "profile-line", "profile-surface", "parallelism"]);
  assert.ok(!workflow.availableControls("hole", 1).some((control) => control.id === "parallelism"));
  assert.ok(!slot.includes("parallelism"));
  assert.ok(!hole.includes("circular-runout") && !hole.includes("concentricity"));
  assert.deepEqual(workflow.availableControls("hole", 0).map((control) => control.id),
    ["straightness", "circularity", "cylindricity", "profile-line", "profile-surface"]);
  assert.ok(!workflow.availableControls("slot", 0).some((control) => ["position", "perpendicularity"].includes(control.id)));
  assert.throws(() => workflow.selection("hole", 0, "position", 0.4), RangeError);
  assert.throws(() => workflow.availableControls("unknown", 3), RangeError);
});

test("datum references and tolerance-zone geometry follow the selected control", () => {
  const form = workflow.selection("hole", 3, "circularity", 0.4);
  assert.deepEqual(form.datumRefs, []);
  assert.equal(form.zone.kind, "annulus");
  assert.equal(form.zone.diameter, false);
  const axis = workflow.selection("hole", 1, "position", 0.4);
  assert.deepEqual(axis.datumRefs, ["A"]);
  assert.equal(axis.zone.kind, "axis-cylinder");
  assert.equal(axis.zone.diameter, true);
  assert.match(workflow.refNote(axis), /perpendicular to A.*X or Y/);
  assert.match(workflow.refNote(workflow.selection("hole", 2, "position", 0.4)), /4\.04 mm.*Y remains free/);
  assert.match(workflow.refNote(workflow.selection("hole", 3, "position", 0.4)), /4\.04 mm from B.*2\.04 mm from C/);
  assert.match(workflow.refNote(workflow.selection("slot", 3, "position", 0.4)), /2\.30 mm.*basic distance from C/);
  assert.deepEqual(workflow.positionFreedom(1), { x: true, y: true, label: "A only · axis ⟂ bottom A · X and Y free" });
  assert.deepEqual([workflow.positionFreedom(2).x, workflow.positionFreedom(2).y], [false, true]);
  assert.deepEqual([workflow.positionFreedom(3).x, workflow.positionFreedom(3).y], [false, false]);
  assert.deepEqual([workflow.positionFreedom(1, "slot").x, workflow.positionFreedom(1, "slot").y], [false, true]);
  assert.match(workflow.refNote(workflow.selection("slot", 1, "position", 0.4)), /lengthwise sliding does not change that ideal plane/);
  assert.deepEqual(workflow.selection("slot", 2, "position", 0.4).datumRefs, ["A", "B"]);
  assert.equal(workflow.selection("slot", 3, "position", 0.4).zone.kind, "parallel-planes");
  assert.equal(workflow.selection("slot", 3, "profile-line", 0.4).zone.kind, "slot-contour");
  assert.equal(workflow.selection("surface", 3, "profile-surface", 0.4).zone.kind, "profile-surface");
  assert.equal(workflow.selection("surface", 3, "flatness", 0.4).zone.kind, "parallel-planes");
  assert.deepEqual(workflow.selection("surface", 3, "flatness", 0.4).datumRefs, []);
  assert.deepEqual(workflow.selection("surface", 3, "parallelism", 0.4).datumRefs, ["A"]);
  assert.deepEqual(workflow.selection("hole", 3, "perpendicularity", 0.4).datumRefs, ["A"]);
  assert.match(workflow.refNote(workflow.selection("slot", 3, "position", 0.4)), /does not by itself control the slot's end geometry/);
  assert.throws(() => workflow.selection("surface", 3, "position", 0.4), RangeError);
  assert.throws(() => workflow.selection("hole", 3, "position", 0), RangeError);
});

test("stepped shaft runout is isolated to the upper step and uses lower journal datum D", () => {
  for (const datumCount of [0, 1, 2, 3]) {
    assert.deepEqual(workflow.availableControls("shaft", datumCount).map((control) => control.id),
      ["circular-runout", "total-runout"]);
  }
  const circular = workflow.selection("shaft", 0, "circular-runout", 0.04);
  const total = workflow.selection("shaft", 3, "total-runout", 0.04);
  assert.deepEqual(circular.datumRefs, ["D"]);
  assert.deepEqual(total.datumRefs, ["D"]);
  assert.equal(circular.zone.kind, "runout-section");
  assert.equal(total.zone.kind, "runout-full");
  assert.equal(circular.zone.diameter, false);
  assert.equal(total.zone.diameter, false);
  assert.match(workflow.explanation(circular), /Each height is evaluated independently/);
  assert.match(workflow.explanation(total), /one common zone/);
  assert.match(workflow.refNote(circular), /radial.*no diameter symbol or MMC bonus/);
  assert.ok(Object.values(workflow.allowedZoneMotion(total)).every((allowed) => !allowed));
  assert.throws(() => workflow.selection("shaft", 0, "circular-runout", 0.40), RangeError);
  assert.throws(() => workflow.selection("hole", 3, "total-runout", 0.04), RangeError);

  const viewer = read("cad-modules", "cad-workflow", "mbd-three.js");
  assert.match(viewer, /function addShaftDatum\(/);
  assert.match(viewer, /kind === "runout-section"/);
  assert.match(viewer, /new T\.RingGeometry\(inner, outer, 64\)/);
  assert.match(viewer, /new T\.CylinderGeometry\(radius, radius, SHAFT\.upperH/);
});

test("the Three.js zone changes size and shows datum-dependent freedoms", () => {
  const viewer = read("cad-modules", "cad-workflow", "mbd-three.js");
  assert.match(viewer, /0\.06 \+ width \* 0\.22/);
  assert.match(viewer, /t \* 0\.23/);
  assert.doesNotMatch(viewer, /ghost cylinders|mobilityCount/);
  assert.match(viewer, /bottomView/);
  assert.match(viewer, /const boreWall = new T\.MeshBasicMaterial/);
  assert.match(viewer, /PlaneGeometry\(7\.2, 4\.8\)/);
  assert.match(viewer, /tag\.position\.set\(-1\.3, -2\.18, BOTTOM - 0\.02\)/);
  assert.match(viewer, /PlaneGeometry\(TOP - BOTTOM \+ 0\.44, 4\.04\)/);
  assert.match(viewer, /PlaneGeometry\(6\.44, TOP - BOTTOM \+ 0\.44\)/);
  assert.match(viewer, /metalness: 0, roughness: 0\.98/);
  assert.match(viewer, /zone: 0xf32438/);
  assert.match(viewer, /datum: 0x6aaeff/);
  assert.match(viewer, /RingGeometry\(HOLE\.r, HOLE\.r \+ 0\.25/);
  assert.match(viewer, /if \(!active\) \{ planeGeometry\.dispose\(\); return; \}/);
  assert.match(viewer, /addBasicDimensions\(state\)/);
});

test("datum-dependent sliders expose only meaningful free zone motion", () => {
  const active = (feature, datumCount, control) => Object.entries(workflow.allowedZoneMotion(
    workflow.selection(feature, datumCount, control, 0.4))).filter(([, allowed]) => allowed).map(([axis]) => axis);
  assert.deepEqual(active("hole", 0, "straightness"), ["tx", "ty", "rx", "ry"]);
  assert.deepEqual(active("hole", 0, "circularity"), ["tx", "ty"]);
  assert.deepEqual(active("hole", 0, "cylindricity"), ["tx", "ty", "rx", "ry"]);
  assert.deepEqual(active("hole", 1, "position"), ["tx", "ty"]);
  assert.deepEqual(active("hole", 2, "position"), ["ty"]);
  assert.deepEqual(active("hole", 3, "position"), []);
  assert.deepEqual(active("hole", 3, "perpendicularity"), ["tx", "ty"]);
  assert.deepEqual(active("slot", 0, "straightness"), ["ty", "rz"]);
  assert.deepEqual(active("slot", 0, "flatness"), ["ty", "rx", "rz"]);
  assert.deepEqual(active("slot", 1, "perpendicularity"), ["ty", "rz"]);
  assert.deepEqual(active("slot", 1, "position"), ["ty", "rz"]);
  assert.deepEqual(active("slot", 2, "position"), ["ty"]);
  assert.deepEqual(active("slot", 3, "position"), []);
  assert.deepEqual(active("slot", 0, "profile-surface"), ["tx", "ty", "tz", "rx", "ry", "rz"]);
  assert.deepEqual(active("slot", 1, "profile-surface"), ["tx", "ty", "rz"]);
  assert.deepEqual(active("slot", 2, "profile-surface"), ["ty"]);
  assert.deepEqual(active("surface", 0, "flatness"), ["tz", "rx", "ry"]);
  assert.deepEqual(active("surface", 3, "parallelism"), ["tz"]);
  assert.deepEqual(active("surface", 0, "profile-surface"), ["tz", "rx", "ry"]);
  assert.deepEqual(active("surface", 1, "profile-surface"), []);
  const viewer = read("cad-modules", "cad-workflow", "mbd-three.js");
  assert.match(viewer, /function rectangularFrame\(/);
  assert.match(viewer, /rectangularFrame\(T, edgePoints, zoneLine/);
  assert.match(viewer, /zoneContent\.position\.copy\(zonePivot\)/);
  assert.match(viewer, /function setMotion\(motion\)/);
});

test("slot profile explicitly selects the rounded ends while median-plane position does not", () => {
  const slotProfile = workflow.selection("slot", 3, "profile-surface", 0.4);
  const slotPosition = workflow.selection("slot", 3, "position", 0.4);
  assert.match(workflow.targetFor(slotProfile), /complete slot boundary, including rounded ends/);
  assert.match(workflow.explanation(slotProfile), /complete slot boundary, including its rounded ends/);
  assert.match(workflow.refNote(slotProfile), /differs from slot position/);
  assert.match(workflow.refNote(slotPosition), /does not by itself control the slot's end geometry/);
  const lab = read("cad-modules", "cad-workflow", "mbd-lab.js");
  assert.match(lab, /red zone is schematic: spacing and finite extent are exaggerated, not a conformance or inspection check/);
});

test("workflow cards use readable theme colors and an accessible hover enlargement", () => {
  const page = read("cad-modules", "cad-workflow", "index.html");
  const css = read("assets", "css", "cad-professional.css");
  assert.match(page, /cad-professional\.css\?v=2/);
  assert.match(page, /<ol class="workflow-path">/);
  for (const color of ["blue-light", "lavender-light", "green-light", "coral-soft"]) {
    assert.match(css, new RegExp("--workflow-fill: var\\(--" + color + "\\)"));
  }
  assert.match(css, /\.workflow-path strong\s*\{[^}]*font-size: 1\.13rem/s);
  assert.match(css, /\.workflow-path span\s*\{[^}]*font-size: 1\.02rem/s);
  assert.match(css, /\.workflow-path li:hover\s*\{[^}]*scale\(1\.045\)/s);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("new modules are wired into the course sequence and interactive runtimes", () => {
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
  assert.ok(workflowPage.indexOf('id="material-condition-modifier"') < workflowPage.indexOf('id="rule-one-independency"'));
  assert.ok(workflowPage.indexOf('id="rule-one-independency"') < workflowPage.indexOf('id="release-and-revision"'));
  assert.ok(workflowPage.indexOf('id="release-and-revision"') < workflowPage.indexOf('id="exchange-validation"'));
  assert.ok(workflowPage.indexOf('id="exchange-validation"') < workflowPage.indexOf('id="digital-thread"'));
  assert.match(workflowPage, /data-gdt-fullscreen/);
  assert.match(workflowPage, /data-gdt-tolerance/);
  assert.match(workflowPage, /<label for="gdt-zoom">Zoom<\/label>/);
  assert.match(workflowPage, /data-gdt-zoom type="range"/);
  assert.match(workflowPage, /data-gdt-zoom-output/);
  assert.equal((workflowPage.match(/type="range"/g) || []).length, 9);
  assert.match(workflowPage, /<select id="gdt-datums" data-gdt-datums>/);
  assert.match(workflowPage, /<option value="0">No datum<\/option>/);
  assert.match(workflowPage, /value="shaft"/);
  assert.match(workflowPage, /data-gdt-station/);
  assert.match(workflowPage, /id="material-condition-modifier"/);
  assert.match(workflowPage, /data-mmc-lab/);
  assert.match(workflowPage, /mbd-mmc\.js/);
  assert.match(workflowPage, /data-rule1-lab/);
  assert.match(workflowPage, /mbd-rule1\.css/);
  assert.match(workflowPage, /mbd-rule1\.js/);
  for (const axis of ["tx", "ty", "tz", "rx", "ry", "rz"]) assert.match(workflowPage, new RegExp(`data-gdt-motion="${axis}"`));
  assert.doesNotMatch(workflowPage, /data-offset-x|data-workflow-next|data-gdt-diagram/);
  assert.ok(workflowPage.indexOf("assets/vendor/three.min.js") < workflowPage.indexOf("mbd-three.js"));
  assert.ok(workflowPage.indexOf("mbd-three.js") < workflowPage.indexOf("mbd-lab.js"));
  assert.ok(workflowPage.indexOf("assets/vendor/three.min.js") < workflowPage.indexOf("mbd-rule1.js"));
  assert.match(workflowPage, /data-gdt-viewer/);

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
