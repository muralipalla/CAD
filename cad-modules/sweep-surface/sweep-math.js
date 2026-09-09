/* General sweep geometry. No dynamic code evaluation or external dependencies. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SweepMath = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMIT = 10000;
  const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'log']);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mul = (a, k) => a.map(x => x * k);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const norm = a => Math.hypot(...a);
  const unit = a => mul(a, 1 / norm(a));

  function finite(value, label) {
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) {
      throw new Error(label || 'Expression produced an undefined or excessively large value.');
    }
    return value;
  }

  /** Compile the small mathematical language into an AST, never JavaScript. */
  function compile(expression, variable) {
    if (variable !== 'u' && variable !== 'v') throw new Error('The parameter must be u or v.');
    if (typeof expression !== 'string' || !expression.trim()) throw new Error('Enter an expression for every coordinate.');
    if (expression.length > 256) throw new Error('Keep each expression within 256 characters.');
    const tokens = [];
    let offset = 0;
    while (offset < expression.length) {
      const rest = expression.slice(offset);
      const space = /^\s+/.exec(rest);
      if (space) { offset += space[0].length; continue; }
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      const name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
      if (number) { tokens.push({ type: 'number', value: finite(Number(number[0])) }); offset += number[0].length; }
      else if (name) { tokens.push({ type: 'name', value: name[0] }); offset += name[0].length; }
      else if ('+-*/^()'.includes(rest[0])) { tokens.push({ type: rest[0] }); offset++; }
      else throw new Error('Unsupported character at position ' + (offset + 1) + '. Use mathematical expressions only.');
      if (tokens.length > 160) throw new Error('This expression is too complex; use fewer terms.');
    }
    tokens.push({ type: 'end' });
    let cursor = 0, depth = 0;
    const take = type => tokens[cursor].type === type ? (cursor++, true) : false;
    function guarded(fn) {
      if (++depth > 32) throw new Error('This expression has too many nested terms.');
      const result = fn();
      depth--;
      return result;
    }
    function primary() {
      const token = tokens[cursor++];
      if (token.type === 'number') return { kind: 'constant', value: token.value };
      if (token.type === 'name') {
        if (token.value === variable) return { kind: 'variable' };
        if (token.value === 'pi' || token.value === 'e') return { kind: 'constant', value: token.value === 'pi' ? Math.PI : Math.E };
        if (!FUNCTIONS.has(token.value)) throw new Error('Unknown name “' + token.value + '”. Use ' + variable + ', pi, e, or a supported function.');
        if (!take('(')) throw new Error('Use parentheses after ' + token.value + '.');
        const argument = guarded(sum);
        if (!take(')')) throw new Error('A closing parenthesis is missing.');
        return { kind: 'function', name: token.value, argument };
      }
      if (token.type === '(') {
        const inner = guarded(sum);
        if (!take(')')) throw new Error('A closing parenthesis is missing.');
        return inner;
      }
      throw new Error('Expected a number, ' + variable + ', or a parenthesized expression.');
    }
    function power() {
      const left = primary();
      return take('^') ? { kind: 'binary', operator: '^', left, right: guarded(unary) } : left;
    }
    function unary() {
      if (take('+')) return guarded(unary);
      if (take('-')) return { kind: 'negative', argument: guarded(unary) };
      return power();
    }
    function product() {
      let left = unary();
      while (tokens[cursor].type === '*' || tokens[cursor].type === '/') {
        const operator = tokens[cursor++].type;
        left = { kind: 'binary', operator, left, right: unary() };
      }
      return left;
    }
    function sum() {
      let left = product();
      while (tokens[cursor].type === '+' || tokens[cursor].type === '-') {
        const operator = tokens[cursor++].type;
        left = { kind: 'binary', operator, left, right: product() };
      }
      return left;
    }
    const tree = sum();
    if (tokens[cursor].type !== 'end') throw new Error('Unexpected term. Use * for multiplication, for example 2*pi*' + variable + '.');

    // Forward differentiation supplies reliable tangents even at inflections.
    function evaluate(node, parameter, derivative) {
      if (node.kind === 'constant') return [node.value, 0];
      if (node.kind === 'variable') return [parameter, derivative ? 1 : 0];
      if (node.kind === 'negative') return evaluate(node.argument, parameter, derivative).map(x => -x);
      let value, slope;
      if (node.kind === 'function') {
        const [a, da] = evaluate(node.argument, parameter, derivative);
        switch (node.name) {
          case 'sin': value = Math.sin(a); slope = Math.cos(a) * da; break;
          case 'cos': value = Math.cos(a); slope = -Math.sin(a) * da; break;
          case 'tan': value = Math.tan(a); slope = da / (Math.cos(a) ** 2); break;
          case 'sqrt': value = Math.sqrt(a); slope = da === 0 ? 0 : da / (2 * value); break;
          case 'abs': value = Math.abs(a); slope = Math.sign(a) * da; break;
          case 'exp': value = Math.exp(a); slope = value * da; break;
          case 'log': value = Math.log(a); slope = da / a; break;
        }
      } else {
        const [a, da] = evaluate(node.left, parameter, derivative);
        const [b, db] = evaluate(node.right, parameter, derivative);
        switch (node.operator) {
          case '+': value = a + b; slope = da + db; break;
          case '-': value = a - b; slope = da - db; break;
          case '*': value = a * b; slope = da * b + a * db; break;
          case '/': value = a / b; slope = (da * b - a * db) / (b * b); break;
          case '^':
            value = Math.pow(a, b);
            slope = db === 0 ? (b === 0 || da === 0 ? 0 : b * Math.pow(a, b - 1) * da) : value * (db * Math.log(a) + b * da / a);
            break;
        }
      }
      return [finite(value), derivative ? finite(slope, 'The path derivative is undefined or too large. Use a regular, differentiable path.') : 0];
    }
    const fn = parameter => evaluate(tree, finite(parameter), false)[0];
    fn.derivative = parameter => evaluate(tree, finite(parameter), true)[1];
    return fn;
  }

  function rotate(vector, axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle), axial = dot(axis, vector) * (1 - c);
    const perpendicular = cross(axis, vector);
    return vector.map((x, i) => x * c + perpendicular[i] * s + axis[i] * axial);
  }

  function firstNormal(tangent) {
    let least = 0;
    for (let i = 1; i < 3; i++) if (Math.abs(tangent[i]) < Math.abs(tangent[least])) least = i;
    const axis = [0, 0, 0];
    axis[least] = 1;
    return unit(sub(axis, mul(tangent, dot(axis, tangent))));
  }

  function transport(normal, from, to) {
    const axis = cross(from, to), sine = norm(axis), cosine = Math.max(-1, Math.min(1, dot(from, to)));
    const moved = sine > 1e-12 ? rotate(normal, mul(axis, 1 / sine), Math.atan2(sine, cosine)) : normal.slice();
    const projected = sub(moved, mul(to, dot(moved, to)));
    return norm(projected) > 1e-10 ? unit(projected) : firstNormal(to);
  }

  function build(options) {
    options = options || {};
    const pathSource = options.path || ['0', '0', '4*u-2'];
    const profileSource = options.profile || ['cos(2*pi*v)', 'sin(2*pi*v)'];
    if (!Array.isArray(pathSource) || pathSource.length !== 3 || !Array.isArray(profileSource) || profileSource.length !== 2) {
      throw new Error('The path needs three coordinates and the profile needs two.');
    }
    const pathFunctions = pathSource.map((source, i) => {
      try { return compile(source, 'u'); } catch (error) { throw new Error('Path ' + 'xyz'[i] + ': ' + error.message); }
    });
    const profileFunctions = profileSource.map((source, i) => {
      try { return compile(source, 'v'); } catch (error) { throw new Error('Profile ' + 'ab'[i] + ': ' + error.message); }
    });
    const mode = options.mode === undefined ? 'transport' : options.mode;
    if (mode !== 'transport' && mode !== 'translate') throw new Error('Choose transport or translate mode.');
    function number(name, defaultValue, min, max, integer) {
      const value = options[name] === undefined ? defaultValue : options[name];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        throw new Error(name + ' must be ' + (integer ? 'an integer ' : '') + 'between ' + min + ' and ' + max + '.');
      }
      return value;
    }
    const scale = number('scale', 1, 0.0001, 100, false);
    const taper = number('taper', 1, 0, 20, false);
    const twist = number('twist', 0, -3600, 3600, false) * Math.PI / 180;
    const pathSegments = number('pathSegments', 160, 8, 512, true);
    const profileSegments = number('profileSegments', 64, 2, 256, true);
    function parameter(value, name) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(name + ' must lie between 0 and 1.');
      return value;
    }
    function coordinate(values) {
      if (values.some(x => !Number.isFinite(x) || Math.abs(x) > LIMIT)) throw new Error('Keep all curve and surface coordinates within ±10,000.');
      return values;
    }
    function pathAt(u) { return coordinate(pathFunctions.map(fn => fn(u))); }
    function profileAt(v) { return coordinate(profileFunctions.map(fn => fn(parameter(v, 'v')))); }
    const path = Array.from({ length: pathSegments + 1 }, (_, i) => pathAt(i / pathSegments));
    const profile = Array.from({ length: profileSegments + 1 }, (_, j) => profileAt(j / profileSegments));
    const pathMin = [0, 1, 2].map(k => Math.min(...path.map(p => p[k])));
    const pathMax = [0, 1, 2].map(k => Math.max(...path.map(p => p[k])));
    const extent = norm(sub(pathMax, pathMin));
    if (extent < 1e-8) throw new Error('The path is constant or too small. Give it a nonzero length.');
    const speedTolerance = Math.max(1e-10, extent * 1e-8);
    function tangentAt(u) {
      const velocity = pathFunctions.map(fn => fn.derivative(u));
      if (norm(velocity) <= speedTolerance) throw new Error('The path stops at u=' + u.toFixed(4) + '. Use a regular path with nonzero speed.');
      return unit(velocity);
    }
    // Midpoints supplement mesh-vertex checks; arbitrary singularities can still escape sampling.
    for (let i = 0; i < pathSegments; i++) {
      const u = (i + 0.5) / pathSegments;
      pathAt(u);
      tangentAt(u);
    }
    const tangents = path.map((_, i) => tangentAt(i / pathSegments));
    const rawNormals = [firstNormal(tangents[0])];
    const warnings = [];
    let abrupt = false;
    for (let i = 1; i <= pathSegments; i++) {
      if (dot(tangents[i - 1], tangents[i]) < 0.5) abrupt = true;
      rawNormals.push(transport(rawNormals[i - 1], tangents[i - 1], tangents[i]));
    }
    if (abrupt) warnings.push('The path turns sharply between samples; increase resolution or smooth any corners.');
    const closedPath = norm(sub(path[0], path[pathSegments])) <= Math.max(1e-8, extent * 1e-6);
    const profileExtent = Math.max(...profile.map(p => Math.hypot(p[0] - profile[0][0], p[1] - profile[0][1])));
    if (profileExtent < 1e-8) throw new Error('The profile is constant or too small. Give it a nonzero length.');
    const closedProfile = Math.hypot(profile[0][0] - profile[profileSegments][0], profile[0][1] - profile[profileSegments][1]) <= Math.max(1e-8, profileExtent * 1e-6);
    const tangentSeam = dot(tangents[0], tangents[pathSegments]) > 1 - 1e-6;
    let seamCorrection = 0;
    if (mode === 'transport' && closedPath && tangentSeam) {
      const end = rawNormals[pathSegments], start = rawNormals[0];
      seamCorrection = Math.atan2(dot(tangents[0], cross(end, start)), dot(end, start));
    }
    if (closedPath && !tangentSeam) warnings.push('The path endpoints meet with different tangents, creating a corner at the seam.');
    if (closedPath && (Math.abs(Math.sin(twist / 2)) > 1e-6 || Math.abs(taper - 1) > 1e-6)) {
      warnings.push('This closed path has an open parameter seam: total twist or end scale does not match the start. Symmetric profiles may meet after reparameterization.');
    }
    if (taper === 0) warnings.push('The end scale is zero: the last profile collapses to a point and the surface has a singular tip.');
    warnings.push('Validation uses sampled geometry; self-intersections and local singularities are not fully tested.');

    function frame(u) {
      parameter(u, 'u');
      const point = pathAt(u), tangent = tangentAt(u);
      const theta = twist * u;
      if (mode === 'translate') {
        return { point, tangent, normal: [Math.cos(theta), Math.sin(theta), 0], binormal: [-Math.sin(theta), Math.cos(theta), 0] };
      }
      const i = Math.min(pathSegments, Math.floor(u * pathSegments));
      let normal = transport(rawNormals[i], tangents[i], tangent);
      normal = rotate(normal, tangent, seamCorrection * u + theta);
      const binormal = unit(cross(tangent, normal));
      normal = unit(cross(binormal, tangent));
      return { point, tangent, normal, binormal };
    }
    function point(u, v) {
      const f = frame(u), p = profileAt(v), size = scale * (1 + (taper - 1) * u);
      return coordinate(f.point.map((x, k) => x + size * (p[0] * f.normal[k] + p[1] * f.binormal[k])));
    }
    const frames = path.map((_, i) => frame(i / pathSegments));
    const positions = new Float32Array((pathSegments + 1) * (profileSegments + 1) * 3);
    const vertexCount = positions.length / 3;
    const IndexArray = vertexCount > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexArray(pathSegments * profileSegments * 6);
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let i = 0; i <= pathSegments; i++) {
      const size = scale * (1 + (taper - 1) * i / pathSegments), f = frames[i];
      for (let j = 0; j <= profileSegments; j++) {
        const p = profile[j];
        const position = coordinate(f.point.map((x, k) => x + size * (p[0] * f.normal[k] + p[1] * f.binormal[k])));
        const offset = (i * (profileSegments + 1) + j) * 3;
        positions.set(position, offset);
        for (let k = 0; k < 3; k++) {
          bounds.min[k] = Math.min(bounds.min[k], position[k]);
          bounds.max[k] = Math.max(bounds.max[k], position[k]);
        }
      }
    }
    let index = 0;
    for (let i = 0; i < pathSegments; i++) {
      for (let j = 0; j < profileSegments; j++) {
        const a = i * (profileSegments + 1) + j, b = a + profileSegments + 1;
        // Winding follows dS/du cross dS/dv; surfaces are displayed double-sided.
        indices.set([a, b, b + 1, a, b + 1, a + 1], index);
        index += 6;
      }
    }
    return { positions, indices, path, profile, frames, bounds, closedPath, closedProfile, warnings, point, frame, profileAt };
  }

  return Object.freeze({ compile, build });
}));
