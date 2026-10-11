// U01 — Welcome: màn mở đầu, KHÔNG gọi getUserInfo/SDK (chính sách Task 2-a:
// màn mở đầu không cần quyền nào, không tự dựng đăng nhập Zalo).
import { h } from "../../app/dom.js";
import { createButton, createLogo } from "../../components/index.js";

export const page = {
  id: "u01-welcome",
  title: "Family Bridge",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "u01-welcome" } });

    root.appendChild(
      h("div", { class: "fb-page__hero" },
        createLogo({}),
        h("h1", { class: "fb-page__title" }, "Family Bridge"),
        h("p", { class: "fb-page__tagline" }, "Nhịp cầu lắng nghe giữa học sinh và người đồng hành."),
      ),
    );

    root.appendChild(
      h("p", { class: "fb-page__lead" },
        "Family Bridge giúp học sinh THPT và người đồng hành dễ dàng mở lời, chia sẻ và lắng nghe nhau mỗi ngày. Ứng dụng đồng hành cùng gia đình, không thay thế hỗ trợ chuyên môn.",
      ),
    );

    root.appendChild(
      createButton({
        label: "Bắt đầu",
        variant: "cta",
        size: "lg",
        onClick: () => ctx.navigate("/how-to-use"),
      }),
    );

    // Liên kết trợ giúp LUÔN hiển thị, không phụ thuộc vai trò/kết nối.
    root.appendChild(
      h("p", { class: "fb-page__aside" },
        h("a", { class: "fb-link", href: "#/help" }, "Tìm trợ giúp"),
      ),
    );

    return root;
  },
};
