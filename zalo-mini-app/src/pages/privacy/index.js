// Trang web mới (Task 2 Render) — bản khung trung thực tạm thời cho commit
// M1 (hạ tầng router); nội dung đầy đủ được nối API thật ở milestone sau.
import { h } from "../../app/dom.js";
import { createEmptyState, createTopBar } from "../../components/index.js";

export const page = {
  id: "privacy",
  title: "Privacy",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "privacy" } });
    root.appendChild(createTopBar({ title: "Privacy" }));
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);
    body.appendChild(
      createEmptyState({
        title: "Privacy đang được hoàn thiện",
        description: "Màn này sẽ mở khi tích hợp máy chủ thật. Không có dữ liệu giả.",
        action: { label: "Về trang chủ", onClick: () => ctx.navigate("/home") },
      }),
    );
    return root;
  },
};
