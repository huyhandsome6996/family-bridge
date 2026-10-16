// TODO(W2-b): trang proposal — port zalo-mini-app/src/pages/proposal/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "proposal",
  id: "proposal",
  title: "Xác nhận ghép nối",
  requiresRole: true,
  requiresAuth: true, // phiên lớp học là điều kiện bắt buộc (router M1)
  showBottomNav: true,
  chrome: "app",
});
