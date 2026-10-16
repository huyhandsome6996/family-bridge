// TODO(W2-b): trang compose — port zalo-mini-app/src/pages/compose/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "compose",
  id: "f06-compose",
  title: "Soạn Thư Cảm Xúc",
  requiresRole: true,
  // GIỮ NGUYÊN mini: compose KHÔNG có requiresAuth — trang tự kiểm tra phiên
  // trong render ("Cần đăng nhập để soạn thư") thay vì redirect theo router.
  requiresAuth: false,
  showBottomNav: false,
});
