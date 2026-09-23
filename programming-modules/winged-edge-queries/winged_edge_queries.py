"""Query the complete WEDS CSV exported by the CAD Solid Modeling page.

Usage: python winged_edge_queries.py cube-weds.csv --vertex 0 --face 1
"""

import argparse
import csv
import re


COLUMNS = (
    "Edge", "V1", "V2", "Left Face", "Right Face",
    "Left Previous", "Left Next", "Right Previous", "Right Next",
)


def load_mesh(path):
    edges = {}
    vertex_seed = {}
    face_seed = {}
    with open(path, newline="", encoding="utf-8-sig") as source:
        rows = [row for row in csv.reader(source) if any(cell.strip() for cell in row)]

    def natural(cell, context):
        if not re.fullmatch(r"0|[1-9][0-9]*", cell.strip()):
            raise ValueError(f"{context} must contain non-negative integer IDs")
        return int(cell)

    vertex_rows = face_rows = None
    if rows and rows[0] == ["Vertex Table"]:
        cursor = 1

        def count(label):
            nonlocal cursor
            if cursor >= len(rows) or len(rows[cursor]) != 1:
                raise ValueError(f"Missing Number of {label} count")
            match = re.fullmatch(rf"Number of {label}=([0-9]+)", rows[cursor][0].strip())
            cursor += 1
            if not match or int(match.group(1)) < 1:
                raise ValueError(f"Invalid Number of {label} count")
            return int(match.group(1))

        def seeds(label, expected, header):
            nonlocal cursor
            if cursor >= len(rows) or rows[cursor] != [header, "Edge Number"]:
                raise ValueError(f"Expected the {label} table column labels")
            cursor += 1
            result = []
            for _ in range(expected):
                if cursor >= len(rows) or len(rows[cursor]) != 2:
                    raise ValueError(f"The {label} table needs {expected} records")
                result.append(tuple(natural(cell, label) for cell in rows[cursor]))
                cursor += 1
            return result

        vertex_rows = seeds("vertex", count("Vertices"), "Vertex")
        if cursor >= len(rows) or rows[cursor] != ["Face Table"]:
            raise ValueError("Expected Face Table after the vertex records")
        cursor += 1
        face_rows = seeds("face", count("Faces"), "Face")
        if cursor >= len(rows) or rows[cursor] != ["Edge Table"]:
            raise ValueError("Expected Edge Table after the face records")
        cursor += 1
        edge_count = count("Edges")
        if cursor >= len(rows) or tuple(rows[cursor]) != COLUMNS:
            raise ValueError("Expected the nine edge table column labels")
        edge_rows = rows[cursor + 1:]
        if len(edge_rows) != edge_count:
            raise ValueError(f"The Edge Table count does not match its {len(edge_rows)} records")
    elif rows and tuple(rows[0]) == COLUMNS:
        edge_rows = rows[1:]  # Earlier edge-only downloads remain usable.
    else:
        raise ValueError("Expected the WEDS CSV, not the half-edge CSV")

    for number, row in enumerate(edge_rows, start=1):
        if len(row) != len(COLUMNS):
            raise ValueError(f"Edge record {number} needs nine columns")
        values = [natural(cell, f"Edge record {number}") for cell in row]
        edge = dict(zip(COLUMNS, values))
        edge_id = edge["Edge"]
        if edge_id in edges:
            raise ValueError(f"Duplicate edge {edge_id}")
        if edge["V1"] == edge["V2"] or edge["Left Face"] == edge["Right Face"]:
            raise ValueError(f"Edge {edge_id} has invalid endpoints or faces")
        edges[edge_id] = edge
        if vertex_rows is None:
            for vertex in (edge["V1"], edge["V2"]):
                vertex_seed.setdefault(vertex, edge_id)
            for face in (edge["Left Face"], edge["Right Face"]):
                face_seed.setdefault(face, edge_id)
    if not edges:
        raise ValueError("The CSV has no edge records")
    if vertex_rows is not None:
        for vertex, seed in vertex_rows:
            if vertex in vertex_seed:
                raise ValueError(f"Duplicate vertex {vertex}")
            edge = edges.get(seed)
            if edge is None or vertex not in (edge["V1"], edge["V2"]):
                raise ValueError(f"Vertex {vertex} has an invalid seed edge {seed}")
            vertex_seed[vertex] = seed
        for face, seed in face_rows:
            if face in face_seed:
                raise ValueError(f"Duplicate face {face}")
            edge = edges.get(seed)
            if edge is None or face not in (edge["Left Face"], edge["Right Face"]):
                raise ValueError(f"Face {face} has an invalid seed edge {seed}")
            face_seed[face] = seed
    for edge in edges.values():
        if any(vertex not in vertex_seed for vertex in (edge["V1"], edge["V2"])) or \
                any(face not in face_seed for face in (edge["Left Face"], edge["Right Face"])):
            raise ValueError(f"Edge {edge['Edge']} refers to a missing vertex or face")
        for field in ("Left Previous", "Left Next", "Right Previous", "Right Next"):
            if edge[field] not in edges:
                raise ValueError(f"Edge {edge['Edge']} points to a missing edge")
    return edges, vertex_seed, face_seed


def incident_edges(edges, vertex_seed, vertex):
    """Walk the wing pointers around one vertex in ring order."""
    if vertex not in vertex_seed:
        raise ValueError(f"Vertex {vertex} is not in the mesh")
    start = vertex_seed[vertex]
    current = start
    visited, ring, neighbors = set(), [], []
    while current not in visited:
        edge = edges[current]
        if vertex not in (edge["V1"], edge["V2"]):
            raise ValueError("Broken vertex ring")
        visited.add(current)
        ring.append(current)
        if edge["V1"] == vertex:
            neighbors.append(edge["V2"])
            current = edge["Left Previous"]
        else:
            neighbors.append(edge["V1"])
            current = edge["Right Previous"]
    if current != start:
        raise ValueError("Vertex ring entered a different cycle")
    return ring, neighbors


def face_boundary(edges, face_seed, face):
    """Walk the stored face orientation and report its edges and vertices."""
    if face not in face_seed:
        raise ValueError(f"Face {face} is not in the mesh")
    start = face_seed[face]
    current = start
    visited, boundary, vertices = set(), [], []
    while current not in visited:
        edge = edges[current]
        if face not in (edge["Left Face"], edge["Right Face"]):
            raise ValueError("Broken face loop")
        visited.add(current)
        boundary.append(current)
        if edge["Left Face"] == face:
            vertices.append(edge["V1"])
            current = edge["Left Next"]
        else:
            vertices.append(edge["V2"])
            current = edge["Right Next"]
    if current != start:
        raise ValueError("Face loop entered a different cycle")
    return boundary, vertices


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", help="Complete WEDS CSV downloaded from Solid Modeling")
    parser.add_argument("--vertex", type=int, help="List incident edges around this vertex")
    parser.add_argument("--face", type=int, help="List boundary edges around this face")
    args = parser.parse_args()
    if args.vertex is None and args.face is None:
        parser.error("give --vertex, --face, or both")
    edges, vertex_seed, face_seed = load_mesh(args.csv_file)
    if args.vertex is not None:
        ring, neighbors = incident_edges(edges, vertex_seed, args.vertex)
        print(f"Vertex {args.vertex}: edges {ring}; neighbors {neighbors}")
    if args.face is not None:
        boundary, vertices = face_boundary(edges, face_seed, args.face)
        print(f"Face {args.face}: edges {boundary}; vertices {vertices}")


if __name__ == "__main__":
    main()
