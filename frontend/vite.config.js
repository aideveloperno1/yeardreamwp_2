import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET || "http://127.0.0.1:8000";
  const unavailable =
    (preview = false) =>
    (req, res, next) => {
      const path = (req.url || "").split("?")[0];
      if (
        preview &&
        (/^\/\./.test(path) ||
          /^\/(src|tests|scripts|work)(\/|$)/.test(path) ||
          [
            "/package.json",
            "/package-lock.json",
            "/vite.config.js",
            "/README.md",
          ].includes(path))
      ) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      if (preview && path.startsWith("/assets/")) {
        const root = resolve(process.cwd(), "dist/assets");
        const file = resolve(process.cwd(), "dist", "." + path);
        if (!file.startsWith(root + sep) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
      }
      if (
        /^\/(api|docs)(\/|$)/.test(path) ||
        path === "/openapi.json" ||
        (preview && /^\/(ask|upload|admin)(\/|$)/.test(path))
      ) {
        res.statusCode = preview ? 503 : 501;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            detail: preview
              ? "빌드 미리보기에는 API 서버가 연결되지 않습니다. 개발 프록시 또는 실제 배포 서버를 사용하세요."
              : "현재 개발 서버에서 지원하지 않는 API 경로입니다.",
          }),
        );
        return;
      }
      next();
    };
  return {
    define: {
      __API_CONNECTION__: JSON.stringify(
        env.VITE_API_CONNECTION_ID ||
          (mode === "production" ? "same-origin" : target),
      ),
    },
    plugins: [
      react(),
      {
        name: "reserve-api-paths",
        configureServer(server) {
          server.middlewares.use(unavailable());
        },
        configurePreviewServer(server) {
          server.middlewares.use(unavailable(true));
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
      proxy: {
        "/ask": { target },
        "/upload": { target },
        "/admin": { target },
      },
    },
    preview: { host: "127.0.0.1", port: 4173, strictPort: true },
    test: {
      environment: "jsdom",
      setupFiles: ["./tests/setup.js"],
      restoreMocks: true,
      clearMocks: true,
    },
  };
});
