// Trang stub trung thực cho 8 màn CHƯA chuyển đổi sang web độc lập (W2-a):
// cards, signal, message, mailbox, compose, proposal, settings, privacy.
// THÔNG TRỰC — KHÔNG giả dữ liệu, KHÔNG giả hành động: chỉ báo đang chuyển
// đổi + nút quay lại. W2-b sẽ port từng màn thật theo route này
// (TODO(W2-b): trang <ten> — xem comment trong từng file stub).
//
// Meta trang giữ NGUYÊN hợp đồng route của mini (id/title/requiresRole/
// requiresAuth/showBottomNav/chrome) để bảng route 21 path + guard 8 trang
// auth không đổi khi thay stub bằng trang thật ở W2-b.
import { h } from "../app/dom.js";
import { createEmptyState, createTopBar } from "../components/index.js";

export function createNotImplementedPage({ slug, id, title, requiresRole = false, requiresAuth = false, showBottomNav = false, chrome = null, backPath = "/home" } = {}) {
  const page = {
    id: id || `not-implemented-${slug}`,
    title: title || "Chưa khả dụng",
    requiresRole,
    requiresAuth,
    showBottomNav,
    ...(chrome ? { chrome } : {}),

    render(ctx) {
      const root = h("div", { class: "fb-page", dataset: { page: page.id } });

      root.appendChild(
        createTopBar({
          title: title || "Chưa khả dụng",
          showBack: true,
          onBack: () => ctx.navigate(backPath),
        }),
      );

      const body = h("div", { class: "fb-page__body" });
      root.appendChild(body);

      body.appendChild(
        createEmptyState({
          title: "Màn này đang được chuyển đổi sang web độc lập",
          description:
            "Màn " + (title || slug) + " chưa được port sang bản web — theo dõi PR " +
            "web-miniapp-separation (W2-b) để biết tiến độ. Không có dữ liệu giả ở đây.",
          action: { label: "Quay lại trang chủ", onClick: () => ctx.navigate(backPath) },
        }),
      );

      return root;
    },
  };
  return page;
}

/** Bản mặc định (dùng khi route chưa cấu hình riêng). */
export const page = createNotImplementedPage({
  slug: "unknown",
  id: "not-implemented",
  title: "Chưa khả dụng",
});
