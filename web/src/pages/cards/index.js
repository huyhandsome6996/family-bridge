// TODO(W2-b): trang cards — port zalo-mini-app/src/pages/cards/index.js sang web.
import { createNotImplementedPage } from "../not-implemented.js";

export const page = createNotImplementedPage({
  slug: "cards",
  id: "cards",
  title: "Thư viện thẻ cảm xúc",
  requiresRole: true,
  requiresAuth: true, // catalog thẻ là dữ liệu phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app",
});
