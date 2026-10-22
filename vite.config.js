import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  return {
    plugins: [react()],
    // `npm run dev` + `npx wrangler dev` (port 8787) for the account API
    server: { proxy: { "/api": "http://127.0.0.1:8787" } },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    base: "./",
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: isProd,
          drop_debugger: isProd,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            settings: ["./src/pages/SettingsPage"],
            movie: ["./src/pages/MoviePage"],
            tv: ["./src/pages/TVPage"],
          },
        },
      },
    },
  };
});
