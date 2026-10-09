import { defineConfig, loadEnv } from "vite";

/**
 * Local API target for the Vite proxy.
 * Prefer AGENTKEY_API_URL; fall back to host/port env used by apps/api.
 */
function apiTarget(env: Record<string, string>): string {
  if (env.AGENTKEY_API_URL?.trim()) {
    return env.AGENTKEY_API_URL.trim().replace(/\/$/, "");
  }
  const host = env.AGENTKEY_API_HOST?.trim() || "127.0.0.1";
  const port = env.AGENTKEY_API_PORT?.trim() || "8787";
  return `http://${host}:${port}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = apiTarget({
    ...process.env,
    ...env,
  } as Record<string, string>);

  return {
    server: {
      port: Number(env.AGENTKEY_DASHBOARD_PORT ?? process.env.AGENTKEY_DASHBOARD_PORT ?? "5173"),
      proxy: {
        "/v1": { target, changeOrigin: true },
        "/health": { target, changeOrigin: true },
      },
    },
    preview: {
      port: Number(env.AGENTKEY_DASHBOARD_PORT ?? process.env.AGENTKEY_DASHBOARD_PORT ?? "4173"),
      proxy: {
        "/v1": { target, changeOrigin: true },
        "/health": { target, changeOrigin: true },
      },
    },
  };
});
