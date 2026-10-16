// TODO(W2-b): trang message — port zalo-mini-app/src/pages/message/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "message",
  id: "message",
  title: "Chi tiết tin nhắn",
  requiresRole: true,
  requiresAuth: true, // nội dung thư là dữ liệu phiên lớp học (router M1)
  showBottomNav: false,
  chrome: "app",
});
