from pathlib import Path
import re

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT_DIR / "public"
CSS_DIR = PUBLIC_DIR / "css"


def test_smacss_css_files_exist():
    expected_files = ["base.css", "layout.css", "modules.css", "state.css", "theme.css"]
    for fname in expected_files:
        p = CSS_DIR / fname
        assert p.exists(), f"SMACSS file missing: {fname}"
        assert p.stat().st_size > 0, f"SMACSS file empty: {fname}"


def test_index_html_structure():
    index_file = PUBLIC_DIR / "index.html"
    assert index_file.exists(), "public/index.html does not exist"
    content = index_file.read_text(encoding="utf-8")

    # Semantic landmarks
    assert '<!DOCTYPE html>' in content
    assert '<html lang="en"' in content
    assert 'role="banner"' in content
    assert 'id="main-content"' in content
    assert 'role="main"' in content
    assert 'role="contentinfo"' in content

    # Skip link
    assert 'href="#main-content"' in content

    # ARIA live status region
    assert 'aria-live="polite"' in content or 'aria-live="assertive"' in content

    # File input accepts supported formats
    assert 'accept=".docx,.pptx,.xlsx,.pdf"' in content

    # SMACSS CSS links
    assert 'href="css/base.css"' in content
    assert 'href="css/layout.css"' in content
    assert 'href="css/modules.css"' in content
    assert 'href="css/state.css"' in content
    assert 'href="css/theme.css"' in content


def test_two_pane_storytelling_layout_and_banner():
    index_file = PUBLIC_DIR / "index.html"
    content = index_file.read_text(encoding="utf-8")

    # Guide banner
    assert 'id="guide-banner"' in content
    assert "Step 1: Add documents on left" in content
    assert "Step 2: Remediate in center" in content
    assert "Step 3: Inspect on right" in content

    # Two-pane storytelling sections
    assert 'id="pane-before"' in content
    assert "1. Before: Original Documents" in content

    assert 'id="center-bridge"' in content
    assert "Fix & Audit" in content

    assert 'id="pane-after"' in content
    assert "2. After: Remediated Files & Reports" in content

    # Report viewer modal dialog
    assert '<dialog id="report-dialog"' in content


def test_css_theme_wcag_contrast_and_focus():
    state_css = (CSS_DIR / "state.css").read_text(encoding="utf-8")
    assert ":focus-visible" in state_css or ":focus" in state_css

    theme_css = (CSS_DIR / "theme.css").read_text(encoding="utf-8")
    assert "--color-bg" in theme_css
    assert "--color-text" in theme_css
    assert "prefers-color-scheme: dark" in theme_css
