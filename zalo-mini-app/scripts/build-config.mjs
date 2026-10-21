// Public build configuration only. Never include credentials in this metadata.
export function requireApiBaseUrl(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  const error = () => new Error(
    "VITE_API_BASE_URL must be an HTTPS backend origin (no credentials, path, query or fragment). Set it in the Mini App build environment before publishing.",
  );
  if (!value || value.length > 2048) throw error();
  let url;
  try { url = new URL(value); } catch { throw error(); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      /^(localhost|127\.|\[?::1\]?)/i.test(url.hostname)) throw error();
  return url.origin;
}
