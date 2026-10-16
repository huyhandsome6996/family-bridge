// TODO(W2-b): trang settings — port zalo-mini-app/src/pages/settings/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "settings",
  id: "settings",
  title: "Cài đặt",
  requiresRole: true,
  requiresAuth: true, // cài đặt thao tác trên phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app",
});
