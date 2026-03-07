#!/usr/bin/env bash
set -euo pipefail

OUT_DIR=".smithery/stdio"
mkdir -p "$OUT_DIR"

echo "Building ESM bundle..."
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --outfile="$OUT_DIR/index.js" \
  --target=node18 \
  --main-fields=module,main \
  --banner:js="import { createRequire as __banner_createRequire } from 'module'; import { fileURLToPath as __banner_fileURLToPath } from 'url'; import { dirname as __banner_dirname } from 'path'; const require = __banner_createRequire(import.meta.url); const __filename = __banner_fileURLToPath(import.meta.url); const __dirname = __banner_dirname(__filename);"

echo "Creating MCPB manifest..."
COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
VERSION=$(node -p "require('./package.json').version")

cat > "$OUT_DIR/manifest.json" << MANIFEST
{
  "manifest_version": "0.2",
  "name": "openmm-mcp",
  "version": "$VERSION",
  "description": "MCP server for OpenMM — exposes market data, account, trading, and strategy tools to AI agents",
  "author": {
    "name": "QBT Labs"
  },
  "server": {
    "type": "node",
    "entry_point": "index.js",
    "mcp_config": {
      "command": "node",
      "args": ["\${__dirname}/index.js"]
    }
  },
  "compatibility": {
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "node": ">=18.0.0"
    }
  }
}
MANIFEST

echo "Packing MCPB bundle..."
(cd "$OUT_DIR" && zip -9 server.mcpb manifest.json index.js)

echo "Writing build manifest..."
cat > "$OUT_DIR/manifest.json" << BUILD_MANIFEST
{
  "payload": {
    "type": "stdio",
    "runtime": "node",
    "hasAuthAdapter": false,
    "source": {
      "commit": "$COMMIT",
      "branch": "$BRANCH"
    }
  },
  "artifacts": {
    "bundle": "server.mcpb"
  }
}
BUILD_MANIFEST

echo "Done! Artifacts in $OUT_DIR/"
