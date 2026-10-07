#!/usr/bin/env bash
#
# release.sh — create and push release tags for IDX Sectors 2030.
#
# The GitHub Release object (notes + deployment-url.txt asset) is published
# automatically by CI (.github/workflows/release.yml) whenever a `v*` tag is
# pushed. This script therefore only needs git — no `gh` login required.
#
# Usage:
#   bash scripts/release.sh <tag> [target-commit]
#
# Examples:
#   bash scripts/release.sh v1.1.0            # tag HEAD
#   bash scripts/release.sh v1.0.0 55c9953    # backfill tag onto an older commit
#
set -euo pipefail

TAG="${1:?usage: release.sh <tag> [target-commit]}"
TARGET="${2:-HEAD}"

# --- sanity checks -----------------------------------------------------------
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✗ Tag must look like vX.Y.Z (got: $TAG)" >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "$TARGET^{commit}" >/dev/null; then
  echo "✗ Target commit not found: $TARGET" >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "✗ Tag $TAG already exists locally (delete it first: git tag -d $TAG)" >&2
  exit 1
fi

if git ls-remote --tags origin "refs/tags/$TAG" | grep -q "$TAG"; then
  echo "✗ Tag $TAG already exists on origin" >&2
  exit 1
fi

TARGET_SHA="$(git rev-parse --short "$TARGET")"
NOTES_FILE="RELEASE_${TAG}.md"

# --- create & push the tag ---------------------------------------------------
git tag -a "$TAG" -m "IDX Sectors 2030 ${TAG#v}" "$TARGET"
git push origin "refs/tags/$TAG"

echo
echo "✓ Tag $TAG created at $TARGET_SHA and pushed."
[[ -f "$NOTES_FILE" ]] \
  && echo "  Release notes source: $NOTES_FILE (CI will attach it)" \
  || echo "  ⚠ No $NOTES_FILE in this tree — CI will fall back to default notes."
echo "  CI (.github/workflows/release.yml) will now publish the GitHub Release."
echo "  Check: https://github.com/dewanto/idx-sectors-2030/actions"