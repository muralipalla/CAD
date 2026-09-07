const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const THREE = require("../assets/vendor/three.min.js");
const M = require("../programming-modules/rational-bezier-curves/rational-math.js");
const source = fs.readFileSync(require.resolve("../programming-modules/rational-bezier-curves/rational-three.js"), "utf8");
function harness() {
  const events = {};
  let scene, camera;
  const canvas = { clientWidth: 250, clientHeight: 368,
    addEventListener(name, callback) { events[name] = callback; },
    focus() {}, setPointerCapture() {}, hasPointerCapture() { return false; } };
  class Renderer {
    setPixelRatio() {} setSize() {} dispose() {}
    render(s, c) { scene = s; camera = c; scene.updateMatrixWorld(); camera.updateMatrixWorld(); }
  }
  const context = { window: { THREE: { ...THREE, WebGLRenderer: Renderer }, RationalBezierMath: M, devicePixelRatio: 1 },
    document: { createElement() { return { getContext() { return { fillRect() {}, fillText() {} }; } }; } },
    ResizeObserver: class { observe() {} disconnect() {} } };
  vm.runInNewContext(source, context);
  const view = context.window.RationalBezierThree(canvas, { hidden: true });
  view.update(M.construction(3, 75), 0.5);
  return { view, canvas, get camera() { return camera; }, get scene() { return scene; },
    fire(name, args = {}) { let prevented = false; events[name]({ preventDefault() { prevented = true; }, ...args }); return prevented; } };
}
test("w-axis view is exact and maximum-angle controls and labels fit narrow canvases", () => {
  const h = harness(); h.view.setView("top");
  assert.ok(h.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,0,-1)) < 1e-12);
  for (const width of [250, 600, 1100]) {
    h.canvas.clientWidth = width;
    h.view.update(M.construction(3, 75), 0.3);
    for (const p of M.construction(3, 75).projected) {
      const screen = new THREE.Vector3(...p).project(h.camera);
      assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1);
    }
    h.scene.traverseVisible(object => {
      if (!object.isSprite) return;
      const screen = object.position.clone().project(h.camera);
      assert.ok(Math.abs(screen.x) + object.scale.x / (h.camera.right - h.camera.left) <= 1 + 1e-12);
      assert.ok(Math.abs(screen.y) + object.scale.y / (h.camera.top - h.camera.bottom) <= 1 + 1e-12);
    });
  }
  h.view.dispose();
});
test("visibility choices persist through parameter and construction changes", () => {
  const h = harness();
  for (const layer of ["controls", "rays", "axes", "cone", "plane"]) h.view.setLayer(layer, false);
  h.view.updateParameter(0.7); h.view.update(M.construction(0.5, 10), 0.2);
  for (const layer of ["controls", "rays", "axes", "cone", "plane"]) assert.equal(h.scene.getObjectByName(layer).visible, false);
  assert.equal(h.scene.getObjectByName("moving").children[0].visible, false);
  assert.ok(h.scene.getObjectByName("base").visible);
  h.view.dispose();
});
test("camera interactions preserve modified browser shortcuts", () => {
  const h = harness(); const before = h.camera.right;
  assert.equal(h.fire("keydown", { key: "+", ctrlKey: true }), false);
  assert.equal(h.fire("wheel", { deltaY: 150, ctrlKey: true }), false);
  assert.equal(h.camera.right, before);
  assert.equal(h.fire("keydown", { key: "+" }), true);
  assert.ok(h.camera.right < before);
  h.view.dispose();
});
