"""Query the numeric winged-edge CSV exported by the CAD Solid Modeling page.

Usage: python winged_edge_queries.py cube-winged-edges.csv --vertex 0 --face 1
"""

import argparse
import csv


COLUMNS = (
    "Edge", "V1", "V2", "Left Face", "Right Face",
    "Left Previous", "Left Next", "Right Previous", "Right Next",
)


def load_mesh(path):
    edges = {}
    vertex_seed = {}
    face_seed = {}
    with open(path, newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        if tuple(reader.fieldnames or ()) != COLUMNS:
            raise ValueError("Expected the numeric winged-edge CSV, not the half-edge CSV")
        for line, row in enumerate(reader, start=2):
            try:
                values = [int(row[name]) for name in COLUMNS]
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Row {line} must contain integer IDs") from exc
            if any(value < 0 for value in values):
                raise ValueError(f"Row {line} has a negative ID")
            edge = dict(zip(COLUMNS, values))
            edge_id = edge["Edge"]
            if edge_id in edges:
                raise ValueError(f"Duplicate edge {edge_id}")
            if edge["V1"] == edge["V2"] or edge["Left Face"] == edge["Right Face"]:
                raise ValueError(f"Edge {edge_id} has invalid endpoints or faces")
            edges[edge_id] = edge
            for vertex in (edge["V1"], edge["V2"]):
                vertex_seed.setdefault(vertex, edge_id)
            for face in (edge["Left Face"], edge["Right Face"]):
                face_seed.setdefault(face, edge_id)
    if not edges:
        raise ValueError("The CSV has no edge records")
    for edge in edges.values():
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
    parser.add_argument("csv_file", help="Winged-edge CSV downloaded from Solid Modeling")
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
