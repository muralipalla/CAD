# CAD

A responsive, static learning website for computer-aided design fundamentals, geometry programming, and self-assessment.

## Sections

- **CAD Modules** — design intent, sketch constraints, drawings, dimensions, tolerances, and feature-based modelling.
- **Programming Modules** — coordinates, vectors, transforms, parametric patterns, and CAD automation.
- **Self Assessment Quizzes** — short concept checks with immediate explanations.

The first release includes two interactive modules and one scored quiz:

- Sketch Constraints
- Parametric Circular Patterns
- CAD Foundations Quiz

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

## Accessibility and compatibility

The site uses semantic landmarks, keyboard-visible focus states, skip links, labelled controls, live regions for activity feedback, responsive layouts, reduced-motion support, and no external runtime dependencies.

## License

MIT © 2026 Murali Palla.
