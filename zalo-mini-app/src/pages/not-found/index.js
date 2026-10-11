// Not-found — route không khớp (router fallback). Luôn có lối trở về an toàn.
import { h } from "../../app/dom.js";
import { createEmptyState, createTopBar } from "../../components/index.js";

export const page = {
  id: "not-found",
  title: "Không tìm thấy trang",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "not-found" } });

    root.appendChild(
      createTopBar({
        title: "Không tìm thấy trang",
        showBack: true,
        onBack: () => ctx.navigate("/welcome"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(
      createEmptyState({
        title: "Không tìm thấy trang bạn cần",
        description: "Đường dẫn không tồn tại hoặc đã thay đổi. Bạn có thể quay về màn hình đầu để tiếp tục.",
        action: { label: "Về màn hình đầu", onClick: () => ctx.navigate("/welcome") },
      }),
    );

    return root;
  },
};
