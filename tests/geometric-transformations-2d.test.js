const assert = require("node:assert/strict");
const test = require("node:test");
const M = require("../cad-modules/geometric-transformations/transform-2d-math.js");
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const nearPoint = (actual, expected) => expected.forEach((value, index) => near(actual[index], value));
const nearMatrix = (actual, expected) => expected.forEach((value, index) => near(actual[index], value));

test("identity and presets return independent valid matrices", () => {
  const a = M.identity(), b = M.identity();
  assert.deepEqual(a, [1,0,0,0,1,0,0,0,1]); assert.notEqual(a, b);
  a[0] = 9; assert.equal(b[0], 1);
  for (const name of Object.keys(M.PRESETS)) {
    const matrix = M.preset(name); assert.equal(matrix.length, 9); assert.ok(matrix.every(Number.isFinite));
    assert.notEqual(matrix, M.PRESETS[name].matrix);
  }
  assert.throws(() => M.preset("unknown"), RangeError);
});

test("affine presets transform known points using column vectors", () => {
  nearPoint(M.transformPoint([1,0,3,0,1,-2,0,0,1], [2,5]), [5,3]);
  nearPoint(M.transformPoint([2,0,0,0,.5,0,0,0,1], [3,-4]), [6,-2]);
  nearPoint(M.transformPoint([1,1.5,0,-.25,1,0,0,0,1], [2,4]), [8,3.5]);
  nearPoint(M.transformPoint(M.preset("rotate30"), [1,0]), [Math.sqrt(3)/2,.5]);
  nearPoint(M.transformPoint(M.preset("reflectX"), [2,3]), [2,-3]);
  nearPoint(M.transformPoint(M.preset("reflectY"), [2,3]), [-2,3]);
  nearPoint(M.transformPoint(M.preset("reflectDiagonal"), [2,3]), [3,2]);
});

test("matrix multiplication preserves rightmost-first composition", () => {
  const translate = [1,0,3,0,1,-2,0,0,1], rotate = [0,-1,0,1,0,0,0,0,1], point = [2,1];
  const composed = M.transformPoint(M.multiply(translate, rotate), point);
  const sequential = M.transformPoint(translate, M.transformPoint(rotate, point));
  nearPoint(composed, sequential); nearPoint(composed, [2,0]);
});

test("rotation and scaling can be conjugated about an arbitrary point", () => {
  assert.deepEqual(M.rotation(90), [0,-1,0,1,0,0,0,0,1]);
  assert.notEqual(M.rotation(1e-8)[3], 0);
  nearPoint(M.transformPoint(M.rotation(90), [1,0]), [0,1]);
  const center = [2,-1], rotated = M.aboutPoint(M.rotation(90), center), scaled = M.aboutPoint(M.scaling(2,.5), center);
  nearPoint(M.transformPoint(rotated, center), center); nearPoint(M.transformPoint(rotated, [3,-1]), [2,0]);
  nearPoint(M.transformPoint(scaled, center), center); nearPoint(M.transformPoint(scaled, [3,1]), [4,0]);
  const explicit = M.multiply(M.translation(2,-1), M.multiply(M.rotation(90), M.translation(-2,1)));
  explicit.forEach((value, index) => near(rotated[index], value));
  [0,-1,3,1,0,-1,0,0,1].forEach((value, index) => near(M.aboutPoint(M.rotation(90), [2,1])[index], value));
  assert.deepEqual(M.aboutPoint(M.scaling(2,.5), [2,-1]), [2,0,-2,0,.5,-.5,0,0,1]);
  const translated = M.aboutPoint(M.translation(3,-2), center);
  nearMatrix(translated, M.translation(3,-2)); nearPoint(M.transformPoint(translated, center), [5,-3]);
  const arbitrary = [3,-4];
  M.aboutPoint(M.rotation(0), arbitrary).forEach((value, index) => near(value, M.identity()[index]));
  assert.deepEqual(M.aboutPoint(M.scaling(1,1), arbitrary), M.identity());
  assert.equal(M.classify(M.scaling(-2,3)).orientation, "reversed"); assert.equal(M.determinant(M.scaling(-2,3)), -6);
  assert.equal(M.classify(M.scaling(0,1)).singular, true);
  nearPoint(M.transformPoint(M.rotation(1e308), [1,0]), M.transformPoint(M.rotation(1e308 % 360), [1,0]));
});

test("reference-frame stages accumulate operators in physical application order", () => {
  const base = M.rotation(90), center = [2,1];
  const pointStages = M.aboutPointStages(base, center);
  assert.equal(pointStages.operators.length, 3); assert.equal(pointStages.states.length, 4);
  nearMatrix(pointStages.states[1], M.translation(-2,-1));
  nearMatrix(pointStages.states[2], M.multiply(base, M.translation(-2,-1)));
  nearMatrix(pointStages.states[3], M.aboutPoint(base, center));

  const lineStages = M.referenceFrameStages(M.preset("reflectX"), center, 45);
  assert.equal(lineStages.operators.length, 5); assert.equal(lineStages.states.length, 6);
  let cumulative = M.identity();
  lineStages.operators.forEach((operator, index) => {
    cumulative = M.multiply(operator, cumulative);
    nearMatrix(lineStages.states[index + 1], cumulative);
  });
  nearMatrix(lineStages.states.at(-1), M.aboutFrame(M.preset("reflectX"), center, 45));
  assert.notEqual(lineStages.operators[2], M.PRESETS.reflectX.matrix);
  nearMatrix(M.aboutFrame(base, center, 0), M.aboutPoint(base, center));
  assert.equal(M.referenceFrameStages(base, center, 0).states.length, 6);
});

