const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const math = require("../cad-modules/mobius-surface/mobius-math.js");

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`);
}

function vectorClose(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => close(value, expected[index], tolerance));
}

const dimensions = [{ length: 2, distance: 10 }, { length: 0.4, distance: 0.45 }, { length: 5, distance: 2.75 }, { length: 8, distance: 16 }];
const configurations = dimensions.flatMap(options => [0, 1, 2, 3].map(twists => ({ ...options, twists })));
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const matrixVector = (matrix, vector) => matrix.map(row => row.reduce((sum, value, i) => sum + value * vector[i], 0));
const translate = (point, distance) => [point[0] + distance, point[1], point[2]];
const rotateZ = v => [[Math.cos(v), -Math.sin(v), 0], [Math.sin(v), Math.cos(v), 0], [0, 0, 1]];
const rotateY = v => [[Math.cos(v), 0, Math.sin(v)], [0, 1, 0], [-Math.sin(v), 0, Math.cos(v)]];

test("the math API loads as a browser global and CommonJS module with legacy defaults", () => {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(__dirname, "../cad-modules/mobius-surface/mobius-math.js"), "utf8");
  vm.runInContext(source, context);
  assert.equal(math.RADIUS, 10);
  assert.equal(context.MobiusMath.RADIUS, 10);
  vectorClose(Array.from(context.MobiusMath.surface(0.5, 0)), [10, 0, 0]);
  vectorClose(math.stagePoint(1, 0, 0), [0, -1, 0]);
  vectorClose(math.stagePoint(2, 0, 0), [10, -1, 0]);
  vectorClose(math.derivatives(0.5, Math.PI / 2).normal, [0, -40, 0]);
  vectorClose(math.surface(0.3, 1.2), math.surface(0.3, 1.2, { length: 2, distance: 10, translation: 1, twists: 1 }));
  for (const u of [0, 0.3, 0.5, 1]) {
    for (const v of [0, 0.4, Math.PI / 2, Math.PI]) {
      const t = 2 * u - 1, q = 10 - t * Math.sin(v);
      vectorClose(math.surface(u, v), [q * Math.cos(2 * v), t * Math.cos(v), -q * Math.sin(2 * v)]);
    }
  }
});

test("the initial line and every final ruling preserve width L at all twist counts", () => {
  for (const options of configurations) {
    vectorClose(math.stagePoint(1, 0, 0, options), [0, -options.length / 2, 0]);
    vectorClose(math.stagePoint(1, 1, Math.PI, options), [0, options.length / 2, 0]);
    for (let i = 0; i <= 20; i++) {
      const v = i * Math.PI / 20;
      const a = math.surface(0, v, options), b = math.surface(1, v, options);
      close(math.norm(subtract(b, a)), options.length);
      vectorClose(math.surface(0.37, v, options), a.map((value, j) => value + 0.37 * (b[j] - value)));
    }
  }
});

test("stage 2 translates the intact line without rotating and interpolates from zero to d", () => {
  for (const options of configurations) {
    for (const u of [0, 0.3, 0.5, 1]) {
      const start = math.stagePoint(1, u, 0, options);
      for (const translation of [0, 0.2, 0.75, 1]) {
        const moving = { ...options, translation };
        for (const v of [0, Math.PI / 2, Math.PI]) {
          vectorClose(math.stagePoint(2, u, v, moving), translate(start, translation * options.distance));
          vectorClose(math.stagePoint(3, u, v, moving), math.stagePoint(3, u, v, options));
          vectorClose(math.surface(u, v, moving), math.surface(u, v, options));
        }
      }
    }
  }
});

test("all twist counts agree with independent rotation by kv about the translated z-axis", () => {
  for (const options of configurations) {
    for (const u of [0, 0.13, 0.5, 0.89, 1]) {
      for (const v of [0, Math.PI / 6, Math.PI / 2, 0.9 * Math.PI, Math.PI, 1.4 * Math.PI, 2 * Math.PI]) {
        const line = [0, options.length * (u - 0.5), 0];
        const translated = translate(line, options.distance);
        // T(d) Rz(kv) T(-d), acting on the already translated segment.
        const local = translate(translated, -options.distance);
        const rotatedAboutPivot = translate(matrixVector(rotateZ(options.twists * v), local), options.distance);
        const final = matrixVector(rotateY(2 * v), rotatedAboutPivot);
        vectorClose(math.stagePoint(1, u, v, options), line);
        vectorClose(math.stagePoint(2, u, v, options), translated);
        vectorClose(math.stagePoint(3, u, v, options), rotatedAboutPivot);
        vectorClose(math.stagePoint(4, u, v, options), final);
        vectorClose(math.stagePoint(5, u, v, options), final);
        vectorClose(math.surface(u, v, options), final);
      }
    }
  }
});

test("zero twists produce a cylindrical band and leave the translated line unrotated", () => {
  for (const dimension of dimensions) {
    const options = { ...dimension, twists: 0 };
    for (const u of [0, 0.3, 0.5, 1]) {
      for (const v of [0, 0.4, Math.PI / 2, Math.PI]) {
        const point = math.surface(u, v, options);
        close(Math.hypot(point[0], point[2]), options.distance);
        close(point[1], options.length * (u - 0.5));
        vectorClose(math.stagePoint(3, u, v, options), math.stagePoint(2, u, 0, options));
      }
    }
  }
});

test("analytic partial derivatives match finite differences for different L, d, and k", () => {
  const h = 1e-6;
  for (const options of configurations) {
    for (const u of [0.08, 0.31, 0.5, 0.73, 0.94]) {
      for (const v of [-0.7, 0, 0.43, Math.PI / 2, 2.83, Math.PI, 5.8]) {
        const finiteU = subtract(math.surface(u + h, v, options), math.surface(u - h, v, options)).map(value => value / (2 * h));
        const finiteV = subtract(math.surface(u, v + h, options), math.surface(u, v - h, options)).map(value => value / (2 * h));
        const { ru, rv } = math.derivatives(u, v, options);
        vectorClose(ru, finiteU, 1e-7);
        vectorClose(rv, finiteV, 1e-7);
      }
    }
  }
});

test("midpoint example normals follow each twist count and have magnitude 2Ld", () => {
  const midpointUnitNormals = [[1, 0, 0], [0, -1, 0], [-1, 0, 0], [0, 1, 0]];
  const midpointUnitTangents = [[0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0]];
  for (const options of configurations) {
    const { length, distance } = options;
    const { ru, rv, normal, unitNormal } = math.derivatives(0.5, Math.PI / 2, options);
    vectorClose(math.surface(0.5, Math.PI / 2, options), [-distance, 0, 0]);
    vectorClose(ru, midpointUnitTangents[options.twists].map(value => value * length));
    vectorClose(rv, [0, 0, 2 * distance]);
    vectorClose(normal, midpointUnitNormals[options.twists].map(value => value * 2 * length * distance));
    vectorClose(unitNormal, midpointUnitNormals[options.twists]);
  }
});

test("the normal is ru cross rv and stays nonzero when d exceeds L/2", () => {
  for (const options of configurations) {
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 40; j++) {
        const u = i / 20, v = j * Math.PI / 40;
        const { ru, rv, normal, unitNormal } = math.derivatives(u, v, options);
        vectorClose(normal, math.cross(ru, rv));
        close(math.dot(normal, ru), 0);
        close(math.dot(normal, rv), 0);
        close(math.norm(unitNormal), 1);
        const t = options.length * (u - 0.5), q = options.distance - t * Math.sin(options.twists * v);
        const predictedSquaredNorm = options.length ** 2 * (4 * q * q + options.twists ** 2 * t * t);
        close(math.norm(normal) ** 2 / predictedSquaredNorm, 1);
        assert.ok(math.norm(normal) >= 2 * options.length * (options.distance - options.length / 2) - 1e-10);
        close(math.norm(ru), options.length);
      }
    }
  }
});

test("the seam preserves width and normal for even k, and reverses them for odd k", () => {
  for (const options of configurations) {
    const reversed = options.twists % 2 === 1, sign = reversed ? -1 : 1;
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const pairedU = reversed ? 1 - u : u;
      vectorClose(math.surface(u, 0, options), math.surface(pairedU, Math.PI, options));
      const start = math.derivatives(u, 0, options), end = math.derivatives(pairedU, Math.PI, options);
      vectorClose(start.ru, end.ru.map(value => sign * value));
      vectorClose(start.rv, end.rv);
      vectorClose(start.normal, end.normal.map(value => sign * value));
    }
    close(math.norm(subtract(math.surface(0, 0, options), math.surface(0, Math.PI, options))), reversed ? options.length : 0);
  }
});

test("one lap returns the normal for even k and flips it for odd k; two laps always restore it", () => {
  for (const options of configurations) {
    const sign = options.twists % 2 === 1 ? -1 : 1;
    const start = math.orientation(0, options), once = math.orientation(1, options), twice = math.orientation(2, options);
    vectorClose(start.point, [options.distance, 0, 0]);
    vectorClose(start.point, once.point);
    vectorClose(start.point, twice.point);
    vectorClose(once.normal, start.normal.map(value => sign * value));
    vectorClose(twice.normal, start.normal);
    close(start.dot, 1);
    close(once.dot, sign);
    close(twice.dot, 1);
    for (let i = 0; i <= 80; i++) {
      const laps = i / 40, state = math.orientation(laps, options);
      const { ru, rv } = math.derivatives(0.5, Math.PI * laps, options);
      close(math.norm(state.normal), 1);
      close(math.dot(state.normal, ru), 0);
      close(math.dot(state.normal, rv), 0);
      close(state.dot, math.dot(state.normal, state.referenceNormal));
      if (i > 0) assert.ok(math.dot(state.normal, math.orientation(laps - 1 / 40, options).normal) > 0.9);
    }
  }
});

test("boundary edges form one component for odd k and two separate components for even k", () => {
  for (const options of configurations) {
    const reversed = options.twists % 2 === 1;
    // Count edge components from the actual geometric endpoint identifications.
    const nextEdge = [0, 1].map(edge => {
      const endpoint = math.surface(edge, Math.PI, options);
      const matches = [0, 1].filter(other => math.norm(subtract(endpoint, math.surface(other, 0, options))) < 1e-10);
      assert.equal(matches.length, 1);
      return matches[0];
    });
    let components = 0;
    const visited = new Set();
    for (const edge of [0, 1]) {
      if (visited.has(edge)) continue;
      components++;
      let current = edge;
      while (!visited.has(current)) { visited.add(current); current = nextEdge[current]; }
      assert.equal(current, edge);
    }
    assert.equal(components, reversed ? 1 : 2);
    vectorClose(math.surface(0, 2 * Math.PI, options), math.surface(0, 0, options));
    for (let i = 0; i <= 20; i++) {
      const v = i * Math.PI / 20;
      vectorClose(math.surface(0, Math.PI + v, options), math.surface(reversed ? 1 : 0, v, options));
    }
  }
});

test("the translated rotation keeps its pivot fixed and the final rotation sweeps that pivot around y", () => {
  for (const options of configurations) {
    for (const v of [0, 0.37, Math.PI / 2, Math.PI]) {
      vectorClose(math.stagePoint(3, 0.5, v, options), [options.distance, 0, 0]);
      close(math.norm(math.surface(0.5, v, options)), options.distance);
      close(math.norm(math.derivatives(0.5, v, options).normal), 2 * options.length * options.distance);
    }
    close(math.norm(subtract(math.surface(0.5, 0, options), math.surface(0.5, Math.PI / 2, options))), 2 * options.distance);
  }
});

test("validation rejects invalid parameters, dimensions, translation progress, and twist counts", () => {
  for (const u of [-0.01, 1.01, NaN, Infinity, -Infinity, "0.5", null]) {
    assert.throws(() => math.surface(u, 0), RangeError);
    assert.throws(() => math.derivatives(u, 0), RangeError);
    assert.throws(() => math.stagePoint(1, u, 0), RangeError);
  }
  for (const v of [NaN, Infinity, -Infinity, "0", null]) {
    assert.throws(() => math.surface(0.5, v), RangeError);
    assert.throws(() => math.derivatives(0.5, v), RangeError);
    assert.throws(() => math.stagePoint(1, 0.5, v), RangeError);
  }
  for (const stage of [0, 6, 1.5, NaN, Infinity, "1"]) assert.throws(() => math.stagePoint(stage, 0.5, 0), RangeError);
  for (const laps of [-0.01, 2.01, NaN, Infinity, "1", null]) assert.throws(() => math.orientation(laps), RangeError);
  const badOptions = [
    ...[0, -2, NaN, Infinity, "2", null].map(length => ({ length })),
    ...[0, -2, 1, NaN, Infinity, "10", null].map(distance => ({ distance })),
    { length: 8, distance: 4 }, { length: 8, distance: 3.99 },
    ...[-0.01, 1.01, NaN, Infinity, "1", null].map(translation => ({ translation })),
    ...[-1, 4, 0.5, NaN, Infinity, "1", null].map(twists => ({ twists }))
  ];
  for (const options of badOptions) {
    assert.throws(() => math.surface(0.5, 0, options), RangeError);
    assert.throws(() => math.derivatives(0.5, 0, options), RangeError);
    assert.throws(() => math.stagePoint(2, 0.5, 0, options), RangeError);
    assert.throws(() => math.orientation(1, options), RangeError);
  }
  for (const v of [-Number.MAX_VALUE, -8, 8, Number.MAX_VALUE]) {
    for (const twists of [0, 1, 2, 3]) {
      assert.ok(math.surface(0.4, v, { twists }).every(Number.isFinite));
      assert.ok(math.derivatives(0.4, v, { twists }).normal.every(Number.isFinite));
    }
  }
  assert.throws(() => math.normalize([0, 0, 0]), RangeError);
});
