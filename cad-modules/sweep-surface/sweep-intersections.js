/* Sampled-mesh self-intersection diagnostic. No external dependencies. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SweepIntersections = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Work in a centered unit-sized box. The source mesh uses Float32 coordinates.
  const EPS = 1e-7;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const length = a => Math.hypot(a[0], a[1], a[2]);
  const now = () => typeof performance === 'object' ? performance.now() : Date.now();
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));

  function overlaps(a, b) {
    return a.min[0] <= b.max[0] + EPS && b.min[0] <= a.max[0] + EPS &&
      a.min[1] <= b.max[1] + EPS && b.min[1] <= a.max[1] + EPS &&
      a.min[2] <= b.max[2] + EPS && b.min[2] <= a.max[2] + EPS;
  }

  // Weld ONLY identified parameter boundary seams. Equal positions elsewhere
  // (e.g. the two branches of a figure-eight profile) remain distinct vertices.
  function seamVertices(model, vertices) {
    const parent = Int32Array.from({ length: vertices.length }, (_, i) => i);
    const find = id => {
      while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; }
      return id;
    };
    const join = (a, b) => { parent[find(b)] = find(a); };
    const same = (a, b) => length(sub(vertices[a], vertices[b])) <= EPS * 2;
    const rows = model.path && model.path.length;
    const columns = model.profile && model.profile.length;
    if (rows > 1 && columns > 1 && rows * columns === vertices.length) {
      if (model.closedProfile) {
        for (let row = 0; row < rows; row++) {
          const first = row * columns, last = first + columns - 1;
          if (same(first, last)) join(first, last);
        }
      }
      if (model.closedPath) {
        const lastRow = (rows - 1) * columns;
        const periodic = !!model.closedProfile;
        const count = periodic ? columns - 1 : columns;
        const wrap = value => (value + count) % count;
        // A symmetric twisted profile can meet with shifted/reversed indexing.
        // Require the WHOLE boundary to match in order before joining it.
        let matched = false;
        for (const direction of [1, -1]) {
          for (let shift = 0; shift < (periodic ? count : 1) && !matched; shift++) {
            const target = j => periodic ? wrap(shift + direction * j) : direction === 1 ? j : count - 1 - j;
            let valid = true;
            for (let j = 0; j < count; j++) {
              if (!same(lastRow + j, target(j))) { valid = false; break; }
            }
            if (valid) {
              for (let j = 0; j < count; j++) join(lastRow + j, target(j));
              matched = true;
            }
          }
          if (matched) break;
        }
      }
    }
    for (let i = 0; i < parent.length; i++) parent[i] = find(i);
    return parent;
  }

  function adjacent(a, b) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (a.ids[i] === b.ids[j]) return true;
    return false;
  }

  function sectionInterval(triangle, distances, axis) {
    let min = Infinity, max = -Infinity;
    const add = point => { const value = dot(point, axis); min = Math.min(min, value); max = Math.max(max, value); };
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, da = distances[i], db = distances[j];
      if (Math.abs(da) <= EPS) add(triangle.points[i]);
      if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
        const t = da / (da - db), a = triangle.points[i], b = triangle.points[j];
        add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      }
    }
    return [min, max];
  }

  function coplanarOverlap(a, b) {
    let drop = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(a.normal[i]) > Math.abs(a.normal[drop])) drop = i;
    const axes = [0, 1, 2].filter(i => i !== drop);
    const project = p => [p[axes[0]], p[axes[1]]];
    const boundary = b.points.map(project);
    const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const orientation = Math.sign(side(boundary[0], boundary[1], boundary[2]));
    let polygon = a.points.map(project);
    for (let edge = 0; edge < 3 && polygon.length; edge++) {
      const first = boundary[edge], second = boundary[(edge + 1) % 3], clipped = [];
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], q = polygon[(i + 1) % polygon.length];
        const dp = orientation * side(first, second, p), dq = orientation * side(first, second, q);
        if (dp >= 0) clipped.push(p);
        if ((dp >= 0) !== (dq >= 0)) {
          const t = dp / (dp - dq);
          clipped.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
      polygon = clipped;
    }
    if (polygon.length < 3) return false;
    let twiceArea = 0;
    // Fan area avoids subtracting nearly equal large absolute coordinates.
    for (let i = 1; i < polygon.length - 1; i++) twiceArea += side(polygon[0], polygon[i], polygon[i + 1]);
    return Math.abs(twiceArea) > EPS * Math.min(a.edgeLength, b.edgeLength) * 4;
  }

  function intersects(a, b) {
    const da = a.points.map(p => dot(b.normal, sub(p, b.points[0])));
    const db = b.points.map(p => dot(a.normal, sub(p, a.points[0])));
    const oneSide = distances => distances.every(d => d > EPS) || distances.every(d => d < -EPS);
    if (oneSide(da) || oneSide(db)) return false;
    const axis = cross(a.normal, b.normal), axisLength = length(axis);
    if (axisLength <= EPS) {
      return da.every(d => Math.abs(d) <= EPS) && db.every(d => Math.abs(d) <= EPS) && coplanarOverlap(a, b);
    }
    const unit = axis.map(x => x / axisLength);
    const ia = sectionInterval(a, da, unit), ib = sectionInterval(b, db, unit);
    // A single point of contact is not enough. Unrelated coincident edges can
    // be intersections when the two triangle planes cross along that edge.
    return Math.min(ia[1], ib[1]) - Math.max(ia[0], ib[0]) > EPS;
  }

  async function check(model, options) {
    options = options || {};
    const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : () => false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const maxPairs = Number.isFinite(options.maxPairs) ? Math.max(0, Math.floor(options.maxPairs)) : 2000000;
    const state = { complete: false, cancelled: false, pairCount: 0, triangleIds: [], testedPairs: 0, degenerateCount: 0 };
    const found = new Set();
    let nextYield = now() + 16, progress = 0, aborted = false;
    async function checkpoint(force) {
      if (isCancelled()) { state.cancelled = true; aborted = true; return false; }
      if (force || now() >= nextYield) {
        onProgress({ progress, testedPairs: state.testedPairs, pairCount: state.pairCount, degenerateCount: state.degenerateCount });
        await pause();
        nextYield = now() + 16;
        if (isCancelled()) { state.cancelled = true; aborted = true; return false; }
      }
      return true;
    }
    function finish(complete) {
      state.complete = complete;
      state.triangleIds = Array.from(found).sort((a, b) => a - b);
      return state;
    }
    if (!await checkpoint(true)) return finish(false);
    if (!model || !model.positions || !model.indices || model.positions.length % 3 || model.indices.length % 3) {
      throw new Error('Intersection checking requires triangular mesh positions and indices.');
    }
    const source = model.positions, indices = model.indices;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < source.length; i++) {
      const value = source[i], axis = i % 3;
      if (!Number.isFinite(value)) throw new Error('Intersection checking requires finite mesh coordinates.');
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
      if (i % 12288 === 0 && !await checkpoint(false)) return finish(false);
    }
    const extent = Math.max(...max.map((value, axis) => value - min[axis]));
    const scale = Number.isFinite(extent) && extent > 0 ? extent : 1;
    const center = min.map((value, axis) => (value + max[axis]) / 2);
    const vertices = new Array(source.length / 3);
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] = [0, 1, 2].map(axis => (source[i * 3 + axis] - center[axis]) / scale);
      if (i % 4096 === 0 && !await checkpoint(false)) return finish(false);
    }
    const canonical = seamVertices(model, vertices), triangles = [];
    for (let offset = 0; offset < indices.length; offset += 3) {
      const ids = [indices[offset], indices[offset + 1], indices[offset + 2]];
      if (ids.some(id => !Number.isInteger(id) || id < 0 || id >= vertices.length)) throw new Error('Invalid mesh triangle index.');
      const points = ids.map(id => vertices[id]);
      const edges = [sub(points[1], points[0]), sub(points[2], points[0]), sub(points[2], points[1])];
      const normal = cross(edges[0], edges[1]), area = length(normal), edgeLength = Math.max(...edges.map(length));
      if (edgeLength <= EPS || area <= edgeLength * edgeLength * 1e-10) {
        state.degenerateCount++;
      } else {
        triangles.push({ id: offset / 3, ids: ids.map(id => canonical[id]), points,
          normal: normal.map(x => x / area), edgeLength,
          min: [0, 1, 2].map(axis => Math.min(...points.map(p => p[axis]))),
          max: [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis]))) });
      }
      if (offset % 6144 === 0) {
        progress = 0.15 * offset / Math.max(1, indices.length);
        if (!await checkpoint(false)) return finish(false);
      }
    }
    if (triangles.length < 2) return finish(true);

    // Median-split BVH: no all-pairs allocation and no global quadratic scan.
    async function build(items) {
      const node = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], maxId: -1 };
      for (const triangle of items) {
        for (let axis = 0; axis < 3; axis++) {
          node.min[axis] = Math.min(node.min[axis], triangle.min[axis]);
          node.max[axis] = Math.max(node.max[axis], triangle.max[axis]);
        }
        node.maxId = Math.max(node.maxId, triangle.id);
      }
      if (!await checkpoint(false)) return null;
      if (items.length <= 8) node.items = items;
      else {
        let axis = 0;
        for (let k = 1; k < 3; k++) if (node.max[k] - node.min[k] > node.max[axis] - node.min[axis]) axis = k;
        items.sort((a, b) => (a.min[axis] + a.max[axis]) - (b.min[axis] + b.max[axis]));
        const middle = Math.floor(items.length / 2);
        node.left = await build(items.slice(0, middle));
        if (aborted) return null;
        node.right = await build(items.slice(middle));
      }
      return node;
    }
    const tree = await build(triangles.slice());
    if (aborted) return finish(false);
    progress = 0.25;
    if (!await checkpoint(true)) return finish(false);
    let visits = 0;
    // A cap also bounds work for pathological meshes with almost every AABB
    // overlapping; reaching either cap is explicitly reported as incomplete.
    const maxVisits = Math.max(1000000, Math.min(20000000, maxPairs * 30));
    for (let i = 0; i < triangles.length; i++) {
      const triangle = triangles[i], stack = [tree];
      while (stack.length) {
        const node = stack.pop();
        if (++visits > maxVisits) return finish(false);
        if (visits % 2048 === 0 && !await checkpoint(false)) return finish(false);
        if (node.maxId <= triangle.id || !overlaps(triangle, node)) continue;
        if (node.items) {
          for (const other of node.items) {
            if (other.id <= triangle.id || !overlaps(triangle, other) || adjacent(triangle, other)) continue;
            if (state.testedPairs >= maxPairs) return finish(false);
            state.testedPairs++;
            if (intersects(triangle, other)) {
              state.pairCount++;
              found.add(triangle.id); found.add(other.id);
            }
          }
        } else { stack.push(node.left, node.right); }
      }
      progress = 0.25 + 0.75 * (i + 1) / triangles.length;
    }
    if (!await checkpoint(false)) return finish(false);
    progress = 1;
    onProgress({ progress, testedPairs: state.testedPairs, pairCount: state.pairCount, degenerateCount: state.degenerateCount });
    return finish(true);
  }

  return Object.freeze({ check });
}));
