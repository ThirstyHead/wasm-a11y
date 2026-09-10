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


def test_css_theme_wcag_contrast_and_focus():
    state_css = (CSS_DIR / "state.css").read_text(encoding="utf-8")
    assert ":focus-visible" in state_css or ":focus" in state_css

    theme_css = (CSS_DIR / "theme.css").read_text(encoding="utf-8")
    assert "--color-bg" in theme_css
    assert "--color-text" in theme_css
    assert "prefers-color-scheme: dark" in theme_css
