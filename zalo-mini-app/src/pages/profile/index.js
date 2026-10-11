// Hub Cá nhân — vai trò XEM TRƯỚC (không phải tài khoản), các mục chưa làm
// đều disabled kèm lý do, không giả hành động.
import { h } from "../../app/dom.js";
import { createButton, createCard, createTopBar } from "../../components/index.js";

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

export const page = {
  id: "profile",
  title: "Cá nhân",
  requiresRole: true,
  showBottomNav: true,

  render(ctx) {
    const state = readState(ctx.store);
    const root = h("div", { class: "fb-page", dataset: { page: "profile" } });

    root.appendChild(createTopBar({ title: "Cá nhân" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const roleLabel = state.role === "caregiver" ? "Người chăm sóc" : "Học sinh";

    body.appendChild(
      createCard({
        title: "Vai trò xem trước",
        description: `Bạn đang xem giao diện với vai trò: ${roleLabel}. Đây chỉ là lựa chọn xem trước, không phải tài khoản.`,
        footer: createButton({
          label: "Đổi vai trò xem trước",
          variant: "ghost",
          onClick: () => {
            Promise.resolve(ctx.setRole(null)).then(() => ctx.navigate("/role-select"));
          },
        }),
      }),
    );

    body.appendChild(
      createCard({
        title: "Cài đặt",
        children: h("div", { class: "fb-profile__actions" },
          createButton({
            label: "Quản lý chia sẻ & đồng ý — Sắp có",
            variant: "ghost",
            disabled: true,
            title: "Tính năng quản lý chia sẻ và đồng ý sẽ có ở bản đầy đủ.",
          }),
          h("p", { class: "fb-page__note" },
            "Khi có, bạn sẽ chọn rõ từng thông tin muốn chia sẻ với người đồng hành trước khi bật tính năng này.",
          ),
          createButton({
            label: "Kiểm tra kết nối máy chủ",
            variant: "ghost",
            onClick: () => ctx.navigate("/connection-check"),
          }),
          createButton({
            label: "Tìm trợ giúp",
            variant: "ghost",
            onClick: () => ctx.navigate("/help"),
          }),
        ),
      }),
    );

    body.appendChild(
      h("p", { class: "fb-page__note" }, "Phiên bản xem trước US-003"),
    );

    return root;
  },
};
