// Hub Hộp thư — chưa có dữ liệu thật: EmptyState + lối ra kiểm tra kết nối.
import { h } from "../../app/dom.js";
import { createEmptyState, createTopBar } from "../../components/index.js";

export const page = {
  id: "mailbox",
  title: "Hộp thư",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "mailbox" } });

    root.appendChild(createTopBar({ title: "Hộp thư" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(
      createEmptyState({
        title: "Chưa có tin nhắn nào",
        description: "Khi hai bên đã kết nối, lời nhắn và phản hồi nhanh sẽ xuất hiện ở đây.",
        action: {
          label: "Kiểm tra kết nối máy chủ",
          onClick: () => ctx.navigate("/connection-check"),
        },
      }),
    );

    return root;
  },
};
