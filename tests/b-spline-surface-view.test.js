const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const THREE = require("../assets/vendor/three.min.js");
const SurfaceMath = require("../programming-modules/b-spline-surfaces/surface-math.js");
const source = fs.readFileSync(require.resolve("../programming-modules/b-spline-surfaces/surface-three.js"), "utf8");

function harness() {
  let scene, camera, renders = 0, resize, selected = -1, mode;
  const events = {};
  const canvas = {
    clientWidth: 600, clientHeight: 600,
    addEventListener(name, callback) { events[name] = callback; },
    focus() {}, setPointerCapture() {}, hasPointerCapture() { return false; },
    getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
    toBlob(callback, type) { this.capturedAt = renders; callback(new Blob(["png fixture"], { type })); }
  };
  class Renderer {
    setPixelRatio() {} setSize() {} dispose() {}
    render(nextScene, nextCamera) {
      scene = nextScene; camera = nextCamera; renders++;
      scene.updateMatrixWorld(); camera.updateMatrixWorld();
    }
  }
  const context = {
    window: { THREE: { ...THREE, WebGLRenderer: Renderer }, devicePixelRatio: 1 }, SurfaceMath,
    document: { createElement() { return { getContext() { return { fillRect() {}, fillText() {} }; } }; } },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} }
  };
  vm.runInNewContext(source, context);
  const view = new context.window.SurfaceThree(canvas, { hidden: true }, index => { selected = index; }, value => { mode = value; });
  const options = { mode: "clamped", order: 4, points: true, axes: true, grid: true, net: true, labels: true, wireframe: false };
  view.update(SurfaceMath.squareGrid(), 0, options);
  return { view, canvas, options, resize, get scene() { return scene; }, get camera() { return camera; },
    get renders() { return renders; }, get selected() { return selected; }, get mode() { return mode; },
    fire(name, values = {}) { events[name]({ type: name, pointerId: 1, button: 0, preventDefault() {}, ...values }); } };
}

test("top and bottom use orthographic z views and retain zoom on portrait canvases", () => {
  const h = harness();
  for (const mode of ["top", "bottom"]) {
    h.view.setView(mode);
    assert.ok(h.camera.isOrthographicCamera);
    const direction = h.camera.getWorldDirection(new THREE.Vector3());
    assert.ok(direction.distanceTo(new THREE.Vector3(0, 0, mode === "top" ? -1 : 1)) < 1e-12);
    const low = new THREE.Vector3(3, 4, -4).project(h.camera), high = new THREE.Vector3(3, 4, 4).project(h.camera);
    assert.ok(Math.abs(low.x - high.x) < 1e-12 && Math.abs(low.y - high.y) < 1e-12);
    const extent = h.camera.right - h.camera.left;
    h.view.zoom(.8); assert.ok(h.camera.right - h.camera.left < extent);
    h.view.reset();
  }
  h.canvas.clientWidth = 300; h.canvas.clientHeight = 600; h.resize(); h.view.setView("top");
  for (const x of [0, 10]) for (const y of [0, 10]) {
    const p = new THREE.Vector3(x, y, 0).project(h.camera);
    assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1);
  }
  h.fire("keydown", { key: "ArrowRight" });
  assert.ok(h.camera.isPerspectiveCamera); assert.equal(h.mode, "perspective");
  h.view.dispose();
});

test("hidden points and axes disappear and hidden points cannot be selected", () => {
  const h = harness(); h.view.setView("top");
  h.view.update(SurfaceMath.squareGrid(), 0, { ...h.options, points: false, axes: false, grid: false, net: false });
  const meshes = [], sprites = [], grids = [];
  h.scene.traverseVisible(object => { if (object.isMesh) meshes.push(object); if (object.isSprite) sprites.push(object); if (object.type === "GridHelper") grids.push(object); });
  assert.equal(meshes.length, 1); assert.equal(sprites.length, 0); assert.equal(grids.length, 0);
  const point = new THREE.Vector3(2, 2, 0).project(h.camera);
  const coords = { clientX: (point.x + 1) * 300, clientY: (1 - point.y) * 300 };
  h.fire("pointerdown", coords); h.fire("pointerup", coords); assert.equal(h.selected, -1);
  h.view.update(SurfaceMath.squareGrid(), 0, h.options);
  h.scene.traverseVisible(object => { if (object.type === "GridHelper") grids.push(object); });
  assert.equal(grids.length, 1);
  h.fire("pointerdown", coords); h.fire("pointerup", coords); assert.equal(h.selected, 0);
  h.view.dispose();
});

test("PNG export renders a fresh frame and recovers after graphics context restoration", async () => {
  const h = harness(); h.view.setView("bottom");
  const before = h.renders, blob = await h.view.pngBlob();
  assert.equal(blob.type, "image/png"); assert.equal(h.canvas.capturedAt, before + 1);
  h.fire("webglcontextlost"); assert.equal(h.view.available, false);
  await assert.rejects(h.view.pngBlob(), /unavailable/);
  h.fire("webglcontextrestored"); assert.equal(h.view.available, true);
  assert.equal((await h.view.pngBlob()).type, "image/png");
  h.canvas.toBlob = callback => callback(null);
  await assert.rejects(h.view.pngBlob(), /could not be created/);
  h.view.dispose();
});
