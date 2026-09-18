const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const math = require("../cad-modules/surfaces/surface-geometry-math.js");

const root = path.resolve(__dirname, "..");
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const vectorClose = (actual, expected, tolerance = 1e-9) => actual.forEach((value, index) => close(value, expected[index], tolerance));
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

test("torus points satisfy the standard implicit tube equation", () => {
  const R = 2.4, r = 0.9;
  for (const u of [0, 0.13, 0.5, 0.82, 1]) for (const v of [0, 0.17, 0.25, 0.5, 0.75, 1]) {
    const point = math.torusPoint(u, v, R, r);
    close((Math.hypot(point[0], point[1]) - R) ** 2 + point[2] ** 2, r ** 2);
  }
});

test("torus derivatives and normal agree with finite differences", () => {
  const h = 1e-6;
  for (const [u, v] of [[0.11, 0.08], [0.36, 0.27], [0.69, 0.52], [0.81, 0.74]]) {
    const data = math.torusGeometry(u, v);
    const beforeU = math.torusPoint(u - h, v), afterU = math.torusPoint(u + h, v);
    const beforeV = math.torusPoint(u, v - h), afterV = math.torusPoint(u, v + h);
    vectorClose(data.ru, afterU.map((value, index) => (value - beforeU[index]) / (2 * h)), 2e-8);
    vectorClose(data.rv, afterV.map((value, index) => (value - beforeV[index]) / (2 * h)), 2e-8);
    close(math.norm(data.normal), 1); close(dot(data.normal, data.ru), 0); close(dot(data.normal, data.rv), 0);
    const cross = math.unit(math.cross(data.ru, data.rv)); vectorClose(data.normal, cross);
  }
});

test("Gaussian curvature is positive outside, zero on top and bottom, and negative inside", () => {
  const outside = math.torusGeometry(0.2, 0), top = math.torusGeometry(0.2, 0.25);
  const inside = math.torusGeometry(0.2, 0.5), bottom = math.torusGeometry(0.2, 0.75);
  assert.equal(outside.classification, "positive"); assert.ok(outside.gaussian > 0);
  assert.equal(top.classification, "zero"); close(top.gaussian, 0);
  assert.equal(inside.classification, "negative"); assert.ok(inside.gaussian < 0);
  assert.equal(bottom.classification, "zero"); close(bottom.gaussian, 0);
  close(outside.gaussian, 1 / (0.9 * (2.4 + 0.9)));
  close(inside.gaussian, -1 / (0.9 * (2.4 - 0.9)));
});

test("sphere-plane intersection decomposes circle curvature into normal and geodesic components", () => {
  for (const angle of [0, 18, 35, 63, 85]) {
    const data = math.spherePlaneCurvature(angle);
    close(math.norm(data.point), data.radius);
    close(dot(data.planeNormal, data.point), data.planeConstant);
    close(math.norm(data.center.map((value, index) => data.point[index] - value)), data.circleRadius);
    vectorClose(data.curvature, data.normalCurvature.map((value, index) => value + data.geodesicCurvature[index]));
    close(dot(data.geodesicCurvature, data.sphereNormal), 0);
    close(data.normalCurvatureMagnitude, 1 / data.radius);
    close(data.curvatureMagnitude, 1 / data.circleRadius);
    close(dot(data.tangentAxis, data.planeNormal), 0);
    close(dot(data.tangentAxis, data.point.map((value, index) => value - data.center[index])), 0);
  }
  const greatCircle = math.spherePlaneCurvature(0), nearTangent = math.spherePlaneCurvature(85);
  assert.equal(greatCircle.circleType, "great"); close(greatCircle.geodesicCurvatureMagnitude, 0);
  close(greatCircle.circleRadius, greatCircle.radius); vectorClose(greatCircle.center, [0, 0, 0]);
  assert.equal(nearTangent.circleType, "small");
  assert.ok(nearTangent.circleRadius > 0 && nearTangent.circleRadius < 0.1 * nearTangent.radius);
});

test("Gauss-map normals are unit and orthogonal to the paraboloid tangents", () => {
  for (const surfaceType of Object.keys(math.GAUSS_SURFACE_TYPES)) for (const u of [0.08, 0.31, 0.5, 0.88]) for (const v of [0.12, 0.47, 0.76, 0.92]) {
    const data = math.gaussSurfaceDerivatives(u, v, surfaceType);
    close(math.norm(data.normal), 1); close(dot(data.normal, data.ru), 0); close(dot(data.normal, data.rv), 0);
    vectorClose(data.normal, math.unit(math.cross(data.ru, data.rv)));
  }
});

