// TODO(W2-b): trang signal — port zalo-mini-app/src/pages/signal/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "signal",
  id: "signal",
  title: "Tín hiệu lắng nghe",
  requiresRole: true,
  requiresAuth: true, // tín hiệu là dữ liệu phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app",
});
