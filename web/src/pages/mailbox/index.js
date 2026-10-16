// TODO(W2-b): trang mailbox — port zalo-mini-app/src/pages/mailbox/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "mailbox",
  id: "mailbox",
  title: "Hộp thư",
  requiresRole: true,
  requiresAuth: true, // hộp thư là dữ liệu phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app",
});
