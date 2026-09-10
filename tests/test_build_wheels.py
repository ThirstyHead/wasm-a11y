import sys
from pathlib import Path
import pytest

# Add repo root to path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.build_wheels import build_wheels, EXPECTED_PACKAGES


def test_expected_packages_defined():
    assert "engine-a11y" in EXPECTED_PACKAGES
    assert "docx-a11y" in EXPECTED_PACKAGES
    assert "pptx-a11y" in EXPECTED_PACKAGES
    assert "xlsx-a11y" in EXPECTED_PACKAGES


def test_build_wheels_output(tmp_path):
    wheels = build_wheels(output_dir=tmp_path)
    assert len(wheels) == len(EXPECTED_PACKAGES)
    for pkg in EXPECTED_PACKAGES:
        normalized_name = pkg.replace("-", "_")
        matching = [w for w in wheels if w.name.startswith(normalized_name) and w.suffix == ".whl"]
        assert len(matching) >= 1, f"Missing wheel for {pkg} in {wheels}"
