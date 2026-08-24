#!/usr/bin/env python3
"""Convert the CAAD LaTeX notes into deterministic, source-faithful HTML pages.

This converter is intentionally scoped to CADNotes1.tex.  It expands only the
nine inputs used by that root document, maps the environments present in the
source to semantic HTML, leaves mathematics in TeX form for MathJax, and omits
the source question-bank and computational-exercise sections.
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
import unicodedata
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path


ACTIVE_INPUTS = (
    "chapters/sec1_geom_transf",
    "chapters/sec1a_twoD_rotations",
    "chapters/sec1b_threeD_rotations",
    "chapters/sec1c_eulerangles",
    "chapters/sec1d_quaternions",
    "chapters/sec1e_projections",
    "chapters/sec2_curves",
    "chapters/sec2a_bezier_curves",
    "chapters/sec2c_bsplines",
)

MODULES = (
    ("Geometric Transformations", "geometric-transformations", 1),
    ("Curves", "curves", 2),
    ("B-Splines", "b-splines", 3),
    ("Surfaces", "surfaces", 4),
    ("Solid Modeling", "solid-modeling", 5),
)

EXCLUDED_SECTIONS = (
    "Short Question Bank",
    "Suggested Computational Exercises",
)

FIGURES = (
    "Projections2.png",
    "BSplines.png",
    "GaussMap2.png",
)

BOX_TITLES = {
    "keybox": "Key Idea",
    "examplebox": "Example",
    "remarkbox": "Remark",
}

NON_MATH_ENVIRONMENTS = (
    "keybox",
    "examplebox",
    "remarkbox",
    "definition",
    "property",
    "enumerate",
    "itemize",
    "figure",
    "tabular",
    "center",
    "minipage",
    "verbatim",
)


def read_utf8(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_utf8(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8", newline="\n")


def strip_comments(source: str) -> str:
    """Remove TeX comments while leaving verbatim blocks untouched."""

    output: list[str] = []
    in_verbatim = False
    for line in source.splitlines():
        if "\\begin{verbatim}" in line:
            in_verbatim = True
            output.append(line)
            continue
        if "\\end{verbatim}" in line:
            in_verbatim = False
            output.append(line)
            continue
        if in_verbatim:
            output.append(line)
            continue

        cut_at: int | None = None
        for index, character in enumerate(line):
            if character != "%":
                continue
            slash_count = 0
            cursor = index - 1
            while cursor >= 0 and line[cursor] == "\\":
                slash_count += 1
                cursor -= 1
            if slash_count % 2 == 0:
                cut_at = index
                break
        output.append(line if cut_at is None else line[:cut_at])
    return "\n".join(output)


def expand_active_inputs(root_tex: Path) -> tuple[str, tuple[str, ...]]:
    source = read_utf8(root_tex)
    seen: list[str] = []
    allowed = set(ACTIVE_INPUTS)

    def replace(match: re.Match[str]) -> str:
        requested = match.group(1).replace("\\", "/").removesuffix(".tex")
        if requested not in allowed:
            raise ValueError(f"Refusing to expand non-active input: {requested}")
        seen.append(requested)
        include_path = root_tex.parent / f"{requested}.tex"
        if not include_path.is_file():
            raise FileNotFoundError(include_path)
        return read_utf8(include_path)

    expanded = re.sub(r"\\input\{([^}]+)\}", replace, source)
    if tuple(seen) != ACTIVE_INPUTS:
        raise ValueError(
            "Active input order changed. "
            f"Expected {ACTIVE_INPUTS!r}, found {tuple(seen)!r}."
        )
    if "\\input{" in expanded:
        raise ValueError("An unexpanded input remains in the document")
    return expanded, tuple(seen)


def document_body(source: str) -> str:
    match = re.search(
        r"\\begin\{document\}(.*?)\\end\{document\}", source, flags=re.DOTALL
    )
    if not match:
        raise ValueError("Could not locate the LaTeX document body")
    return match.group(1)


def split_sections(body: str) -> tuple[str, dict[str, str]]:
    pattern = re.compile(r"(?m)^\\section\{([^{}\n]+)\}\s*$")
    matches = list(pattern.finditer(body))
    if not matches:
        raise ValueError("No top-level sections found")

    preface = body[: matches[0].start()]
    sections: dict[str, str] = {}
    for index, match in enumerate(matches):
        title = match.group(1).strip()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        if title in sections:
            raise ValueError(f"Duplicate top-level section: {title}")
        sections[title] = body[match.end() : end]
    return preface, sections


def extract_balanced(text: str, opening_index: int) -> tuple[str, int]:
    if opening_index >= len(text) or text[opening_index] != "{":
        raise ValueError("Expected opening brace")
    depth = 1
    cursor = opening_index + 1
    while cursor < len(text):
        if text[cursor] == "{" and (cursor == 0 or text[cursor - 1] != "\\"):
            depth += 1
        elif text[cursor] == "}" and (cursor == 0 or text[cursor - 1] != "\\"):
            depth -= 1
            if depth == 0:
                return text[opening_index + 1 : cursor], cursor + 1
        cursor += 1
    raise ValueError("Unbalanced braces")


def command_argument(text: str, command: str) -> str | None:
    location = text.find(command)
    if location < 0:
        return None
    cursor = location + len(command)
    while cursor < len(text) and text[cursor].isspace():
        cursor += 1
    if cursor >= len(text) or text[cursor] != "{":
        return None
    value, _ = extract_balanced(text, cursor)
    return value


def typography(value: str) -> str:
    return value.replace("---", "—").replace("--", "–")


def convert_inline(source: str) -> str:
    """Convert the small set of text-mode commands used by the notes."""

    output: list[str] = []
    cursor = 0
    commands = {
        "\\textbf": ("strong", "strong"),
        "\\texttt": ("code", "code"),
        "\\emph": ("em", "em"),
    }

    while cursor < len(source):
        if source.startswith("\\(", cursor):
            end = source.find("\\)", cursor + 2)
            if end < 0:
                raise ValueError(f"Unclosed inline math: {source[cursor:cursor + 80]!r}")
            output.append(html.escape(source[cursor : end + 2], quote=False))
            cursor = end + 2
            continue

        if source[cursor] == "$":
            end = cursor + 1
            while True:
                end = source.find("$", end)
                if end < 0:
                    raise ValueError(f"Unclosed dollar math: {source[cursor:cursor + 80]!r}")
                slash_count = 0
                check = end - 1
                while check >= 0 and source[check] == "\\":
                    slash_count += 1
                    check -= 1
                if slash_count % 2 == 0:
                    break
                end += 1
            output.append(html.escape(source[cursor : end + 1], quote=False))
            cursor = end + 1
            continue

        matched_command = False
        for command, (start_tag, end_tag) in commands.items():
            if not source.startswith(command, cursor):
                continue
            argument_start = cursor + len(command)
            while argument_start < len(source) and source[argument_start].isspace():
                argument_start += 1
            if argument_start < len(source) and source[argument_start] == "{":
                argument, next_cursor = extract_balanced(source, argument_start)
                output.append(f"<{start_tag}>{convert_inline(argument)}</{end_tag}>")
                cursor = next_cursor
                matched_command = True
                break
        if matched_command:
            continue

        if source.startswith("\\\\", cursor):
            output.append("<br>")
            cursor += 2
            continue

        next_special = len(source)
        candidates = [source.find("\\(", cursor), source.find("$", cursor)]
        candidates.extend(source.find(command, cursor) for command in commands)
        candidates.append(source.find("\\\\", cursor))
        for candidate in candidates:
            if candidate >= 0:
                next_special = min(next_special, candidate)
        if next_special == cursor:
            # Preserve an unknown text-mode command visibly instead of dropping it.
            output.append(html.escape(source[cursor], quote=False))
            cursor += 1
            continue
        chunk = source[cursor:next_special]
        output.append(html.escape(typography(chunk), quote=False))
        cursor = next_special

    return "".join(output)


def latex_to_plain(source: str) -> str:
    replacements = {
        "\\Pi": "Pi",
        "\\pi": "pi",
        "\\theta": "theta",
        "\\phi": "phi",
        "\\psi": "psi",
        "\\chi": "chi",
        "\\kappa": "kappa",
    }
    value = source.replace("\\(", "").replace("\\)", "")
    value = value.replace("$", "")
    for command, replacement in replacements.items():
        value = value.replace(command, replacement)
    previous = None
    while previous != value:
        previous = value
        value = re.sub(r"\\(?:textbf|texttt|emph|mathbf|vec|hat)\s*\{([^{}]*)\}", r"\1", value)
    value = re.sub(r"\\[A-Za-z]+\*?", "", value)
    value = value.replace("{", "").replace("}", "")
    value = typography(value)
    return re.sub(r"\s+", " ", value).strip()


def slugify(source: str) -> str:
    plain = latex_to_plain(source)
    normalized = unicodedata.normalize("NFKD", plain).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or "section"


def collect_environment(
    lines: list[str], start_index: int, environment: str
) -> tuple[str, list[str], int]:
    begin_token = f"\\begin{{{environment}}}"
    end_token = f"\\end{{{environment}}}"
    start_line = lines[start_index]
    suffix = start_line.split(begin_token, 1)[1].strip()
    depth = 1
    inner: list[str] = []
    cursor = start_index + 1

    while cursor < len(lines):
        line = lines[cursor]
        begins = line.count(begin_token)
        ends = line.count(end_token)
        next_depth = depth + begins - ends
        if next_depth <= 0:
            before_end = line.split(end_token, 1)[0]
            if before_end.strip():
                inner.append(before_end)
            return suffix, inner, cursor + 1
        inner.append(line)
        depth = next_depth
        cursor += 1
    raise ValueError(f"Unclosed environment: {environment}")


def split_list_items(lines: list[str]) -> list[list[str]]:
    items: list[list[str]] = []
    current: list[str] | None = None
    depth = 0
    for line in lines:
        stripped = line.lstrip()
        if depth == 0 and stripped.startswith("\\item"):
            if current is not None:
                items.append(current)
            remainder = stripped[len("\\item") :].lstrip()
            current = [remainder] if remainder else []
        elif current is not None:
            current.append(line)
        depth += len(re.findall(r"\\begin\{", line))
        depth -= len(re.findall(r"\\end\{", line))
    if current is not None:
        items.append(current)
    return items


def split_table_cells(row: str) -> list[str]:
    cells: list[str] = []
    current: list[str] = []
    brace_depth = 0
    in_dollar_math = False
    in_paren_math = False
    cursor = 0
    while cursor < len(row):
        if row.startswith("\\(", cursor):
            in_paren_math = True
            current.append("\\(")
            cursor += 2
            continue
        if row.startswith("\\)", cursor):
            in_paren_math = False
            current.append("\\)")
            cursor += 2
            continue
        character = row[cursor]
        if character == "$":
            in_dollar_math = not in_dollar_math
        elif not in_dollar_math and not in_paren_math:
            if character == "{":
                brace_depth += 1
            elif character == "}":
                brace_depth = max(0, brace_depth - 1)
            elif character == "&" and brace_depth == 0:
                cells.append("".join(current).strip())
                current = []
                cursor += 1
                continue
        current.append(character)
        cursor += 1
    cells.append("".join(current).strip())
    return cells


@dataclass(frozen=True)
class Heading:
    level: int
    identifier: str
    title_source: str


class LatexHTMLConverter:
    def __init__(self, source_section_number: int) -> None:
        self.source_section_number = source_section_number
        self.headings: list[Heading] = []
        self._used_ids: dict[str, int] = {}
        self._theorem_counts = {"definition": 0, "property": 0}
        self.unhandled_environments: set[str] = set()

    def unique_id(self, title: str) -> str:
        base = slugify(title)
        count = self._used_ids.get(base, 0) + 1
        self._used_ids[base] = count
        return base if count == 1 else f"{base}-{count}"

    def heading(self, level: int, title: str, *, source_section: bool = False) -> str:
        identifier = self.unique_id(title)
        self.headings.append(Heading(level, identifier, title))
        class_name = ' class="notes-source-section"' if source_section else ""
        return (
            f'<h{level} id="{identifier}"{class_name}>'
            f"{convert_inline(title)}</h{level}>"
        )

    @staticmethod
    def is_block_start(stripped: str) -> bool:
        return bool(
            not stripped
            or re.match(r"\\(?:section|subsection|subsubsection)\*?\{", stripped)
            or stripped == "\\["
            or stripped.startswith("\\begin{")
            or stripped
            in {
                "\\maketitle",
                "\\tableofcontents",
                "\\newpage",
                "\\pagebreak",
                "\\centering",
            }
            or stripped.startswith("\\label{")
        )

    def convert(self, source: str | list[str]) -> str:
        lines = source if isinstance(source, list) else source.splitlines()
        output: list[str] = []
        cursor = 0

        while cursor < len(lines):
            stripped = lines[cursor].strip()
            if not stripped:
                cursor += 1
                continue

            if stripped in {
                "\\maketitle",
                "\\tableofcontents",
                "\\newpage",
                "\\pagebreak",
                "\\centering",
            } or stripped.startswith("\\label{"):
                cursor += 1
                continue

            heading_match = re.match(
                r"^\\(section|subsection|subsubsection)(\*)?\{(.*)\}\s*$", stripped
            )
            if heading_match:
                command = heading_match.group(1)
                title = heading_match.group(3).strip()
                if command == "section":
                    output.append(self.heading(2, title, source_section=True))
                elif command == "subsection":
                    output.append(self.heading(2, title))
                else:
                    output.append(self.heading(3, title))
                cursor += 1
                continue

            if stripped == "\\[":
                math_lines = ["\\["]
                cursor += 1
                while cursor < len(lines) and lines[cursor].strip() != "\\]":
                    math_lines.append(lines[cursor])
                    cursor += 1
                if cursor >= len(lines):
                    raise ValueError("Unclosed display-math delimiter")
                math_lines.append("\\]")
                output.append(
                    '<div class="math-display">'
                    + html.escape("\n".join(math_lines), quote=False)
                    + "</div>"
                )
                cursor += 1
                continue

            begin_match = re.match(r"^\\begin\{([^}]+)\}", stripped)
            if begin_match:
                environment = begin_match.group(1)
                suffix, inner, cursor = collect_environment(
                    lines, cursor, environment
                )
                output.append(self.convert_environment(environment, suffix, inner))
                continue

            paragraph_lines: list[str] = []
            while cursor < len(lines):
                candidate = lines[cursor].strip()
                if self.is_block_start(candidate):
                    break
                paragraph_lines.append(candidate)
                cursor += 1
            if not paragraph_lines:
                raise ValueError(f"Unhandled block line: {lines[cursor]!r}")
            paragraph_source = " ".join(paragraph_lines)
            output.append(f"<p>{convert_inline(paragraph_source)}</p>")

        return "\n".join(part for part in output if part)

    def convert_environment(
        self, environment: str, suffix: str, inner_lines: list[str]
    ) -> str:
        if environment in BOX_TITLES:
            title = BOX_TITLES[environment]
            body = self.convert(inner_lines)
            return (
                f'<aside class="notes-box {environment}">'
                f'<p class="notes-box-title">{html.escape(title)}</p>'
                f'<div class="notes-box-body">{body}</div></aside>'
            )

        if environment in {"definition", "property"}:
            self._theorem_counts[environment] += 1
            number = self._theorem_counts[environment]
            name = environment.title()
            body = self.convert(inner_lines)
            return (
                f'<aside class="notes-box theorem {environment}">'
                f'<p class="notes-box-title">{name} '
                f"{self.source_section_number}.{number}</p>"
                f'<div class="notes-box-body">{body}</div></aside>'
            )

        if environment in {"enumerate", "itemize"}:
            items = split_list_items(inner_lines)
            tag = "ol" if environment == "enumerate" else "ul"
            roman = environment == "enumerate" and "\\roman*" in suffix
            class_attribute = ' class="roman-list"' if roman else ""
            rendered = "".join(
                f"<li>{self.convert(item)}</li>" for item in items
            )
            return f"<{tag}{class_attribute}>{rendered}</{tag}>"

        if environment == "verbatim":
            code = "\n".join(inner_lines).strip("\n")
            return (
                '<pre class="notes-code"><code>'
                + html.escape(code, quote=False)
                + "</code></pre>"
            )

        if environment == "figure":
            return self.convert_figure(suffix, inner_lines)

        if environment == "tabular":
            return self.convert_table(suffix, inner_lines)

        if environment == "center":
            return f'<div class="notes-center">{self.convert(inner_lines)}</div>'

        if environment == "minipage":
            return f'<div class="notes-minipage">{self.convert(inner_lines)}</div>'

        if environment in {"align", "align*"}:
            math = (
                f"\\begin{{{environment}}}\n"
                + "\n".join(inner_lines)
                + f"\n\\end{{{environment}}}"
            )
            return (
                '<div class="math-display">'
                + html.escape(math, quote=False)
                + "</div>"
            )

        self.unhandled_environments.add(environment)
        return (
            f'<div data-latex-environment="{html.escape(environment, quote=True)}">'
            f"{self.convert(inner_lines)}</div>"
        )

    def convert_figure(self, suffix: str, inner_lines: list[str]) -> str:
        del suffix
        raw = "\n".join(inner_lines)
        image_match = re.search(
            r"\\includegraphics(?:\[([^\]]*)\])?\{([^}]+)\}", raw
        )
        if not image_match:
            raise ValueError("Figure has no includegraphics command")
        image_name = Path(image_match.group(2)).name
        if image_name not in FIGURES:
            raise ValueError(f"Unexpected figure asset: {image_name}")
        options = image_match.group(1) or ""
        width_match = re.search(r"width\s*=\s*0\.(\d+)\\textwidth", options)
        width = f"{int(width_match.group(1))}%" if width_match else "100%"
        caption = command_argument(raw, "\\caption")
        if caption is None:
            raise ValueError(f"Figure has no caption: {image_name}")
        label = command_argument(raw, "\\label")
        identifier = html.escape(label or slugify(image_name), quote=True)
        alt_text = latex_to_plain(caption)
        return (
            f'<figure class="notes-figure" id="{identifier}" '
            f'style="--figure-width: {width}">'
            f'<img src="../../assets/images/caad-notes/{html.escape(image_name, quote=True)}" '
            f'alt="{html.escape(alt_text, quote=True)}" loading="lazy" decoding="async">'
            f"<figcaption>{convert_inline(caption)}</figcaption></figure>"
        )

    def convert_table(self, suffix: str, inner_lines: list[str]) -> str:
        del suffix
        rows: list[str] = []
        current: list[str] = []
        for line in inner_lines:
            stripped = line.strip()
            if not stripped or stripped in {"\\toprule", "\\midrule", "\\bottomrule"}:
                continue
            if stripped.endswith("\\\\"):
                current.append(stripped[:-2].rstrip())
                rows.append(" ".join(current).strip())
                current = []
            else:
                current.append(stripped)
        if current:
            rows.append(" ".join(current).strip())
        if not rows:
            raise ValueError("Empty tabular environment")

        parsed_rows = [split_table_cells(row) for row in rows]
        column_count = len(parsed_rows[0])
        if any(len(row) != column_count for row in parsed_rows):
            raise ValueError(f"Inconsistent table rows: {parsed_rows!r}")
        has_header = all(cell.lstrip().startswith("\\textbf") for cell in parsed_rows[0])
        header_html = ""
        body_rows = parsed_rows
        if has_header:
            header_html = "<thead><tr>" + "".join(
                f"<th scope=\"col\">{convert_inline(cell)}</th>"
                for cell in parsed_rows[0]
            ) + "</tr></thead>"
            body_rows = parsed_rows[1:]
        body_html = "<tbody>" + "".join(
            "<tr>"
            + "".join(f"<td>{convert_inline(cell)}</td>" for cell in row)
            + "</tr>"
            for row in body_rows
        ) + "</tbody>"
        return (
            '<div class="notes-table-wrap"><table>'
            + header_html
            + body_html
            + "</table></div>"
        )


def extract_preface(preface_source: str) -> str:
    match = re.search(
        r"\\begin\{minipage\}\{[^}]+\}(.*?)\\end\{minipage\}",
        preface_source,
        flags=re.DOTALL,
    )
    if not match:
        raise ValueError("Could not locate the notes preface")
    return match.group(1).strip()


def first_prose_sentence(source: str) -> str:
    converter = LatexHTMLConverter(source_section_number=1)
    for paragraph in re.split(r"\n\s*\n", source):
        stripped = paragraph.strip()
        if not stripped or stripped.startswith("\\"):
            continue
        plain = latex_to_plain(stripped.replace("\n", " "))
        if plain:
            sentence = re.split(r"(?<=[.!?])\s+", plain, maxsplit=1)[0]
            return sentence[:220]
    return "Computer Aided Design"


def toc_html(headings: list[Heading]) -> str:
    links = []
    for heading in headings:
        class_name = "toc-subsection" if heading.level == 3 else "toc-section"
        links.append(
            f'<li class="{class_name}"><a href="#{heading.identifier}">'
            f"{convert_inline(heading.title_source)}</a></li>"
        )
    return "\n".join(links)


def module_navigation(module_index: int) -> str:
    links: list[str] = []
    if module_index > 0:
        previous_title, previous_slug, _ = MODULES[module_index - 1]
        links.append(
            f'<a class="notes-nav-link previous" href="../{previous_slug}/index.html">'
            f'<span>Previous module</span><strong>{html.escape(previous_title)}</strong></a>'
        )
    else:
        links.append(
            '<a class="notes-nav-link previous" href="../index.html">'
            '<span>Module library</span><strong>Theory</strong></a>'
        )
    if module_index + 1 < len(MODULES):
        next_title, next_slug, _ = MODULES[module_index + 1]
        links.append(
            f'<a class="notes-nav-link next" href="../{next_slug}/index.html">'
            f'<span>Next module</span><strong>{html.escape(next_title)}</strong></a>'
        )
    else:
        links.append(
            '<a class="notes-nav-link next" href="../index.html">'
            '<span>Module library</span><strong>Theory</strong></a>'
        )
    return "".join(links)


def render_page(
    *,
    title: str,
    module_index: int,
    description: str,
    content_html: str,
    headings: list[Heading],
) -> str:
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="{html.escape(description, quote=True)}">
  <meta name="theme-color" content="#fdf6ec">
  <title>CAD · {html.escape(title)}</title>
  <link rel="stylesheet" href="../../assets/css/style.css">
  <link rel="stylesheet" href="../../assets/css/notes.css">
  <script src="../../assets/js/main.js" defer></script>
  <script>
    window.MathJax = {{
      tex: {{
        inlineMath: [["\\\\(", "\\\\)"], ["$", "$"]],
        displayMath: [["\\\\[", "\\\\]"]],
        processEscapes: true,
        processEnvironments: true
      }},
      options: {{
        skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"]
      }}
    }};
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js" defer></script>
</head>
<body class="notes-page">
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="page-header">
    <nav class="top-nav" aria-label="Main navigation">
      <a class="brand" href="../../index.html" aria-label="CAD home"><span class="brand-mark" aria-hidden="true"></span><span class="brand-copy"><strong>CAD</strong></span></a>
      <div class="nav-links"><a href="../index.html" aria-current="page">Theory</a><a href="../../programming-modules/index.html">Programming Modules</a><a href="../../self-assessment-quizzes/index.html">Self Assessment Quizzes</a></div>
    </nav>
    <div class="page-hero notes-hero">
      <ol class="breadcrumb" aria-label="Breadcrumb"><li><a href="../../index.html">Home</a></li><li><a href="../index.html">Theory</a></li><li aria-current="page">{html.escape(title)}</li></ol>
      <p class="eyebrow">Computer Aided Design</p>
      <h1>{html.escape(title)}</h1>
      <p class="notes-author">Murali Palla</p>
    </div>
  </header>

  <main class="notes-shell" id="main-content">
    <nav class="notes-toc" aria-label="In this module">
      <p>In this module</p>
      <ol>{toc_html(headings)}</ol>
    </nav>
    <article class="notes-article">
      {content_html}
      <nav class="notes-module-nav" aria-label="Module navigation">{module_navigation(module_index)}</nav>
    </article>
  </main>

  <footer class="site-footer"><p><strong>CAD</strong> · Computer Aided Design</p><ul class="footer-nav" aria-label="Footer navigation"><li><a href="../../index.html">Home</a></li><li><a href="../index.html">Theory</a></li><li><a href="../../programming-modules/index.html">Programming Modules</a></li></ul><p>Created by Murali Palla · <span data-year>2026</span></p></footer>
</body>
</html>'''


class StructureValidator(HTMLParser):
    VOID_ELEMENTS = {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[str] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        if tag not in self.VOID_ELEMENTS:
            self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if not self.stack:
            self.errors.append(f"Unexpected closing tag </{tag}>")
            return
        expected = self.stack.pop()
        if expected != tag:
            self.errors.append(f"Expected </{expected}> but found </{tag}>")

    def finish(self) -> list[str]:
        if self.stack:
            self.errors.append(f"Unclosed tags: {self.stack!r}")
        return self.errors


def validate_outputs(
    site_root: Path,
    pages: dict[str, str],
    selected_source: str,
    copied_figures: list[Path],
) -> None:
    combined = "\n".join(pages.values())
    forbidden = (
        "Short Question Bank",
        "Suggested Computational Exercises",
        "Write the homogeneous transformation matrix for two-dimensional translation",
        "Implement Rodrigues' formula and verify",
    )
    for marker in forbidden:
        if marker in combined:
            raise ValueError(f"Excluded source leaked into generated HTML: {marker}")

    expected_counts = {
        "keybox": ('class="notes-box keybox"', selected_source.count("\\begin{keybox}")),
        "examplebox": ('class="notes-box examplebox"', selected_source.count("\\begin{examplebox}")),
        "remarkbox": ('class="notes-box remarkbox"', selected_source.count("\\begin{remarkbox}")),
        "definition": ('class="notes-box theorem definition"', selected_source.count("\\begin{definition}")),
        "property": ('class="notes-box theorem property"', selected_source.count("\\begin{property}")),
        "table": ('class="notes-table-wrap"', selected_source.count("\\begin{tabular}")),
        "code": ('class="notes-code"', selected_source.count("\\begin{verbatim}")),
        "figure": ('class="notes-figure"', selected_source.count("\\begin{figure}")),
        "display math": (
            'class="math-display"',
            sum(line.strip() == "\\[" for line in selected_source.splitlines())
            + len(
                re.findall(
                    r"(?m)^\s*\\begin\{align\*?\}\s*$",
                    selected_source,
                )
            ),
        ),
    }
    for name, (needle, expected) in expected_counts.items():
        actual = combined.count(needle)
        if actual != expected:
            raise ValueError(f"{name} count mismatch: expected {expected}, found {actual}")

    expected_headings = len(
        re.findall(
            r"(?m)^\\(?:section|subsection|subsubsection)\*?\{",
            selected_source,
        )
    )
    actual_headings = len(re.findall(r"<h[23] id=", combined))
    if actual_headings != expected_headings:
        raise ValueError(
            "Heading count mismatch: "
            f"expected {expected_headings}, found {actual_headings}"
        )

    for slug, page in pages.items():
        validator = StructureValidator()
        validator.feed(page)
        errors = validator.finish()
        if errors:
            raise ValueError(f"Invalid HTML structure in {slug}: {errors}")
        if "<!doctype html>" not in page or "</html>" not in page:
            raise ValueError(f"Incomplete HTML document: {slug}")
        for environment in NON_MATH_ENVIRONMENTS:
            if f"\\begin{{{environment}}}" in page or f"\\end{{{environment}}}" in page:
                raise ValueError(f"Unhandled {environment} environment in {slug}")

        page_path = site_root / "cad-modules" / slug / "index.html"
        for image_reference in re.findall(r'<img[^>]+src="([^"]+)"', page):
            resolved = (page_path.parent / image_reference).resolve()
            if not resolved.is_file():
                raise FileNotFoundError(
                    f"Broken image reference in {slug}: {image_reference} -> {resolved}"
                )

    if {path.name for path in copied_figures} != set(FIGURES):
        raise ValueError("The copied figure set does not match the referenced figure set")
    if "GaussMap.png" in combined:
        raise ValueError("Unreferenced GaussMap.png must not be used")


def build(source_path: Path, site_root: Path) -> list[Path]:
    expanded, _ = expand_active_inputs(source_path)
    clean_body = document_body(strip_comments(expanded))
    preface_source, sections = split_sections(clean_body)

    required_sections = {title for title, _, _ in MODULES} | {
        *EXCLUDED_SECTIONS,
        "Summary",
    }
    missing = sorted(required_sections - sections.keys())
    if missing:
        raise ValueError(f"Missing source sections: {missing}")

    preface = extract_preface(preface_source)
    preface_converter = LatexHTMLConverter(source_section_number=1)
    preface_html = preface_converter.convert(preface)
    if preface_converter.unhandled_environments:
        raise ValueError(
            f"Unhandled preface environments: {preface_converter.unhandled_environments}"
        )

    pages: dict[str, str] = {}
    changed: list[Path] = []
    selected_source_parts = [preface]

    for module_index, (title, slug, section_number) in enumerate(MODULES):
        section_source = sections[title]
        if title == "Solid Modeling":
            section_source = (
                section_source.rstrip()
                + "\n\n\\section{Summary}\n\n"
                + sections["Summary"].strip()
            )
        selected_source_parts.append(section_source)
        converter = LatexHTMLConverter(source_section_number=section_number)
        body_html = converter.convert(section_source)
        if converter.unhandled_environments:
            raise ValueError(
                f"Unhandled environments in {title}: {converter.unhandled_environments}"
            )
        if title == "Geometric Transformations":
            body_html = f'<aside class="notes-preface">{preface_html}</aside>\n{body_html}'
        description = first_prose_sentence(section_source)
        page = render_page(
            title=title,
            module_index=module_index,
            description=description,
            content_html=body_html,
            headings=converter.headings,
        )
        output_path = site_root / "cad-modules" / slug / "index.html"
        write_utf8(output_path, page)
        pages[slug] = page
        changed.append(output_path)

    figure_output = site_root / "assets" / "images" / "caad-notes"
    figure_output.mkdir(parents=True, exist_ok=True)
    copied_figures: list[Path] = []
    for figure_name in FIGURES:
        source_figure = source_path.parent / "figures" / figure_name
        target_figure = figure_output / figure_name
        if not source_figure.is_file():
            raise FileNotFoundError(source_figure)
        shutil.copyfile(source_figure, target_figure)
        copied_figures.append(target_figure)
        changed.append(target_figure)

    selected_source = "\n".join(selected_source_parts)
    validate_outputs(site_root, pages, selected_source, copied_figures)
    return changed


def parse_args() -> argparse.Namespace:
    script_site_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(r"D:\Teaching\CAD_AM2026\CAADNotes\CADNotes1.tex"),
        help="Path to the active CADNotes1.tex root document",
    )
    parser.add_argument(
        "--site-root",
        type=Path,
        default=script_site_root,
        help="Root directory of the static CAD site mirror",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = args.source.resolve()
    site_root = args.site_root.resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if not site_root.is_dir():
        raise NotADirectoryError(site_root)
    changed = build(source, site_root)
    print("Generated and validated:")
    for path in changed:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
