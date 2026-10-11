// Hub Nhật ký — chưa mở ở bản nền tảng. Nhấn mạnh quyền riêng tư: chia sẻ
// từng trang do người dùng chọn, không chia sẻ mặc định.
import { h } from "../../app/dom.js";
import { createEmptyState, createTopBar } from "../../components/index.js";

export const page = {
  id: "diary",
  title: "Nhật ký",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "diary" } });

    root.appendChild(createTopBar({ title: "Nhật ký" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(
      createEmptyState({
        title: "Nhật ký sẽ mở ở bản đầy đủ",
        description:
          "Nhật ký riêng và nhật ký song hành là nội dung cá nhân của bạn. Mỗi trang chỉ được chia sẻ với người đồng hành khi bạn chọn chia sẻ trang đó.",
        action: null,
      }),
    );

    return root;
  },
};
