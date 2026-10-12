#!/bin/sh
# Turn the monorepo's pnpm-lock.yaml and pnpm-workspace.yaml (copied into the
# Docker build context by scripts/build.sh) into a single-project workspace
# rooted at the current directory, so the image can run
# `pnpm install --frozen-lockfile` against the exact versions CI tested.
#
# WHY not use the root lockfile as-is: its importer for this package is keyed
# `packages/send/backend`, but in the image the package lives at `.`. And WHY
# not `pnpm deploy`: it rewrites package.json specifiers into virtual-store keys
# (e.g. `5.22.0(prisma@5.22.0)`) that cannot be re-resolved standalone.
#
# What this does:
#   - pnpm-lock.yaml: keeps only the `packages/send/backend` importer, renamed
#     to `.`. Everything else (settings, overrides, packages, snapshots) is kept
#     verbatim; pnpm installs only what the remaining importer reaches.
#   - pnpm-workspace.yaml: replaces the `packages:` list with `.` and keeps every
#     other setting, so overrides and injectWorkspacePackages still match the
#     lockfile (a frozen install refuses to run otherwise) and the build-script
#     allowlist (onlyBuiltDependencies/allowBuilds) stays the root's.
set -eu

importer='packages/send/backend'

awk -v importer="  $importer:" '
  /^[^ ]/ { in_importers = ($0 == "importers:"); keep = 1 }
  in_importers && /^  [^ ]/ {
    keep = ($0 == importer)
    if (keep) { print "  .:"; found = 1; next }
  }
  keep { print }
  END { if (!found) exit 1 }
' pnpm-lock.yaml > pnpm-lock.yaml.tmp || {
  echo "standalone-lockfile: no '$importer' importer in pnpm-lock.yaml" >&2
  exit 1
}
mv pnpm-lock.yaml.tmp pnpm-lock.yaml

{
  printf 'packages:\n  - "."\n'
  awk '/^[^ ]/ { skip = ($0 == "packages:") } !skip' pnpm-workspace.yaml
} > pnpm-workspace.yaml.tmp
mv pnpm-workspace.yaml.tmp pnpm-workspace.yaml
