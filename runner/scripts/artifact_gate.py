"""Shared strict/permissive renderer gate; authority lives in the Node validator."""
import json
import os
from pathlib import Path
import subprocess
import sys


def validate(kind, value, path, mode):
    cli = Path(__file__).resolve().parents[1] / "src" / "artifacts-cli.mjs"
    try:
        child = subprocess.run(
            [os.environ.get("ATEAM_NODE", "node"), str(cli), kind, "--stdin",
             "--path", str(path), "--mode", mode],
            input=json.dumps(value), text=True, capture_output=True, check=False,
        )
        report = json.loads(child.stdout)
    except (OSError, ValueError) as error:
        print(f"artifact validation unavailable: {error}; use the configured harness Node runtime", file=sys.stderr)
        raise SystemExit(2)
    for item in report.get("diagnostics", []):
        print(f"{item.get('severity', 'error')}: {item.get('path', path)}:"
              f"{item.get('id') or '-'} {item.get('field')}: {item.get('message')}", file=sys.stderr)
    if mode == "permissive":
        print("warning: permissive draft render is ineligible for phase advancement; run strict validation", file=sys.stderr)
    elif child.returncode or not report.get("eligible"):
        raise SystemExit(2)
    return report


def write_receipt(report, out):
    path = Path(out) / "artifact-validation.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
