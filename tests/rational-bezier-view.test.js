const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const THREE = require("../assets/vendor/three.min.js");
const M = require("../programming-modules/rational-bezier-curves/rational-math.js");
const source = fs.readFileSync(require.resolve("../programming-modules/rational-bezier-curves/rational-three.js"), "utf8");
function harness() {
  const events = {}, captures = new Set();
  let scene, camera;
  const canvas = { clientWidth: 250, clientHeight: 368,
    addEventListener(name, callback) { events[name] = callback; },
    focus() {}, setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); events.lostpointercapture({pointerId:id}); } };
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
    fire(name, args = {}) { let prevented = false; events[name]({ button:0, pointerId:1, preventDefault() { prevented = true; }, ...args }); return prevented; } };
}
test("y-axis view is exact and circle framing stays fixed as controls leave the frame", () => {
  const h = harness(); h.view.setView("y");
  assert.ok(h.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,1,0)) < 1e-12);
  const p1 = new THREE.Vector3(1,2,1).project(h.camera), p2 = new THREE.Vector3(1,-2,1).project(h.camera);
  assert.ok(Math.abs(p1.x-p2.x)+Math.abs(p1.y-p2.y) < 1e-12);
  for (const width of [250, 600, 1100]) {
    h.canvas.clientWidth = width;
    h.view.update(M.construction(3,0), 0.5);
    const extent = h.camera.right, position = h.camera.position.clone();
    for (const angle of [0,60,89,90,91,120,179,180]) {
      h.view.update(M.construction(3,angle),0.5);
      assert.equal(h.camera.right, extent); assert.ok(h.camera.position.equals(position));
      for (const p of [[3,0,1],[-3,0,1],[0,3,1],[0,-3,1]]) {
        const screen = new THREE.Vector3(...p).project(h.camera);
        assert.ok(Math.abs(screen.x)<1 && Math.abs(screen.y)<1);
      }
    }
    const outside = new THREE.Vector3(...M.construction(3,89).projected[1]).project(h.camera);
    assert.ok(Math.abs(outside.x)>1);
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
test("wheel and trackpad pinch zoom the canvas while keyboard page zoom is preserved", () => {
  const h = harness(); const before = h.camera.right;
  assert.equal(h.fire("keydown", { key: "+", ctrlKey: true }), false);
  assert.equal(h.fire("keydown", { key: "+", metaKey: true }), false);
  assert.equal(h.camera.right, before);
  assert.equal(h.fire("wheel", { deltaY: -25, ctrlKey: true }), true);
  assert.ok(h.camera.right < before);
  assert.equal(h.fire("keydown", { key: "+" }), true);
  assert.ok(h.camera.right < before);
  h.view.dispose();
});

test("point labels start hidden and remain switchable across singular angles", () => {
  const h = harness();
  const count = () => { let n=0; h.scene.traverseVisible(o => { if(o.userData.pointLabel) n++; }); return n; };
  assert.equal(count(),0); h.view.setLabels(true); assert.ok(count()>0);
  for(const angle of [0,90,120,180]) { h.view.update(M.construction(2,angle),0.5); assert.ok(count()>0); }
  h.view.setLabels(false); h.view.updateParameter(0.6); assert.equal(count(),0);
  assert.equal(h.scene.background.getHex(),0x171541);
  h.view.dispose();
});

test("two-finger pinch zooms without orbit and resumes one finger after either release", () => {
  for(const released of [1,2]) {
    const h=harness();
    const touch=(name,id,x,y=100) => h.fire(name,{pointerId:id,pointerType:"touch",clientX:x,clientY:y});
    touch("pointerdown",1,100); touch("pointerdown",2,200);
    const before=h.camera.right, direction=h.camera.getWorldDirection(new THREE.Vector3());
    touch("pointermove",2,250);
    assert.ok(Math.abs(h.camera.right/before-100/150)<1e-12);
    assert.ok(h.camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction)<1e-12);
    touch("pointerup",released,released===1?100:250);
    h.fire("lostpointercapture",{pointerId:released});
    touch("pointermove",released===1?2:1,released===1?255:105);
    const changed=h.camera.getWorldDirection(new THREE.Vector3()).distanceTo(direction);
    assert.ok(changed>0 && changed<0.06);
    h.view.dispose();
  }
});

test("third touches, cancellations and reversal at the zoom limit do not jump", () => {
  const h=harness();
  const touch=(name,id,x) => h.fire(name,{pointerId:id,pointerType:"touch",clientX:x,clientY:100});
  touch("pointerdown",1,100); touch("pointerdown",2,200);
  const before=h.camera.right;
  touch("pointerdown",3,300); touch("pointermove",3,500); assert.equal(h.camera.right,before);
  touch("pointermove",2,10100); const maximum=h.camera.right;
  touch("pointermove",2,5100); assert.ok(h.camera.right>maximum);
  touch("pointercancel",1,100); const rebased=h.camera.right;
  touch("pointermove",2,5100); assert.equal(h.camera.right,rebased);
  touch("pointercancel",3,500); touch("pointermove",2,5105);
  assert.ok(h.camera.position.toArray().every(Number.isFinite));
  h.view.dispose();
});
