import { defineConfig } from "vite";
import { resolve } from "node:path";

// The client SPA is built from src/client into dist/client, which the Worker
// serves via its `assets` binding (see wrangler.jsonc). The Worker itself is
// bundled separately by wrangler's esbuild.
export default defineConfig({
  root: resolve(import.meta.dirname, "src/client"),
  publicDir: resolve(import.meta.dirname, "public"),
  resolve: {
    alias: {
      "@shared": resolve(import.meta.dirname, "src/shared"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist/client"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
});
