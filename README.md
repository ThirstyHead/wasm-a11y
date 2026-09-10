# wasm-a11y

A WebAssembly zero-install toolkit for auditing and remediating documents for digital accessibility.

## Overview

`wasm-a11y` brings the full power of `engine-a11y` and its format engines (`docx-a11y`, `pptx-a11y`, `xlsx-a11y`, and `pdf-a11y`) directly into modern web browsers via **WebAssembly** (Pyodide).

### Privacy & Trust Guarantee
- **100% Client-Side Processing**: Documents never leave your device.
- **Zero Server Uploads**: No backend APIs, no telemetry, no tracking.
- **Air-Gapped Operation**: Supported by a Service Worker (`sw.js`) that caches runtime dependencies for completely offline document accessibility auditing.

---

## Features

- **Format Support**: Audit and remediate Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`), and PDF (`.pdf`) documents.
- **Encouraging Scorecard**: Executive summaries highlighting progress over perfection with honest barrier counts.
- **Automated Remediation**: Downloads fixed documents directly from browser memory.
- **Action Checklist**: Honest human-in-the-loop next steps with application-specific guidance (Word, PowerPoint, Excel, Acrobat Pro).
- **Standards-Compliant UI**:
  - Semantic HTML5 with accessible landmarks (`<header>`, `<main>`, `<section>`, `role="banner"`, `role="main"`, `role="contentinfo"`).
  - Screen-reader accessible live status announcements (`aria-live="polite"`, `aria-live="assertive"`).
  - Keyboard accessible skip links and dropzone focus outlines.
- **SMACSS CSS Design System**:
  - `css/base.css` — Resets, base typography, and accessibility utilities.
  - `css/layout.css` — Responsive container grid and layout regions.
  - `css/modules.css` — Reusable components: dropzone, scorecards, tables, badges, progress bars, checklists.
  - `css/state.css` — Dynamic states (`.is-dragover`, `.is-processing`, `.is-disabled`, `:focus-visible`).
  - `css/theme.css` — High-contrast design tokens compliant with WCAG 2.2 AAA.

---

## Quick Start

### 1. Launching the Local Web Studio CLI

Install `wasm-a11y` in your Python environment:

```bash
pip install -e .
```

Start the studio:

```bash
wasm-a11y-studio
```

The studio will automatically open in your browser at `http://127.0.0.1:8080` with proper `Cross-Origin-Opener-Policy` (COOP) and `Cross-Origin-Embedder-Policy` (COEP) headers configured for high-performance WebAssembly execution.

---

## Building Pyodide Wheels

To rebuild the pure-Python wheels for the engine and format packages:

```bash
python scripts/build_wheels.py
```

Generated `.whl` files are placed into `public/wheels/` and served statically to the Pyodide Web Worker.

---

## Running Tests

Run the test suite:

```bash
pytest -v
```

Includes unit tests for wheel packaging, HTML5 semantic validation, SMACSS design system validation, server isolation headers, and Playwright end-to-end browser tests verifying zero network egress.