test("Gauss-map area control reaches the entire domain and preserves requested area", () => {
  assert.deepEqual(math.gaussPatchDomain(0.68, 0.34, 1), { uMin: 0, uMax: 1, vMin: 0, vMax: 1, areaFraction: 1 });
  const local = math.gaussPatchDomain(0.68, 0.34, 0.25);
  close((local.uMax - local.uMin) * (local.vMax - local.vMin), 0.25);
  close(local.uMin, 0.43); close(local.uMax, 0.93); close(local.vMin, 0.09); close(local.vMax, 0.59);
  const edge = math.gaussPatchDomain(0.98, 0.02, 0.16);
  close(edge.uMax, 1); close(edge.vMin, 0);
});

test("curvature colors remain finite and emphasize the zero-curvature circles", () => {
  for (let index = 0; index <= 100; index++) {
    const color = math.torusCurvatureColor(index / 100);
    assert.equal(color.length, 3); color.forEach(value => assert.ok(Number.isFinite(value) && value >= 0 && value <= 1));
  }
  vectorClose(math.torusCurvatureColor(0.25), [1, 0.72, 0.04], 1e-7);
  vectorClose(math.torusCurvatureColor(0.75), [1, 0.72, 0.04], 1e-7);
});

test("the Surfaces page uses all three Three.js graphics and no longer embeds the static Gauss-map image", () => {
  const page = fs.readFileSync(path.join(root, "cad-modules", "surfaces", "index.html"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "cad-modules", "surfaces", "surface-geometry-three.js"), "utf8");
  assert.match(page, /assets\/vendor\/three\.min\.js/);
  assert.match(page, /data-sphere-curvature-canvas/); assert.match(page, /data-gauss-map-canvas/); assert.match(page, /data-torus-curvature-canvas/);
  assert.match(page, /id="curve-curvature-decomposition"/); assert.match(page, /id="sphere-plane-angle"/);
  assert.match(page, /id="sphere-plane-angle"[^>]+max="85"[^>]+value="45"/);
  assert.match(page, /data-zoom-out-sphere/); assert.match(page, /data-zoom-in-sphere/);
  assert.match(page, /κ total curvature/); assert.match(page, /κ<sub>n<\/sub> normal/); assert.match(page, /κ<sub>g<\/sub> geodesic/);
  assert.match(page, /mapped normal area on S²/); assert.match(page, /id="gauss-area"/); assert.match(page, /id="gauss-surface"/);
  assert.match(page, /id="interactive-torus-curvature"/);
  assert.doesNotMatch(page, /GaussMap2\.png/);
  assert.match(renderer, /opacity: 0\.46, depthWrite: false/);
  assert.match(renderer, /thickArrow\(sphereCenter, data\.normal, sphereRadius, 0xffdf2b\)/);
  assert.match(renderer, /window\.SphereCurveCurvatureThree/);
  assert.match(renderer, /const arcHalfSpan = Math\.PI \/ 3/);
  assert.match(renderer, /new T\.TubeGeometry\(arcPath, 128, 0\.027/);
  assert.match(renderer, /const fullCircle = line\(fullCirclePoints, 0x8fc3df/);
  assert.match(renderer, /const vectorScale = data\.singular \? 0 : data\.radius \* data\.radius \/ 4/);
  assert.doesNotMatch(renderer, /1\.8 \/ data\.curvatureMagnitude/);
  assert.match(renderer, /zoomOut\(\) \{ zoom\(1\.22\); \}/);
  assert.match(renderer, /\[\[0, 0, 0\], data\.point\]/); assert.match(renderer, /\[data\.center, data\.point\]/);
  assert.match(renderer, /data\.curvature, 0xff725e/); assert.match(renderer, /data\.normalCurvature, 0x59d9ff/); assert.match(renderer, /data\.geodesicCurvature, 0xb9f35b/);
  for (const asset of ["surface-geometry.css", "surface-geometry-math.js", "surface-geometry-three.js", "surface-geometry-app.js"]) {
    assert.equal(fs.existsSync(path.join(root, "cad-modules", "surfaces", asset)), true, `missing ${asset}`);
  }
});

test("invalid surface parameters and radii are rejected", () => {
  assert.throws(() => math.torusPoint(-0.1, 0.2), RangeError);
  assert.throws(() => math.torusGeometry(0.2, 1.1), RangeError);
  assert.throws(() => math.torusPoint(0.2, 0.3, 1, 1), RangeError);
  assert.throws(() => math.gaussSurfacePoint(Number.NaN, 0.4), RangeError);
  assert.throws(() => math.gaussSurfacePoint(0.2, 0.4, "unknown"), RangeError);
  assert.throws(() => math.gaussPatchDomain(0.2, 0.4, 0), RangeError);
  assert.throws(() => math.spherePlaneCurvature(-1), RangeError);
  assert.throws(() => math.spherePlaneCurvature(86), RangeError);
  assert.throws(() => math.spherePlaneCurvature(30, 0), RangeError);
});
