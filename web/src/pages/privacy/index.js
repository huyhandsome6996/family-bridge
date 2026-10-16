// TODO(W2-b): trang privacy — port zalo-mini-app/src/pages/privacy/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "privacy",
  id: "privacy",
  title: "Riêng tư & đồng ý",
  requiresRole: true,
  requiresAuth: true, // dữ liệu riêng tư theo phiên (router M1)
  showBottomNav: true,
  chrome: "app",
});
