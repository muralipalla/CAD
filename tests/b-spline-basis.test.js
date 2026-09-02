const assert = require("node:assert/strict");
const test = require("node:test");

const Basis = require("../programming-modules/b-spline-basis-functions/basis-math.js");

function closeTo(actual, expected, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test("clamped cubic basis reaches both endpoints and matches Bernstein values", () => {
  const knots = [0, 0, 0, 0, 1, 1, 1, 1];
  const configuration = Basis.validateConfiguration(knots, 4, "clamped");

  assert.equal(configuration.valid, true);
  assert.equal(configuration.basisCount, 4);
  assert.deepEqual(Basis.basisValues(knots, 4, "clamped", 0), [1, 0, 0, 0]);
  assert.deepEqual(Basis.basisValues(knots, 4, "clamped", 1), [0, 0, 0, 1]);
  assert.deepEqual(Basis.basisValues(knots, 4, "clamped", 0.5), [0.125, 0.375, 0.375, 0.125]);
});

test("not-clamped basis uses the correct left-limit values at its active endpoints", () => {
  const knots = [0, 1, 2, 3, 4, 5, 6, 7];
  const start = Basis.basisValues(knots, 3, "unclamped", 2);
  const end = Basis.basisValues(knots, 3, "unclamped", 5);

  assert.deepEqual(start, [0.5, 0.5, 0, 0, 0]);
  assert.deepEqual(end, [0, 0, 0, 0.5, 0.5]);
  closeTo(start.reduce((sum, value) => sum + value, 0), 1);
  closeTo(end.reduce((sum, value) => sum + value, 0), 1);
});

test("periodic bases fold guard terms and agree at the seam", () => {
  const knots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const configuration = Basis.validateConfiguration(knots, 3, "periodic");
  const start = Basis.basisValues(knots, 3, "periodic", 2);
  const end = Basis.basisValues(knots, 3, "periodic", 7);

  assert.equal(configuration.valid, true);
  assert.equal(configuration.basisCount, 5);
  assert.deepEqual(start, end);
  closeTo(start.reduce((sum, value) => sum + value, 0), 1);
});

test("every active-domain preset remains nonnegative and partitions unity", () => {
  for (const mode of ["clamped", "unclamped", "periodic", "custom-periodic"]) {
    for (const order of [1, 2, 4, 6]) {
      const knots = Basis.defaultKnotVector(mode, order, 6);
      const sampled = Basis.sampleBasisSegments(knots, order, mode, 30);
      assert.equal(sampled.configuration.valid, true, `${mode}, order ${order}`);
      for (const segment of sampled.segments) {
        for (const row of segment.values) {
          assert.ok(row.every((value) => value >= -1e-12));
          closeTo(row.reduce((sum, value) => sum + value, 0), 1, 1e-9);
        }
      }
    }
  }
});

test("custom finite vectors expose every possible basis across the full support", () => {
  const order = 4;
  const knots = Basis.defaultKnotVector("custom", order, 6);
  const configuration = Basis.validateConfiguration(knots, order, "custom");

  assert.equal(configuration.valid, true);
  assert.equal(configuration.basisCount, knots.length - order);
  assert.deepEqual(configuration.supportDomain, [knots[0], knots.at(-1)]);
  assert.deepEqual(configuration.plotDomain, configuration.supportDomain);
  assert.deepEqual(configuration.domain, [knots[order - 1], knots[knots.length - order]]);

  const leftShoulderParameter = (configuration.plotDomain[0] + configuration.domain[0]) / 2;
  const leftShoulder = Basis.basisValues(knots, order, "custom", leftShoulderParameter);
  const leftShoulderSum = leftShoulder.reduce((sum, value) => sum + value, 0);
  assert.equal(leftShoulder.length, configuration.basisCount);
  assert.ok(leftShoulder.some((value) => value > 0));
  assert.ok(leftShoulderSum > 0 && leftShoulderSum < 1);

  const sampled = Basis.sampleBasisSegments(knots, order, "custom", 24);
  assert.equal(sampled.segments[0].start, configuration.plotDomain[0]);
  assert.equal(sampled.segments.at(-1).end, configuration.plotDomain[1]);
  for (const segment of sampled.segments) {
    segment.parameters.forEach((parameter, rowIndex) => {
      const row = segment.values[rowIndex];
      assert.equal(row.length, configuration.basisCount);
      assert.ok(row.every((value) => value >= -1e-12));
      if (parameter >= configuration.domain[0] && parameter <= configuration.domain[1]) {
        closeTo(row.reduce((sum, value) => sum + value, 0), 1, 1e-9);
      }
    });
  }
});

test("custom periodic defaults are nonuniform, cyclic, and agree at the seam", () => {
  const order = 4;
  const expectedBasisCount = 7;
  const knots = Basis.defaultKnotVector("custom-periodic", order, expectedBasisCount);
  const configuration = Basis.validateConfiguration(knots, order, "custom-periodic");
  const differences = knots.slice(1).map((value, index) => value - knots[index]);

  assert.equal(configuration.valid, true);
  assert.equal(configuration.basisCount, knots.length - 2 * order + 1);
  assert.equal(configuration.basisCount, expectedBasisCount);
  assert.equal(configuration.effectiveBasisCount, expectedBasisCount + order - 1);
  assert.deepEqual(configuration.plotDomain, configuration.domain);
  assert.ok(Math.max(...differences) - Math.min(...differences) > 1e-3);

  const start = Basis.basisValues(knots, order, "custom-periodic", configuration.domain[0]);
  const end = Basis.basisValues(knots, order, "custom-periodic", configuration.domain[1]);
  assert.deepEqual(start, end);
  closeTo(start.reduce((sum, value) => sum + value, 0), 1);

  const brokenGuards = knots.slice();
  brokenGuards[1] = (brokenGuards[0] + brokenGuards[2]) / 2;
  const invalid = Basis.validateConfiguration(brokenGuards, order, "custom-periodic");
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes("guard-knot spacings")));
});

test("validation rejects excess multiplicity and inconsistent periodic guards", () => {
  assert.equal(
    Basis.validateConfiguration([0, 0, 0, 0, 1, 2, 3], 3, "clamped").valid,
    false,
  );
  assert.equal(
    Basis.validateConfiguration([0, 1, 2, 3, 4, 5, 6, 8, 9, 10], 3, "periodic").valid,
    false,
  );
  assert.equal(
    Basis.validateConfiguration([0, 2, 1, 3, 4, 5], 2, "unclamped").valid,
    false,
  );
});
