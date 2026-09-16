(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoonsCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const number = (x) => Number(x.toFixed(2)).toString();
  function rows(points, language) {
    if (!Array.isArray(points) || points.length !== 12) throw new RangeError("A cubic Coons patch requires 12 unique boundary control points.");
    const labels = ["P00", "P10", "P01", "P11", "C0_1", "C0_2", "C1_1", "C1_2", "D0_1", "D0_2", "D1_1", "D1_2"];
    return points.map((p, i) => language === "python"
      ? `    [${[p.x,p.y,p.z].map(number).join(", ")}],  # ${labels[i]}`
      : `    ${[p.x,p.y,p.z].map(number).join(" ")}; % ${labels[i]}`).join("\n");
  }
  function python(points) {
    return `# Bilinearly blended Coons patch with cubic Bezier boundaries.
import numpy as np
import matplotlib.pyplot as plt

Q = np.array([
${rows(points, "python")}
], dtype=float)
C0, C1 = Q[[0,4,5,2]], Q[[1,6,7,3]]
D0, D1 = Q[[0,8,9,1]], Q[[2,10,11,3]]
P00, P10, P01, P11 = Q[:4]

def bezier(P, t):
    s = 1-t
    return s**3*P[0] + 3*s*s*t*P[1] + 3*s*t*t*P[2] + t**3*P[3]

def coons(u, v):
    ruled_c = (1-u)*bezier(C0,v) + u*bezier(C1,v)
    ruled_d = (1-v)*bezier(D0,u) + v*bezier(D1,u)
    bilinear = ((1-u)*(1-v)*P00 + u*(1-v)*P10
                + (1-u)*v*P01 + u*v*P11)
    return ruled_c + ruled_d - bilinear

t = np.linspace(0,1,61)
S = np.array([[coons(u,v) for u in t] for v in t])
fig = plt.figure()
ax = fig.add_subplot(111, projection="3d")
ax.plot_surface(S[:,:,0], S[:,:,1], S[:,:,2], color="skyblue",
                alpha=.88, edgecolor="steelblue", linewidth=.25)
for curve in (C0,C1,D0,D1):
    B = np.array([bezier(curve,q) for q in t])
    ax.plot(*B.T, color="tomato", linewidth=2.5)
    ax.plot(*curve.T, "--o", color="goldenrod", markersize=4)
ax.set(xlabel="x", ylabel="y", zlabel="z", title="Coons patch")
ax.set_box_aspect((1,1,1)); plt.show()
`;
  }
  function matlab(points) {
    return `% Bilinearly blended Coons patch with cubic Bezier boundaries.
Q = [
${rows(points, "matlab")}
];
C0 = Q([1 5 6 3],:); C1 = Q([2 7 8 4],:);
D0 = Q([1 9 10 2],:); D1 = Q([3 11 12 4],:);
P00 = Q(1,:); P10 = Q(2,:); P01 = Q(3,:); P11 = Q(4,:);
t = linspace(0,1,61); S = zeros(numel(t),numel(t),3);
for j = 1:numel(t)
    v = t(j);
    for i = 1:numel(t)
        u = t(i);
        ruledC = (1-u)*bezier3(C0,v) + u*bezier3(C1,v);
        ruledD = (1-v)*bezier3(D0,u) + v*bezier3(D1,u);
        B = (1-u)*(1-v)*P00 + u*(1-v)*P10 + (1-u)*v*P01 + u*v*P11;
        S(j,i,:) = ruledC + ruledD - B;
    end
end
figure; surf(S(:,:,1),S(:,:,2),S(:,:,3),'FaceColor',[.46 .77 .93], ...
    'FaceAlpha',.88,'EdgeColor',[.14 .30 .44]); hold on;
for k = 1:4
    curves = {C0,C1,D0,D1}; curve = curves{k};
    B = zeros(numel(t),3);
    for i = 1:numel(t), B(i,:) = bezier3(curve,t(i)); end
    plot3(B(:,1),B(:,2),B(:,3),'Color',[.9 .3 .22],'LineWidth',2.5);
    plot3(curve(:,1),curve(:,2),curve(:,3),'--o','Color',[.85 .65 .13]);
end
xlabel('x'); ylabel('y'); zlabel('z'); title('Coons patch'); axis equal; grid on; view(3);

function p = bezier3(P,t)
    s = 1-t;
    p = s^3*P(1,:) + 3*s^2*t*P(2,:) + 3*s*t^2*P(3,:) + t^3*P(4,:);
end
`;
  }
  return { python, matlab };
});