test("reflecting in an arbitrary line uses translate, align, reflect and undo", () => {
  const diagonal = M.reflectionAboutLine([2,1], 45);
  nearMatrix(diagonal, [0,1,1,1,0,-1,0,0,1]);
  nearPoint(M.transformPoint(diagonal, [3,1]), [2,2]);
  nearPoint(M.transformPoint(diagonal, [3,2]), [3,2]);
  nearMatrix(M.multiply(diagonal, diagonal), M.identity());
  near(M.determinant(diagonal), -1);

  nearMatrix(M.reflectionAboutLine([0,3], 0), [1,0,0,0,-1,6,0,0,1]);
  nearMatrix(M.reflectionAboutLine([2,0], 90), [-1,0,4,0,1,0,0,0,1]);
  nearMatrix(M.reflectionAboutLine([2,1], 225), diagonal);
});

test("projective points divide by w and paths split at infinity", () => {
  const matrix = [1,0,0,0,1,0,.5,0,1];
  assert.deepEqual(M.homogeneous(matrix, [2,4]), [2,4,2]); nearPoint(M.transformPoint(matrix, [2,4]), [1,2]);
  assert.equal(M.transformPoint(matrix, [-2,4]), null);
  const paths = M.transformPath(matrix, [[-3,0],[-2.5,0],[-2,0],[-1.5,0],[-1,0]]);
  assert.equal(paths.length, 2); assert.ok(paths.every((path) => path.flat().every(Number.isFinite)));
});

test("classification reports affine, projective, reflected and singular matrices", () => {
  assert.deepEqual(M.classify(M.identity()), {kind:"affine",determinant:1,singular:false,orientation:"preserved"});
  assert.equal(M.classify(M.preset("projective")).kind, "projective");
  assert.equal(M.classify(M.preset("reflectX")).orientation, "reversed");
  const singular = M.classify([0,0,0,0,1,0,0,0,1]); assert.equal(singular.singular, true); assert.equal(singular.orientation, "collapsed");
});

test("homogeneous scale leaves points and classification unchanged", () => {
  const affine = [1.2,.15,2,-.25,.8,-1,0,0,1], point = [1.5,-2];
  const expectedPoint = M.transformPoint(affine, point), expectedInfo = M.classify(affine);
  for (const scale of [2,-3,1e-12]) {
    const scaled = affine.map((value) => value * scale), actualInfo = M.classify(scaled);
    nearPoint(M.transformPoint(scaled, point), expectedPoint);
    assert.equal(actualInfo.kind, expectedInfo.kind); assert.equal(actualInfo.singular, expectedInfo.singular);
    assert.equal(actualInfo.orientation, expectedInfo.orientation); near(actualInfo.determinant, expectedInfo.determinant);
  }
  const projective = [1,.2,3,-.3,.8,-2,.1,-.05,1], projected = M.transformPoint(projective, point), projectiveInfo = M.classify(projective);
  for (const scale of [4,-.25,1e-14]) {
    const scaled = projective.map((value) => value * scale), actualInfo = M.classify(scaled);
    nearPoint(M.transformPoint(scaled, point), projected);
    assert.equal(actualInfo.kind, "projective"); assert.equal(actualInfo.singular, projectiveInfo.singular);
    near(actualInfo.determinant, projectiveInfo.determinant);
  }
  const largeScale = [1e12,0,0,0,1e12,0,0,0,1], largeInfo = M.classify(largeScale);
  nearPoint(M.transformPoint(largeScale, [3,4]), [3e12,4e12]);
  assert.equal(largeInfo.kind, "affine"); assert.equal(largeInfo.singular, false); near(largeInfo.determinant, 1e24, 1e10);
});

test("grid and circle samplers are deterministic and geometrically correct", () => {
  const grid = M.makeGrid(3,.5,12); assert.equal(grid.length, 26); assert.ok(grid.every((line) => line.length === 13));
  const circle = M.sampleCurve("circle", 32)[0]; assert.equal(circle.length, 33); nearPoint(circle[0], circle.at(-1));
  assert.ok(M.sampleCurve("circle", 20)[0].flat().every(Number.isFinite));
});

test("manual viewport zoom has fixed centered scaling", () => {
  const normal = M.makeViewport(800, 600, 100), out = M.makeViewport(800, 600, 50), inside = M.makeViewport(800, 600, 200);
  assert.equal(normal.cx, 400); assert.equal(normal.cy, 300); assert.equal(normal.span, 4);
  near(out.scale, normal.scale / 2); near(out.span, normal.span * 2);
  near(inside.scale, normal.scale * 2); near(inside.span, normal.span / 2);
  const repeated = M.makeViewport(800, 600, 100); assert.deepEqual(repeated, normal);
});

test("invalid matrices, points and sampling requests fail clearly", () => {
  assert.throws(() => M.transformPoint([], [0,0]), RangeError);
  assert.throws(() => M.transformPoint(M.identity(), [NaN,0]), RangeError);
  assert.throws(() => M.makeGrid(-1), RangeError);
  assert.throws(() => M.sampleCurve("unknown"), RangeError);
  assert.throws(() => M.makeViewport(800, 600, 0), RangeError);
  assert.throws(() => M.rotation(NaN), RangeError);
  assert.throws(() => M.scaling(1, Infinity), RangeError);
  assert.throws(() => M.aboutPoint(M.identity(), [0]), RangeError);
  assert.throws(() => M.aboutFrame(M.identity(), [0,0], Infinity), RangeError);
  assert.throws(() => M.referenceFrameStages(M.identity(), [0,NaN], 30), RangeError);
  assert.throws(() => M.cumulativeMatrices([M.identity(), []]), RangeError);
});
