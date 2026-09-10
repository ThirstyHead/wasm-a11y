"""Build pure-Python wheels for engine-a11y and sibling format repos to serve in WebAssembly."""

import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

EXPECTED_PACKAGES = [
    "engine-a11y",
    "docx-a11y",
    "pptx-a11y",
    "xlsx-a11y",
]

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = ROOT_DIR / "public" / "wheels"


def build_wheels(
    output_dir: Optional[Path] = None,
    sibling_root: Optional[Path] = None,
) -> List[Path]:
    """Build .whl files for all packages and copy them to output_dir."""
    target_dir = Path(output_dir) if output_dir else DEFAULT_OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    base_root = Path(sibling_root) if sibling_root else ROOT_DIR.parent
    built_wheels: List[Path] = []

    for pkg in EXPECTED_PACKAGES:
        pkg_dir = base_root / pkg
        if not pkg_dir.exists():
            raise FileNotFoundError(f"Repository directory not found: {pkg_dir}")

        # Run python -m build --wheel --no-isolation
        cmd = [
            sys.executable,
            "-m",
            "build",
            "--wheel",
            "--no-isolation",
            "--outdir",
            str(target_dir),
            str(pkg_dir),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            # Try without --no-isolation if build deps needed
            cmd_fallback = [
                sys.executable,
                "-m",
                "build",
                "--wheel",
                "--outdir",
                str(target_dir),
                str(pkg_dir),
            ]
            fallback_res = subprocess.run(cmd_fallback, capture_output=True, text=True)
            if fallback_res.returncode != 0:
                raise RuntimeError(
                    f"Failed to build wheel for {pkg}:\n{result.stderr}\nFallback:\n{fallback_res.stderr}"
                )

    built_wheels = list(target_dir.glob("*.whl"))
    return built_wheels


if __name__ == "__main__":
    print(f"Building wheels into {DEFAULT_OUTPUT_DIR}...")
    wheels = build_wheels()
    print(f"Successfully generated {len(wheels)} wheels:")
    for w in wheels:
        print(f"  - {w.name} ({w.stat().st_size} bytes)")
