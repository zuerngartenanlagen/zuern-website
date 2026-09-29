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
