const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const solids = require("../cad-modules/solid-modeling/solid-modeling-lab.js");
const queries = require("../programming-modules/winged-edge-queries/app.js");

const root = path.resolve(__dirname, "..");

test("complete WEDS CSV feeds vertex-ring and face-loop queries from its seed tables", () => {
  Object.values(solids.MODELS).forEach(model => {
    const winged = solids.buildWingedData(model);
    const csv = solids.wingedCsv(winged);
    const mesh = queries.parseWingedCsv(csv);
    assert.equal(mesh.edges.size, winged.edges.length);
    assert.equal(mesh.vertexSeed.size, model.vertices.length);
    assert.equal(mesh.faceSeed.size, model.faces.length);
    winged.vertexTable.forEach(record => assert.equal(mesh.vertexSeed.get(record.vertex), Number(record.edge.slice(1))));
    winged.faceTable.forEach(record => assert.equal(mesh.faceSeed.get(record.face), Number(record.edge.slice(1))));
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

test("upload parser rejects half-edge, prefixed, inconsistent, and broken WEDS CSVs", () => {
  const model = solids.MODELS.cube, winged = solids.buildWingedData(model);
  const csv = solids.wingedCsv(winged);
  assert.throws(() => queries.parseWingedCsv(solids.halfEdgeCsv(solids.buildHalfEdgeData(model, winged))), /WEDS CSV/);
  assert.throws(() => queries.parseWingedCsv(csv.replace(/\r\n0,/, "\r\nE0,")), /integer IDs/);
  assert.throws(() => queries.parseWingedCsv(csv.replace("Number of Vertices=8", "Number of Vertices=9")), /vertex table|Vertex Table|vertex records/);
  assert.throws(() => queries.parseWingedCsv(csv.replace("0,0\r\n", "0,9999\r\n")), /invalid seed edge/);
  const lines = csv.trim().split("\r\n"), firstEdge = lines.indexOf("Edge Table") + 3, cells = lines[firstEdge].split(",");
  cells[5] = "9999";
  lines[firstEdge] = cells.join(",");
  assert.throws(() => queries.parseWingedCsv(lines.join("\r\n")), /missing edge/);
  const oldFormat = csv.trim().split("\r\n").slice(firstEdge - 1);
  assert.equal(queries.parseWingedCsv(oldFormat.join("\r\n")).edges.size, winged.edges.length);
});

test("Solid Modeling contains the WEDS algorithms, queries, and code downloads", () => {
  const oldPage = fs.readFileSync(path.join(root, "programming-modules", "winged-edge-queries", "index.html"), "utf8");
  const index = fs.readFileSync(path.join(root, "programming-modules", "index.html"), "utf8");
  const solidPage = fs.readFileSync(path.join(root, "cad-modules", "solid-modeling", "index.html"), "utf8");
  assert.doesNotMatch(index, /winged-edge-queries\/index\.html/);
  assert.match(oldPage, /http-equiv="refresh"[^>]*solid-modeling\/index\.html#weds-programming/);
  assert.match(solidPage, /<h2 id="weds-programming">Algorithms on WEDS<\/h2>/);
  assert.match(solidPage, /href="#weds-programming"/);
  assert.match(solidPage, /winged-programme-link/);
  assert.match(solidPage, /Mesh\.pdf/);
  assert.equal((solidPage.match(/<strong>Main Inquiry:<\/strong>/g) || []).length, 2);
  assert.ok(solidPage.indexOf('id="query-algorithms-title"') < solidPage.indexOf('id="query-lab-title"'), "Algorithms should precede the query tool");
  assert.match(solidPage, /data-source-callout/);
  assert.match(solidPage, /data-winged-file/);
  assert.match(solidPage, /LeftPrevious|Left Previous/);
  assert.match(solidPage, /winged-edge-queries\/app\.css\?v=3/);
  assert.match(solidPage, /winged-edge-queries\/app\.js\?v=3/);
  for (const filename of ["winged_edge_queries.py", "winged_edge_queries.m"]) {
    assert.match(solidPage, new RegExp(filename.replace(".", "\\.")));
    assert.ok(fs.existsSync(path.join(root, "programming-modules", "winged-edge-queries", filename)));
  }
});

test("the moved WEDS section resolves downloads and the legacy redirect target", () => {
  const pagePath = path.join(root, "cad-modules", "solid-modeling", "index.html");
  const page = fs.readFileSync(pagePath, "utf8");
  const section = page.slice(page.indexOf('<section class="weds-programming"'), page.indexOf('<h2 id="half-edge-data-structure"'));
  for (const match of section.matchAll(/(?:href|data-source-file)="([^"]+)"/g)) {
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
  const csvPath = path.join(temporaryDirectory, "cube-weds.csv");
  const legacyPath = path.join(temporaryDirectory, "cube-winged-edges.csv");
  try {
    const csv = solids.wingedCsv(solids.buildWingedData(model));
    fs.writeFileSync(csvPath, csv);
    fs.writeFileSync(legacyPath, csv.split("\r\n").slice(csv.split("\r\n").indexOf("Edge Table") + 2).join("\r\n"));
    const script = path.join(root, "programming-modules", "winged-edge-queries", "winged_edge_queries.py");
    const result = spawnSync(process.env.CAD_TEST_PYTHON, [script, csvPath, "--vertex", "0", "--face", "1"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Vertex 0: edges \[/);
    assert.match(result.stdout, /Face 1: edges \[/);
    const legacy = spawnSync(process.env.CAD_TEST_PYTHON, [script, legacyPath, "--face", "1"], { encoding: "utf8" });
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.match(legacy.stdout, /Face 1: edges \[/);
  } finally {
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
    fs.rmdirSync(temporaryDirectory);
  }
});
