(function (root) {
  "use strict";

  const HEADERS = ["Edge", "V1", "V2", "Left Face", "Right Face", "Left Previous", "Left Next", "Right Previous", "Right Next"];

  function csvRows(text) {
    const rows = [], row = [];
    let field = "", quoted = false;
    text = String(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = !quoted;
      } else if (!quoted && char === ",") {
        row.push(field); field = "";
      } else if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some(function (cell) { return cell !== ""; })) rows.push(row.slice());
        row.length = 0;
      } else field += char;
    }
    if (quoted) throw new Error("The CSV has an unclosed quoted field.");
    row.push(field);
    if (row.some(function (cell) { return cell !== ""; })) rows.push(row);
    return rows;
  }

  function parseWingedCsv(text) {
    const rows = csvRows(text);
    const edgeHeader = function (row) { return row && row.length === HEADERS.length && HEADERS.every(function (name, index) { return row[index].trim() === name; }); };
    const integer = function (cell, context) {
      const value = String(cell).trim();
      if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
        throw new Error(context + " must contain non-negative integer IDs only. Download a fresh CSV if it has V/E/F prefixes.");
      }
      return Number(value);
    };
    let edgeRows, vertexRows = null, faceRows = null;
    if (rows[0] && rows[0].length === 1 && rows[0][0].trim() === "Vertex Table") {
      let index = 1;
      function count(label) {
        const row = rows[index++], match = row && row.length === 1 && row[0].trim().match(new RegExp("^Number of " + label + "=(\\d+)$"));
        if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) throw new Error("Invalid Number of " + label + " count in the WEDS CSV.");
        return Number(match[1]);
      }
      function seeds(label, expected, header) {
        const row = rows[index++];
        if (!row || row.length !== 2 || row[0].trim() !== header || row[1].trim() !== "Edge Number") throw new Error("Expected the " + label + " table column labels.");
        const seeds = [];
        for (let item = 0; item < expected; item += 1) {
          const entry = rows[index++];
          if (!entry || entry.length !== 2) throw new Error("The " + label + " table must contain " + expected + " records.");
          seeds.push([integer(entry[0], label + " number"), integer(entry[1], label + " edge number")]);
        }
        return seeds;
      }
      vertexRows = seeds("vertex", count("Vertices"), "Vertex");
      if (!rows[index] || rows[index++].length !== 1 || rows[index - 1][0].trim() !== "Face Table") throw new Error("Expected Face Table after the vertex records.");
      faceRows = seeds("face", count("Faces"), "Face");
      if (!rows[index] || rows[index++].length !== 1 || rows[index - 1][0].trim() !== "Edge Table") throw new Error("Expected Edge Table after the face records.");
      const edgeCount = count("Edges");
      if (!edgeHeader(rows[index++])) throw new Error("Expected the nine edge table column labels.");
      edgeRows = rows.slice(index);
      if (edgeRows.length !== edgeCount) throw new Error("The Edge Table count does not match its " + edgeRows.length + " records.");
    } else if (edgeHeader(rows[0])) {
      edgeRows = rows.slice(1); // Earlier edge-only downloads remain usable.
    } else {
      throw new Error("Choose a WEDS CSV from the Solid Modeling explorer (not the half-edge CSV).");
    }
    if (!edgeRows.length) throw new Error("The CSV has no edge records.");
    const edges = new Map(), vertexSeed = new Map(), faceSeed = new Map();
    edgeRows.forEach(function (row, index) {
      if (row.length !== HEADERS.length) throw new Error("Edge record " + (index + 1) + " needs nine columns.");
      const numbers = row.map(function (cell) { return integer(cell, "Edge record " + (index + 1)); });
      const edge = { id: numbers[0], v1: numbers[1], v2: numbers[2], leftFace: numbers[3], rightFace: numbers[4],
        leftPrev: numbers[5], leftNext: numbers[6], rightPrev: numbers[7], rightNext: numbers[8] };
      if (edges.has(edge.id)) throw new Error("Edge " + edge.id + " appears more than once.");
      if (edge.v1 === edge.v2 || edge.leftFace === edge.rightFace) throw new Error("Edge " + edge.id + " has invalid endpoints or faces.");
      edges.set(edge.id, edge);
      if (!vertexRows) {
        if (!vertexSeed.has(edge.v1)) vertexSeed.set(edge.v1, edge.id);
        if (!vertexSeed.has(edge.v2)) vertexSeed.set(edge.v2, edge.id);
        if (!faceSeed.has(edge.leftFace)) faceSeed.set(edge.leftFace, edge.id);
        if (!faceSeed.has(edge.rightFace)) faceSeed.set(edge.rightFace, edge.id);
      }
    });
    if (vertexRows) {
      vertexRows.forEach(function (entry) {
        const vertex = entry[0], seed = entry[1], edge = edges.get(seed);
        if (vertexSeed.has(vertex)) throw new Error("Vertex " + vertex + " appears more than once.");
        if (!edge || (edge.v1 !== vertex && edge.v2 !== vertex)) throw new Error("Vertex " + vertex + " has an invalid seed edge " + seed + ".");
        vertexSeed.set(vertex, seed);
      });
      faceRows.forEach(function (entry) {
        const face = entry[0], seed = entry[1], edge = edges.get(seed);
        if (faceSeed.has(face)) throw new Error("Face " + face + " appears more than once.");
        if (!edge || (edge.leftFace !== face && edge.rightFace !== face)) throw new Error("Face " + face + " has an invalid seed edge " + seed + ".");
        faceSeed.set(face, seed);
      });
    }
    edges.forEach(function (edge) {
      if (!vertexSeed.has(edge.v1) || !vertexSeed.has(edge.v2) || !faceSeed.has(edge.leftFace) || !faceSeed.has(edge.rightFace)) {
        throw new Error("Edge " + edge.id + " refers to a vertex or face missing from its table.");
      }
      for (const field of ["leftPrev", "leftNext", "rightPrev", "rightNext"]) {
        if (!edges.has(edge[field])) throw new Error("Edge " + edge.id + " points to missing edge " + edge[field] + ".");
      }
    });
    return { edges: edges, vertexSeed: vertexSeed, faceSeed: faceSeed };
  }

  function incidentEdges(mesh, vertex) {
    vertex = Number(vertex);
    if (!mesh.vertexSeed.has(vertex)) throw new Error("Vertex " + vertex + " is not in this CSV.");
    const start = mesh.vertexSeed.get(vertex), visited = new Set(), edgeIds = [], neighbors = [];
    let current = start;
    while (!visited.has(current)) {
      const edge = mesh.edges.get(current);
      if (!edge || (edge.v1 !== vertex && edge.v2 !== vertex)) throw new Error("The vertex ring has a broken wing pointer.");
      visited.add(current); edgeIds.push(current);
      neighbors.push(edge.v1 === vertex ? edge.v2 : edge.v1);
      current = edge.v1 === vertex ? edge.leftPrev : edge.rightPrev;
    }
    if (current !== start) throw new Error("The vertex ring enters a different cycle before returning to its seed.");
    return { edgeIds: edgeIds, neighbors: neighbors };
  }

  function faceBoundary(mesh, face) {
    face = Number(face);
    if (!mesh.faceSeed.has(face)) throw new Error("Face " + face + " is not in this CSV.");
    const start = mesh.faceSeed.get(face), visited = new Set(), edgeIds = [], vertices = [];
    let current = start;
    while (!visited.has(current)) {
      const edge = mesh.edges.get(current);
      if (!edge || (edge.leftFace !== face && edge.rightFace !== face)) throw new Error("The face loop has a broken wing pointer.");
      visited.add(current); edgeIds.push(current);
      vertices.push(edge.leftFace === face ? edge.v1 : edge.v2);
      current = edge.leftFace === face ? edge.leftNext : edge.rightNext;
    }
    if (current !== start) throw new Error("The face loop enters a different cycle before returning to its seed.");
    return { edgeIds: edgeIds, vertices: vertices };
  }

  function mount() {
    const lab = root.document.querySelector("[data-winged-query-lab]");
    if (!lab) return;
    const fileInput = lab.querySelector("[data-winged-file]");
    const vertexSelect = lab.querySelector("[data-vertex-select]"), faceSelect = lab.querySelector("[data-face-select]");
    const vertexButton = lab.querySelector("[data-query-vertex]"), faceButton = lab.querySelector("[data-query-face]");
    const status = lab.querySelector("[data-file-status]"), result = lab.querySelector("[data-query-result]");
    let mesh = null;
    function fillSelect(select, ids) {
      select.replaceChildren();
      ids.sort(function (a, b) { return a - b; }).forEach(function (id) {
        const option = root.document.createElement("option"); option.value = String(id); option.textContent = String(id); select.appendChild(option);
      });
      select.disabled = false;
    }
    fileInput.addEventListener("change", async function () {
      mesh = null; vertexSelect.disabled = faceSelect.disabled = vertexButton.disabled = faceButton.disabled = true;
      result.textContent = "";
      const file = fileInput.files && fileInput.files[0];
      if (!file) { status.textContent = "Choose a WEDS CSV to begin."; return; }
      try {
        mesh = parseWingedCsv(await file.text());
        fillSelect(vertexSelect, Array.from(mesh.vertexSeed.keys()));
        fillSelect(faceSelect, Array.from(mesh.faceSeed.keys()));
        vertexButton.disabled = faceButton.disabled = false;
        status.textContent = file.name + ": " + mesh.edges.size + " edges, " + mesh.vertexSeed.size + " vertices, " + mesh.faceSeed.size + " faces loaded. Queries run in this browser.";
      } catch (error) { status.textContent = error.message; }
    });
    vertexButton.addEventListener("click", function () {
      try {
        const id = Number(vertexSelect.value), answer = incidentEdges(mesh, id);
        result.textContent = "Vertex " + id + "\nIncident edges in ring order: " + answer.edgeIds.join(" → ") + "\nNeighbor vertices in the same order: " + answer.neighbors.join(" → ");
      } catch (error) { result.textContent = error.message; }
    });
    faceButton.addEventListener("click", function () {
      try {
        const id = Number(faceSelect.value), answer = faceBoundary(mesh, id);
        result.textContent = "Face " + id + "\nBoundary edges in loop order: " + answer.edgeIds.join(" → ") + "\nBoundary vertices in the same order: " + answer.vertices.join(" → ");
      } catch (error) { result.textContent = error.message; }
    });
    if (root.location && /^https?:$/.test(root.location.protocol) && root.fetch) {
      root.document.querySelectorAll("[data-source-file]").forEach(async function (node) {
        try {
          const response = await root.fetch(node.dataset.sourceFile);
          if (!response.ok) throw new Error("Source unavailable");
          node.textContent = await response.text();
        } catch (_) { node.textContent = "Download the source file to view the complete script."; }
      });
    }
  }

  const API = { csvRows: csvRows, parseWingedCsv: parseWingedCsv, incidentEdges: incidentEdges, faceBoundary: faceBoundary };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.WingedEdgeQueries = API;
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
})(typeof window !== "undefined" ? window : globalThis);
