#!/usr/bin/env python3
"""Fails unless the version is consistent everywhere it is written.

    check_release_version.py ts 0.1.0     # a release tag ts-v0.1.0
    check_release_version.py py 0.1.0     # a release tag py-v0.1.0
    check_release_version.py ts            # no tag: only check the files agree with each other

The tag version must equal the one in package.json / pyproject.toml and in the VERSION constant
the package sends in its User-Agent.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEMVER = re.compile(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$")


def read_versions(kind: str) -> dict:
    if kind == "ts":
        pkg = json.loads((ROOT / "packages/ts/package.json").read_text())
        const = re.search(r"VERSION = '([^']+)'", (ROOT / "packages/ts/src/version.ts").read_text())
        return {"packages/ts/package.json": pkg["version"], "packages/ts/src/version.ts": const.group(1) if const else None}
    if kind == "py":
        toml = re.search(r'^version = "([^"]+)"', (ROOT / "packages/py/pyproject.toml").read_text(), re.M)
        const = re.search(r'VERSION = "([^"]+)"', (ROOT / "packages/py/src/pokewallet/_version.py").read_text())
        return {"packages/py/pyproject.toml": toml.group(1) if toml else None, "packages/py/src/pokewallet/_version.py": const.group(1) if const else None}
    raise SystemExit(f"unknown package kind {kind!r}: use ts or py")


def main(argv: list) -> int:
    if len(argv) not in (2, 3):
        print(__doc__)
        return 2
    kind = argv[1]
    versions = read_versions(kind)
    if argv[2:]:
        versions["tag"] = argv[2]
    bad = [f"{name}: {version!r}" for name, version in versions.items() if not version or not SEMVER.match(version)]
    if bad:
        print("Not a semantic version:\n  " + "\n  ".join(bad))
        return 1
    if len(set(versions.values())) != 1:
        print("Version mismatch:\n  " + "\n  ".join(f"{k}: {v}" for k, v in versions.items()))
        return 1
    print(f"{kind}: version {next(iter(versions.values()))} is consistent in {', '.join(versions)}")
    return 0


sys.exit(main(sys.argv))
