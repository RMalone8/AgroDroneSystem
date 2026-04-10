#!/bin/sh
# setup.sh — run once after cloning to create local config files from examples.
# Safe to re-run: existing files are never overwritten.

set -e

copy_if_missing() {
    src="$1"
    dst="$2"
    if [ -f "$dst" ]; then
        echo "  exists   $dst"
    else
        cp "$src" "$dst"
        echo "  created  $dst"
    fi
}

echo "Setting up local config files..."

copy_if_missing AgroDroneBackend/.dev.vars.example   AgroDroneBackend/.dev.vars
copy_if_missing AgroDroneFrontend/.env.example        AgroDroneFrontend/.env

echo ""
echo "Done. You can now run: docker compose up --build"
