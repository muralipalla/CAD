const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const solids = require("../cad-modules/solid-modeling/solid-modeling-lab.js");
const queries = require("../programming-modules/winged-edge-queries/app.js");

const root = path.resolve(__dirname, "..");

test("numeric winged-edge CSV feeds complete vertex-ring and face-loop queries", () => {
  Object.values(solids.MODELS).forEach(model => {
    const winged = solids.buildWingedData(model);
    const csv = solids.wingedCsv(winged);
    const mesh = queries.parseWingedCsv(csv);
    assert.equal(mesh.edges.size, winged.edges.length);
    assert.equal(mesh.vertexSeed.size, model.vertices.length);
    assert.equal(mesh.faceSeed.size, model.faces.length);
    for (let vertex = 0; vertex < model.vertices.length; vertex += 1) {
      const answer = queries.incidentEdges(mesh, vertex);
      const expected = winged.edges.filter(edge => edge.a === vertex || edge.b === vertex).map(edge => Number(edge.id.slice(1)));
      assert.deepEqual(answer.edgeIds.slice().sort((a, b) => a - b), expected);
      assert.equal(answer.neighbors.length, expected.length);
      answer.neighbors.forEach((neighbor, index) => {
        const edge = mesh.edges.get(answer.edgeIds[index]);
        assert.ok((edge.v1 === vertex && edge.v2 === neighbor) || (edge.v2 === vertex && edge.v1 === neighbor));
      });
    }
    model.faces.forEach((face, faceIndex) => {
      const answer = queries.faceBoundary(mesh, faceIndex);
      const expectedEdges = face.map((vertex, index) => Number(winged.byKey.get(solids.edgeKey(vertex, face[(index + 1) % face.length])).id.slice(1)));
      assert.deepEqual(answer.edgeIds.slice().sort((a, b) => a - b), expectedEdges.sort((a, b) => a - b));
      assert.equal(answer.vertices.length, face.length);
      const start = face.indexOf(answer.vertices[0]);
      assert.deepEqual(answer.vertices, face.map((_, index) => face[(start + index) % face.length]));
    });
  });
});

test("upload parser rejects half-edge, prefixed, and broken winged-edge CSVs", () => {
  const model = solids.MODELS.cube, winged = solids.buildWingedData(model);
  const csv = solids.wingedCsv(winged);
  assert.throws(() => queries.parseWingedCsv(solids.halfEdgeCsv(solids.buildHalfEdgeData(model, winged))), /winged-edge CSV/);
  assert.throws(() => queries.parseWingedCsv(csv.replace(/\r\n0,/, "\r\nE0,")), /integer IDs/);
  const lines = csv.trim().split("\r\n"), cells = lines[1].split(",");
  cells[5] = "9999"; lines[1] = cells.join(",");
  assert.throws(() => queries.parseWingedCsv(lines.join("\r\n")), /missing edge/);
});

test("programming module links algorithms, complete code, and original lecture slides", () => {
  const page = fs.readFileSync(path.join(root, "programming-modules", "winged-edge-queries", "index.html"), "utf8");
  const index = fs.readFileSync(path.join(root, "programming-modules", "index.html"), "utf8");
  const solidPage = fs.readFileSync(path.join(root, "cad-modules", "solid-modeling", "index.html"), "utf8");
  assert.match(index, /winged-edge-queries\/index\.html/);
  assert.match(solidPage, /winged-edge-queries\/index\.html/);
  assert.match(solidPage, /winged-programme-link/);
  assert.match(page, /Mesh\.pdf/);
  assert.match(page, /Algorithms on WEDS/);
  assert.equal((page.match(/<strong>Main Inquiry:<\/strong>/g) || []).length, 2);
  assert.ok(page.indexOf('id="query-algorithms-title"') < page.indexOf('id="query-lab-title"'), "Algorithms should precede the query tool");
  assert.match(page, /data-source-callout/);
  assert.match(page, /solid-modeling\/index\.html#winged-lab-downloads/);
  assert.match(page, /data-winged-file/);
  assert.match(page, /LeftPrevious|Left Previous/);
  for (const filename of ["winged_edge_queries.py", "winged_edge_queries.m"]) {
    assert.match(page, new RegExp(filename.replace(".", "\\.")));
    assert.ok(fs.existsSync(path.join(root, "programming-modules", "winged-edge-queries", filename)));
  }
});

test("new programming page resolves its local assets and navigation links", () => {
  const pagePath = path.join(root, "programming-modules", "winged-edge-queries", "index.html");
  const page = fs.readFileSync(pagePath, "utf8");
  for (const match of page.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = match[1];
    if (/^(?:https?:|mailto:|data:)/.test(raw)) continue;
    const [withQuery, fragment] = raw.split("#");
    const local = withQuery.split("?")[0];
    const target = local ? path.resolve(path.dirname(pagePath), local) : pagePath;
    assert.ok(fs.existsSync(target), `Missing local target: ${raw}`);
    if (fragment && target.endsWith(".html")) {
      assert.match(fs.readFileSync(target, "utf8"), new RegExp('id="' + fragment + '"'));
    }
  }
});

test("downloadable Python code answers queries from an exported CSV", { skip: !process.env.CAD_TEST_PYTHON }, () => {
  const model = solids.MODELS.cube;
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "cad-winged-query-"));
  const csvPath = path.join(temporaryDirectory, "cube-winged-edges.csv");
  try {
    fs.writeFileSync(csvPath, solids.wingedCsv(solids.buildWingedData(model)));
    const script = path.join(root, "programming-modules", "winged-edge-queries", "winged_edge_queries.py");
    const result = spawnSync(process.env.CAD_TEST_PYTHON, [script, csvPath, "--vertex", "0", "--face", "1"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Vertex 0: edges \[/);
    assert.match(result.stdout, /Face 1: edges \[/);
  } finally {
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    fs.rmdirSync(temporaryDirectory);
  }
});
