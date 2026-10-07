#!/usr/bin/env bash
#
# release-v1.0.0.sh — Create and publish GitHub Release v1.0.0
#
# Prerequisites:
#   - git remote `origin` → github.com/dewanto/idx-sectors-2030
#   - GitHub CLI installed and authenticated (`gh auth login`)
#   - The v1.0.0 release changes (package.json version, CHANGELOG.md, README
#     badges) are committed and pushed to `main` BEFORE running this script,
#     so the tag points at the release commit.
#
# Usage:
#   bash scripts/release-v1.0.0.sh

set -euo pipefail

TAG="v1.0.0"
TITLE="IDX Sectors 2030 — Hackathon Release"
NOTES_FILE="RELEASE_v1.0.0.md"
ASSET_FILE="deployment-url.txt"
REPO="dewanto/idx-sectors-2030"

echo "==> IDX Sectors 2030 ${TAG} release"

# 1. Verify GitHub CLI authentication
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi
echo "  [1/6] GitHub CLI authenticated"

# 2. Verify we are on main
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "${BRANCH}" != "main" ]; then
  echo "ERROR: must be run on 'main' (currently on '${BRANCH}')." >&2
  exit 1
fi
echo "  [2/6] On branch '${BRANCH}'"

# 3. Guard: the tag must not already exist locally or on the remote
if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "ERROR: tag ${TAG} already exists locally. Aborting to avoid a duplicate release." >&2
  exit 1
fi
if git ls-remote --tags origin "refs/tags/${TAG}" | grep -q "refs/tags/${TAG}"; then
  echo "ERROR: tag ${TAG} already exists on the remote. Aborting." >&2
  exit 1
fi
echo "  [3/6] Tag ${TAG} is free (local and remote)"

# 4. Sanity: release inputs exist
for f in "${NOTES_FILE}" "${ASSET_FILE}"; do
  if [ ! -f "${f}" ]; then
    echo "ERROR: missing required file '${f}'. Run this script from the repository root." >&2
    exit 1
  fi
done
echo "  [4/6] Release notes and asset present"

# 5. Create the annotated tag on the current release commit
git tag -a "${TAG}" -m "IDX Sectors 2030 ${TAG} — Hackathon Release"
echo "  [5/6] Created annotated tag ${TAG} on $(git rev-parse --short HEAD)"

# 6. Push main and the tag, then publish the release
git push origin main
git push origin "${TAG}"
echo "  [6/6] Pushed main and ${TAG}"

gh release create "${TAG}" \
  --repo "${REPO}" \
  --title "${TITLE}" \
  --notes-file "${NOTES_FILE}" \
  "${ASSET_FILE}"

echo ""
echo "✔ Release published: https://github.com/${REPO}/releases/tag/${TAG}"