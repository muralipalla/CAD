(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SurfaceCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const number = (x) => Number(x.toFixed(2)).toString();
  function settings(points, mode, order) {
    const size = Math.sqrt(points.length);
    if (![4, 5, 6].includes(size) || !Number.isInteger(order) || order < 2 || order > size || !["clamped", "open"].includes(mode)) {
      throw new RangeError("Choose a 4×4, 5×5 or 6×6 grid, a valid order, and clamped or open knots.");
    }
    return size;
  }
  function python(points, mode = "clamped", order = 4) {
    const size = settings(points, mode, order);
    const clamped = mode === "clamped";
    const title = clamped ? "Clamped" : "Open (unclamped)";
    const rows = points.map((p, index) => `    [${[p.x, p.y, p.z].map(number).join(", ")}],  # P${index % size}${Math.floor(index / size)}`).join("\n");
    return `# ${title} B-spline surface. Requires numpy and matplotlib.
# Input order: i changes first, then j; P00 through P${size - 1}${size - 1}.
# c = control points per direction; m = order; n = m - 1 = degree.
import numpy as np
import matplotlib.pyplot as plt

c, m = ${size}, ${order}
spans = c - m + 1
U = np.array(${clamped ? "[0.0]*m + [i/spans for i in range(1, spans)] + [1.0]*m" : "[(i-m+1)/spans for i in range(c+m)]"})
V = U.copy()  # Both directions use the same knots and order.
points = np.array([
${rows}
], dtype=float)
if points.shape != (c*c, 3):
    raise ValueError(f"The control net must contain {c*c} three-dimensional points.")
P = points.reshape(c, c, 3)  # P[j, i] stores the point labelled P_ij.

def basis(t, knots):
    # At t = 1, take the limit from the last active knot span.
    values = np.array([float(i == c-1 if t == 1 else knots[i] <= t < knots[i+1])
                       for i in range(len(knots)-1)])
    for current_order in range(2, m+1):
        next_values = np.zeros(len(values)-1)
        for i in range(len(next_values)):
            left = knots[i+current_order-1] - knots[i]
            right = knots[i+current_order] - knots[i+1]
            if left:
                next_values[i] += (t-knots[i])/left * values[i]
            if right:
                next_values[i] += (knots[i+current_order]-t)/right * values[i+1]
        values = next_values
    return values

# 60 divisions include every internal knot for all supported grids/orders.
parameters = np.linspace(0, 1, 61)
Bu = [basis(t, U) for t in parameters]
Bv = [basis(t, V) for t in parameters]
S = np.zeros((len(parameters), len(parameters), 3))
for q, bv in enumerate(Bv):
    for p, bu in enumerate(Bu):
        for j in range(c):
            for i in range(c):
                S[q, p] += bu[i] * bv[j] * P[j, i]

fig = plt.figure()
ax = fig.add_subplot(111, projection="3d")
ax.plot_surface(S[:, :, 0], S[:, :, 1], S[:, :, 2],
                color="skyblue", alpha=0.85, edgecolor="steelblue", linewidth=0.3,
                rstride=1, cstride=1)
for j in range(c):
    ax.plot(P[j, :, 0], P[j, :, 1], P[j, :, 2], color="goldenrod")
for i in range(c):
    ax.plot(P[:, i, 0], P[:, i, 1], P[:, i, 2], color="goldenrod")
ax.scatter(points[:, 0], points[:, 1], points[:, 2], color="tomato")
for j in range(c):
    for i in range(c):
        ax.text(*P[j, i], f"P{i}{j}")
ax.set(xlabel="x", ylabel="y", zlabel="z", title=f"${title} B-spline surface: order {m}, degree {m-1}")
ax.set_xlim(0, 10); ax.set_ylim(0, 10); ax.set_zlim(-5, 5)
ax.set_box_aspect((1, 1, 1))
plt.show()
`;
  }
  function matlab(points, mode = "clamped", order = 4) {
    const size = settings(points, mode, order);
    const clamped = mode === "clamped";
    const title = clamped ? "Clamped" : "Open (unclamped)";
    const rows = points.map((p, index) => `    ${[p.x, p.y, p.z].map(number).join(" ")}; % P${index % size}${Math.floor(index / size)}`).join("\n");
    return `% ${title} B-spline surface; no spline toolbox required.
% Input order: i changes first, then j; P00 through P${size - 1}${size - 1}.
% c = control points per direction; m = order; n = m - 1 = degree.
c = ${size}; m = ${order};
spans = c - m + 1;
U = ${clamped ? "[zeros(1,m), (1:spans-1)/spans, ones(1,m)]" : "((0:c+m-1)-m+1)/spans"};
V = U; % Both directions use the same knots and order.
points = [
${rows}
];
assert(isequal(size(points), [c*c 3]), 'The control net must contain c*c points.');
% P(i+1,j+1,:) stores the point labelled P_ij.
P = reshape(points, [c c 3]);
% 60 divisions include every internal knot for all supported grids/orders.
parameters = linspace(0,1,61);
S = zeros(numel(parameters),numel(parameters),3);
Bu = zeros(numel(parameters),c); Bv = Bu;
for k = 1:numel(parameters)
    Bu(k,:) = basis_values(parameters(k),U,c,m);
    Bv(k,:) = basis_values(parameters(k),V,c,m);
end
for q = 1:numel(parameters)
    bv = Bv(q,:);
    for p = 1:numel(parameters)
        bu = Bu(p,:);
        for j = 1:c
            for i = 1:c
                S(q,p,:) = S(q,p,:) + bu(i)*bv(j)*P(i,j,:);
            end
        end
    end
end
figure;
surf(S(:,:,1), S(:,:,2), S(:,:,3), 'FaceColor', [0.46 0.77 0.93], ...
     'FaceAlpha', 0.85, 'EdgeColor', [0.14 0.30 0.44]);
hold on;
for j = 1:c
    plot3(P(:,j,1), P(:,j,2), P(:,j,3), '-', 'Color', [0.85 0.65 0.13]);
end
for i = 1:c
    plot3(P(i,:,1), P(i,:,2), P(i,:,3), '-', 'Color', [0.85 0.65 0.13]);
end
scatter3(points(:,1), points(:,2), points(:,3), 40, 'filled');
for j = 0:c-1
    for i = 0:c-1
        p = points(c*j+i+1,:);
        text(p(1),p(2),p(3),sprintf('P%d%d',i,j));
    end
end
xlabel('x'); ylabel('y'); zlabel('z');
title(sprintf('${title} B-spline surface: order %d, degree %d',m,m-1));
axis equal; xlim([0 10]); ylim([0 10]); zlim([-5 5]);
grid on; view(3); rotate3d on;

function values = basis_values(t,U,c,m)
    values = zeros(1,numel(U)-1);
    if t == 1
        values(c) = 1; % Limit from the last active knot span.
    else
        values = double(U(1:end-1) <= t & t < U(2:end));
    end
    for current_order = 2:m
        next_values = zeros(1,numel(values)-1);
        for i = 1:numel(next_values)
            left = U(i+current_order-1)-U(i);
            right = U(i+current_order)-U(i+1);
            if left ~= 0
                next_values(i) = next_values(i)+(t-U(i))/left*values(i);
            end
            if right ~= 0
                next_values(i) = next_values(i)+(U(i+current_order)-t)/right*values(i+1);
            end
        end
        values = next_values;
    end
end
`;
  }
  return { python, matlab };
});
