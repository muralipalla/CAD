# CAD

A responsive, static learning website for computer-aided design fundamentals, geometry programming, and self-assessment.

## Sections

- **Theory** — course notes on geometric transformations, curves, B-splines, surfaces, and solid modeling, plus interactive sketch constraints.
- **Programming Modules** — synchronized Python/MATLAB code and JavaScript graphics for interpolation, Bezier curves, Hermite curves, B-spline basis functions, B-splines/NURBS, and B-spline surfaces.
- **Self Assessment Quizzes** — a placeholder for questions that will be added separately.

The site includes:

- five teaching modules converted from the course LaTeX source;
- six interactive curve and surface laboratories with Python/MATLAB code views;
- the Sketch Constraints and Parametric Circular Patterns activities; and
- a self-assessment placeholder ready for future questions.

## Run locally

No build step or package installation is required. Serve the repository root with any local HTTP server, or open `index.html` for a basic preview.

For example, with Python installed:

```text
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## GitHub Pages

All internal URLs are relative, so the site works from a GitHub Pages project subpath. The included workflow publishes the repository root whenever the `main` branch is updated.

After creating the repository on GitHub:

1. Push the project to the `main` branch.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.

## Structure

```text
assets/                       Shared styles and small site-wide script
cad-modules/                  CAD lesson hub and activities
programming-modules/          Programming lesson hub and activities
self-assessment-quizzes/      Quiz hub and assessments
.github/workflows/pages.yml   GitHub Pages deployment
```

The B-spline surface lab at `programming-modules/b-spline-surfaces/` captures 16 points
in `P00, P10, P20, P30, P01, ..., P33` order. After each x–y placement, set z and
confirm the point. `surface-three.js` owns its independent Three.js visualization;
`surface-math.js` evaluates the uniform bicubic patch and manages point capture.
The knot vectors are `[-3,-2,-1,0,1,2,3,4]` in both directions, with active domain
`[0,1] × [0,1]`. Run the numerical and capture tests with `node --test tests/*.test.js`.

## Accessibility and compatibility

The site uses semantic landmarks, keyboard-visible focus states, skip links, labelled controls, live regions for activity feedback, responsive layouts, and reduced-motion support. Teaching-module equations are rendered by a pinned MathJax script from jsDelivr; the curve laboratories use Canvas 2D JavaScript, and the home-page surface and B-spline surface lab use a locally bundled Three.js runtime.

## License

MIT © 2026 Murali Palla.
