(function () {
  const host = location.hostname || "";
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);

  const STAGING_BACKEND = "https://genco-backend.langit7772.workers.dev";
  const LOCAL_WRANGLER = "http://127.0.0.1:8787";
  // ?backend=staging → pakai backend deploy meski di local (untuk testing sebelum deploy)
  const useStagingFromLocal = typeof URLSearchParams !== "undefined" && new URLSearchParams(location.search).get("backend") === "staging";
  const BACKEND_URL = (isLocal && !useStagingFromLocal)
    ? LOCAL_WRANGLER
    : STAGING_BACKEND;
  window.API_BASE_URL = BACKEND_URL;

  // Backwards-compatible fallbacks: presets & AI pakai backend ini bila user belum set di Settings.
  try {
    window.APP_CONFIG = window.APP_CONFIG || {};
    if (!window.APP_CONFIG.backendURL) window.APP_CONFIG.backendURL = BACKEND_URL;
    // default: force backend proxy in non-local environments unless explicitly configured
    if (typeof window.APP_CONFIG.forceBackendProxy === 'undefined') {
      window.APP_CONFIG.forceBackendProxy = !isLocal;
    }
  } catch (e) {}

  try {
    window.AI = window.AI || {};
    if (!window.AI.backendURL) window.AI.backendURL = BACKEND_URL;
  } catch (e) {}
})();