import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";

const API_TARGET = "http://localhost:3001";

// While the API server (re)starts, every proxied request fails with ECONNREFUSED or
// ECONNRESET, and Vite logs a multi-line stack trace for each one — a page makes
// about a dozen requests a second, so the terminal fills up. (A `proxy.on("error")`
// handler cannot prevent that: Vite registers its own logging handler *after*
// `configure` runs.) Collapse those traces into a single line per outage; every
// other proxy error is still logged in full.
const logger = createLogger();
const logError = logger.error.bind(logger);
let apiUnreachable = false;

logger.error = (msg, options) => {
  if (msg.includes("http proxy error") && /ECONNREFUSED|ECONNRESET/.test(msg)) {
    if (!apiUnreachable) {
      apiUnreachable = true;
      logger.warn(`API server (${API_TARGET}) is not reachable yet - requests fail until it is up`, {
        timestamp: true,
      });
    }
    return;
  }
  logError(msg, options);
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  customLogger: logger,
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        configure: (proxy) => {
          // Any response from the API means it is back: re-arm the one-line notice.
          proxy.on("proxyRes", () => {
            apiUnreachable = false;
          });
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Pages are lazy-loaded (see App.tsx); this groups the heavy third-party
        // libraries into long-lived vendor chunks so an app deploy doesn't
        // invalidate them in the browser cache, and so the chart library is only
        // fetched by the pages that draw charts.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // Tiny helpers the app shell uses on every page (its cn() class helper) that
          // recharts also depends on. Without naming them, Rollup parks them in the
          // charts chunk and every page load then downloads the whole chart library.
          if (/[\\/]node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/.test(id)) return "utils";
          if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|decimal\.js-light)[\\/]/.test(id)) {
            return "charts";
          }
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) {
            return "motion";
          }
          if (id.includes("@radix-ui")) return "radix";
          if (/[\\/]node_modules[\\/](react-router|react-router-dom|@remix-run)[\\/]/.test(id)) {
            return "router";
          }
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          return undefined;
        },
      },
    },
  },
}));
