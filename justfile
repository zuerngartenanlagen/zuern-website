set shell := ["bash", "-cu"]

# List available recipes
default:
    @just --list

# Install dependencies
install:
    npm ci

# Start the dev server with hot reload
dev: _deps
    npm run dev

# Type-check with the native TypeScript 7 compiler
typecheck: _deps
    npm run typecheck

# Type-check and build the production site into dist/
build: _deps
    npm run build

# Serve the production build locally
preview: build
    npm run preview

# Remove build output
clean:
    rm -rf dist

_deps:
    @[ -d node_modules ] || npm ci

# Copy the scroll demo (scrollcraft/builds/zuern-garten) into public/demo for GitHub Pages.
# Logos always come from src/assets/logo, so there is one logo everywhere.
demo:
    #!/usr/bin/env bash
    set -euo pipefail
    src=scrollcraft/builds/zuern-garten; dst=public/demo
    rm -rf "$dst"; mkdir -p "$dst/assets"
    cp "$src"/{index.html,layers.html,scrollcraft.js,scrollcraft.css,garden.js,garden.css,walk.css,walk.js,lenis.min.js,lenis.css} "$dst/"
    cp -r "$src/assets/fonts" "$src/assets/seq" "$dst/assets/"
    cp "$src"/assets/{marcel-zuern-480.webp,marcel-zuern-800.webp} "$dst/assets/"
    cp "$src"/assets/{layers.json,ground.webp,depth.png,water.png,castle.webp,tree.webp,boulder.webp,reeds.webp,poster.webp,poster-s.webp} "$dst/assets/"
    cp src/assets/logo/{zuern-logo.svg,zuern-leaf.svg} "$src/assets/"
    cp src/assets/logo/{zuern-logo.svg,zuern-leaf.svg} "$dst/assets/"
    du -sh "$dst"
