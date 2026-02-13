#!/usr/bin/env bash
set -euo pipefail

# Quick check for required CLI binaries used by this project.
# Exits 0 if all found, non-zero if any are missing.

bins=(python pulumi aws vim docker npm lerna pnpm bun ruff yq)

missing=()
for b in "${bins[@]}"; do
  if [ "$b" = "python" ]; then
    if command -v python >/dev/null 2>&1; then
      echo "python: found at $(command -v python)"
      continue
    elif command -v python3 >/dev/null 2>&1; then
      echo "python: not found, but python3 found at $(command -v python3)"
      continue
    else
      missing+=("python")
    fi
  else
    if command -v "$b" >/dev/null 2>&1; then
      echo "$b: found at $(command -v "$b")"
    else
      missing+=("$b")
    fi
  fi
done

if [ ${#missing[@]} -eq 0 ]; then
  echo "All required binaries are available."
  exit 0
else
  echo "Missing binaries: ${missing[*]}"
  exit 2
fi
