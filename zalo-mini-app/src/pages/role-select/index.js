// U04 — Role select: 2 lựa chọn vai trò XEM TRƯỚC. Không precheck, không
// auto-chọn, không tạo tài khoản/phiên đăng nhập (chỉ setState xem trước).
import { h } from "../../app/dom.js";
import { createButton, createCard, createTopBar } from "../../components/index.js";

export const page = {
  id: "u04-role-select",
  title: "Chọn vai trò xem trước",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "u04-role-select" } });

    root.appendChild(
      createTopBar({
        title: "Chọn vai trò xem trước",
        showBack: true,
        onBack: () => ctx.navigate("/how-to-use"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(
      h("h2", { class: "fb-page__heading" }, "Bạn muốn xem giao diện của ai?"),
    );

    let choosing = false;

    function choose(role) {
      if (choosing) return;
      choosing = true;
      // ctx.setRole ở main.js trả Promise (import động) — hỗ trợ cả sync.
      Promise.resolve(ctx.setRole(role))
        .then(() => ctx.navigate("/home"))
        .catch(() => { choosing = false; });
    }

    body.appendChild(
      createCard({
        title: "Con (học sinh THPT)",
        description: "Xem ứng dụng từ phía học sinh: thẻ cảm xúc, hộp thư gửi người đồng hành.",
        children: createButton({
          label: "Xem giao diện của Con",
          variant: "primary",
          size: "lg",
          onClick: () => choose("student"),
        }),
      }),
    );

    body.appendChild(
      createCard({
        title: "Người chăm sóc",
        description: "Xem ứng dụng từ phía người đồng hành cùng con: tín hiệu lắng nghe, hộp thư.",
        children: createButton({
          label: "Xem giao diện của Người chăm sóc",
          variant: "primary",
          size: "lg",
          onClick: () => choose("caregiver"),
        }),
      }),
    );

    body.appendChild(
      h("p", { class: "fb-page__note" },
        "Đây là chế độ xem trước giao diện, chưa tạo tài khoản hay phiên đăng nhập.",
      ),
    );

    return root;
  },
};
