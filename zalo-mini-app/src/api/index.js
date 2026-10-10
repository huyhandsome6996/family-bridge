import { createApiClient } from "./client.mjs";

export const api = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL });
