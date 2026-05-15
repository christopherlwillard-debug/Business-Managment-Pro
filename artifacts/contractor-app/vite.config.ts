import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const isBuild = process.argv.includes("build");

const rawPort = process.env.PORT;
if (!isBuild && !rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}
const port = rawPort ? Number(rawPort) : 3000;
if (!isBuild && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;
if (!isBuild && !basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

function swCacheVersionPlugin(): Plugin {
  const buildVersion = Date.now().toString(36);

  return {
    name: 'sw-cache-version',

    closeBundle() {
      const outDir = path.resolve(import.meta.dirname, 'dist/public');
      const swOut = path.join(outDir, 'sw.js');
      if (fs.existsSync(swOut)) {
        const content = fs.readFileSync(swOut, 'utf-8');
        fs.writeFileSync(swOut, content.replaceAll('__SW_CACHE_VERSION__', buildVersion));
      }
    },

    configureServer(server) {
      const swSrc = path.resolve(import.meta.dirname, 'public/sw.js');
      const devVersion = `dev-${Date.now().toString(36)}`;
      server.middlewares.use((req, res, next) => {
        const swPath = `${basePath}sw.js`.replace(/\/\//g, '/');
        if (req.url === swPath || req.url === '/sw.js') {
          const content = fs.readFileSync(swSrc, 'utf-8')
            .replaceAll('__SW_CACHE_VERSION__', devVersion);
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.end(content);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    swCacheVersionPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-charts": ["recharts"],
          "vendor-maps": ["leaflet", "react-leaflet", "@turf/turf"],
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
