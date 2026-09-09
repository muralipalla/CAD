const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const math = require('../cad-modules/sweep-surface/sweep-math.js');
const { check } = require('../cad-modules/sweep-surface/sweep-intersections.js');

function mesh(points, faces, extra = {}) {
  return { positions: new Float32Array(points.flat()), indices: new Uint32Array(faces.flat()), ...extra };
}
function crossing(scale = 1, offset = [0, 0, 0]) {
  const points = [[-1, -1, 0], [1, -1, 0], [0, 1, 0], [0, -0.5, -1], [0, -0.5, 1], [0, 0.75, 0]];
  return mesh(points.map(p => p.map((value, axis) => value * scale + offset[axis])), [[0, 1, 2], [3, 4, 5]]);
}
async function clear(model) {
  const result = await check(model);
  assert.equal(result.complete, true);
  assert.equal(result.cancelled, false);
  assert.equal(result.pairCount, 0);
  assert.equal(result.degenerateCount, 0);
  assert.deepEqual(result.triangleIds, []);
  return result;
}

test('diagnostic exposes a classic browser-script API without requiring modules', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../cad-modules/sweep-surface/sweep-intersections.js'), 'utf8'), context);
  assert.equal(typeof context.SweepIntersections.check, 'function');
});

test('transversely crossing triangles return both original mesh triangle IDs', async () => {
  const result = await check(crossing());
  assert.equal(result.complete, true);
  assert.equal(result.pairCount, 1);
  assert.equal(result.testedPairs, 1);
  assert.deepEqual(result.triangleIds, [0, 1]);
});

test('normalization preserves transverse and coplanar detection across model scales', async () => {
  for (const scale of [0.000001, 1, 1000000]) {
    const result = await check(crossing(scale, [scale * 12, scale * -8, scale * 4]));
    assert.equal(result.pairCount, 1, 'scale ' + scale);
  }
  const points = [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0.5, 0.5, 0], [2.5, 0.5, 0], [0.5, 2.5, 0]];
  for (const scale of [0.000001, 1, 1000000]) {
    const result = await check(mesh(points.map(p => p.map(value => value * scale)), [[0, 1, 2], [3, 4, 5]]));
    assert.equal(result.pairCount, 1, 'coplanar scale ' + scale);
  }
});

test('coplanar positive-area overlap is detected regardless of winding', async () => {
  const points = [[0, 0, 0], [2, 0, 0], [0, 2, 0], [0.5, 0.5, 0], [2.5, 0.5, 0], [0.5, 2.5, 0]];
  for (const face of [[3, 4, 5], [5, 4, 3]]) {
    const result = await check(mesh(points, [[0, 1, 2], face]));
    assert.equal(result.pairCount, 1);
  }
});

test('edge-only coplanar contact and isolated point contacts are not positive-area intersections', async () => {
  await clear(mesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 1, 2], [3, 4, 5]]));
  await clear(mesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 0, 0], [2, 0, 1], [2, 1, 1]], [[0, 1, 2], [3, 4, 5]]));
});

test('shared topological vertices are excluded while nonlocal coincident vertices are not welded', async () => {
  await clear(mesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 1, 2], [0, 1, 3]]));
  const duplicated = mesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 1, 2], [3, 4, 5]]);
  assert.equal((await check(duplicated)).pairCount, 1);
});

test('ordinary cylinder, doubly periodic torus, and default helix have no sampled intersections', async () => {
  await clear(math.build({ pathSegments: 64, profileSegments: 32 }));
  await clear(math.build({ path: ['3*cos(2*pi*u)', '3*sin(2*pi*u)', '0'], scale: 0.7, pathSegments: 80, profileSegments: 32 }));
  const helix = math.build({ path: ['3*cos(3*pi*u)', '3*sin(3*pi*u)', '6*(u-0.5)'], scale: 0.7, pathSegments: 180, profileSegments: 80 });
  const result = await clear(helix);
  // 28,800 triangles would have over 400m unordered pairs without acceleration.
  assert.ok(result.testedPairs < 500000, 'BVH should keep the candidate set local');
});

test('twisted symmetric seams and a reversed Mobius-strip boundary are adjacent', async () => {
  await clear(math.build({ path: ['3*cos(2*pi*u)', '3*sin(2*pi*u)', '0'], twist: 180, scale: 0.5, pathSegments: 64, profileSegments: 24 }));
  await clear(math.build({ path: ['3*cos(2*pi*u)', '3*sin(2*pi*u)', '0'], profile: ['v-0.5', '0'], twist: 180, pathSegments: 64, profileSegments: 12 }));
});

test('extruding a figure-eight profile detects its nonlocal crossing even at repeated sample vertices', async () => {
  const result = await check(math.build({ profile: ['sin(2*pi*v)', 'sin(4*pi*v)'], pathSegments: 24, profileSegments: 32 }));
  assert.equal(result.complete, true);
  assert.ok(result.pairCount > 0);
  assert.ok(result.triangleIds.length > 0);
});

test('large taper detects self-overlap on a helix', async () => {
  const result = await check(math.build({ path: ['3*cos(3*pi*u)', '3*sin(3*pi*u)', '6*(u-0.5)'], scale: 1, taper: 5, pathSegments: 96, profileSegments: 40 }));
  assert.equal(result.complete, true);
  assert.ok(result.pairCount > 0);
});

test('degenerate triangles are counted and excluded without hiding valid crossings', async () => {
  const model = crossing();
  model.positions = new Float32Array([...model.positions, 0, 0, 0, 1, 0, 0, 2, 0, 0]);
  model.indices = new Uint32Array([...model.indices, 6, 7, 8]);
  const result = await check(model);
  assert.equal(result.complete, true);
  assert.equal(result.degenerateCount, 1);
  assert.equal(result.pairCount, 1);
  assert.deepEqual(result.triangleIds, [0, 1]);
  const flat = await check(math.build({ path: ['u', '0', '0'], profile: ['v', '0'], mode: 'translate', pathSegments: 8, profileSegments: 4 }));
  assert.equal(flat.degenerateCount, 64);
});

test('pair cap and asynchronous cancellation report an incomplete diagnostic', async () => {
  const limited = await check(crossing(), { maxPairs: 0 });
  assert.equal(limited.complete, false);
  assert.equal(limited.cancelled, false);
  assert.equal(limited.testedPairs, 0);
  let cancel = false, progressCalls = 0;
  const interrupted = await check(math.build({ pathSegments: 64, profileSegments: 24 }), {
    isCancelled: () => cancel,
    onProgress: () => { progressCalls++; setTimeout(() => { cancel = true; }, 0); }
  });
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.cancelled, true);
  assert.ok(progressCalls > 0);
});
