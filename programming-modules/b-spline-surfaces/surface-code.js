(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SurfaceCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const number = (x) => Number(x.toFixed(2)).toString();
  function python(points, mode = "clamped") {
    const clamped = mode === "clamped";
    const title = clamped ? "Clamped" : "Open (unclamped)";
    const rows = points.map((p, index) => `    [${[p.x, p.y, p.z].map(number).join(", ")}],  # P${index % 4}${Math.floor(index / 4)}`).join("\n");
    return `# ${title} bicubic B-spline surface. Requires numpy and matplotlib.
# Input order: P00, P10, P20, P30, P01, ..., P33.
# U = V = ${clamped ? "[0, 0, 0, 0, 1, 1, 1, 1]" : "[-3, -2, -1, 0, 1, 2, 3, 4]"}; degree 3, order 4.
import numpy as np
import matplotlib.pyplot as plt

points = np.array([
${rows}
], dtype=float)
if points.shape != (16, 3):
    raise ValueError("The control net must contain 16 three-dimensional points.")
P = points.reshape(4, 4, 3)  # P[j, i] stores the point labelled P_ij.

def basis(t):
    return np.array(${clamped ? "[(1-t)**3, 3*t*(1-t)**2, 3*t**2*(1-t), t**3]" : "[(1-t)**3, 3*t**3-6*t**2+4,\n                     -3*t**3+3*t**2+3*t+1, t**3]"})${clamped ? "" : " / 6"}

parameters = np.linspace(0, 1, 41)
S = np.zeros((41, 41, 3))
for q, v in enumerate(parameters):
    for p, u in enumerate(parameters):
        for j in range(4):
            for i in range(4):
                S[q, p] += basis(u)[i] * basis(v)[j] * P[j, i]

fig = plt.figure()
ax = fig.add_subplot(111, projection="3d")
ax.plot_surface(S[:, :, 0], S[:, :, 1], S[:, :, 2],
                color="skyblue", alpha=0.85, edgecolor="steelblue", linewidth=0.3)
for j in range(4):
    ax.plot(P[j, :, 0], P[j, :, 1], P[j, :, 2], color="goldenrod")
for i in range(4):
    ax.plot(P[:, i, 0], P[:, i, 1], P[:, i, 2], color="goldenrod")
ax.scatter(points[:, 0], points[:, 1], points[:, 2], color="tomato")
for j in range(4):
    for i in range(4):
        ax.text(*P[j, i], f"P{i}{j}")
ax.set(xlabel="x", ylabel="y", zlabel="z", title="${title} bicubic B-spline surface")
ax.set_xlim(0, 10); ax.set_ylim(0, 10); ax.set_zlim(-5, 5)
ax.set_box_aspect((1, 1, 1))
plt.show()
`;
  }
  function matlab(points, mode = "clamped") {
    const clamped = mode === "clamped";
    const title = clamped ? "Clamped" : "Open (unclamped)";
    const rows = points.map((p, index) => `    ${[p.x, p.y, p.z].map(number).join(" ")}; % P${index % 4}${Math.floor(index / 4)}`).join("\n");
    return `% ${title} bicubic B-spline surface; no spline toolbox required.
% Input order: P00, P10, P20, P30, P01, ..., P33.
% U = V = ${clamped ? "[0 0 0 0 1 1 1 1]" : "[-3 -2 -1 0 1 2 3 4]"}; degree 3, order 4.
points = [
${rows}
];
assert(isequal(size(points), [16 3]), 'The control net must contain 16 points.');
% P(i+1,j+1,:) stores the point labelled P_ij.
P = reshape(points, [4 4 3]);
basis = @(t) ${clamped ? "[(1-t)^3, 3*t*(1-t)^2, 3*t^2*(1-t), t^3]" : "[(1-t)^3, 3*t^3-6*t^2+4, ...\n               -3*t^3+3*t^2+3*t+1, t^3] / 6"};
parameters = linspace(0,1,41);
S = zeros(41,41,3);
for q = 1:41
    bv = basis(parameters(q));
    for p = 1:41
        bu = basis(parameters(p));
        for j = 1:4
            for i = 1:4
                S(q,p,:) = S(q,p,:) + bu(i)*bv(j)*P(i,j,:);
            end
        end
    end
end
figure;
surf(S(:,:,1), S(:,:,2), S(:,:,3), 'FaceColor', [0.46 0.77 0.93], ...
     'FaceAlpha', 0.85, 'EdgeColor', [0.14 0.30 0.44]);
hold on;
for j = 1:4
    plot3(P(:,j,1), P(:,j,2), P(:,j,3), '-', 'Color', [0.85 0.65 0.13]);
end
for i = 1:4
    plot3(P(i,:,1), P(i,:,2), P(i,:,3), '-', 'Color', [0.85 0.65 0.13]);
end
scatter3(points(:,1), points(:,2), points(:,3), 40, 'filled');
for j = 0:3
    for i = 0:3
        p = points(4*j+i+1,:);
        text(p(1),p(2),p(3),sprintf('P%d%d',i,j));
    end
end
xlabel('x'); ylabel('y'); zlabel('z');
title('${title} bicubic B-spline surface');
axis equal; xlim([0 10]); ylim([0 10]); zlim([-5 5]);
grid on; view(3); rotate3d on;
`;
  }
  return { python, matlab };
});
