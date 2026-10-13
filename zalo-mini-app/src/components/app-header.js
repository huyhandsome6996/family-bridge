// createAppHeader — header cố định trên cùng cho các màn Stitch U08/U10/U34.
// Cấu trúc theo prototype: [logo box] Family Bridge / subtitle | [Trợ giúp]
// [avatar]. Bên PHẢI chừa 80px cho capsule Zalo (pr-20 trong prototype) —
// việc này KHÔNG đụng vùng menu Zalo vì capsule nằm TRÊN khoảng chừa.
//
// - Trợ giúp: luôn là link #/help (help luôn truy cập được, ui-rules §Help).
// - Avatar: nút → /profile khi onProfile, hoặc phần tử tĩnh khi không đăng
//   nhập (chỉ hiển thị). KHÔNG chứa dữ liệu người dùng nhạy cảm.
import { h } from "../app/dom.js";
import { createIcon } from "./icon.js";

export function createAppHeader({ subtitle = "Trang Chủ", onProfile = null } = {}) {
  const header = h("header", { class: "fb-app-header" });
  const inner = h("div", { class: "fb-app-header__inner" });

  const brand = h("div", { class: "fb-app-header__brand" });
  // Reference U08/U10: ô vuông rust chứa icon diversity_1 màu on-primary-container
  // (KHÔNG nhét logo mark màu rust lên nền rust — sẽ vô hình do trùng tông).
  const logoBox = h("span", { class: "fb-app-header__logo-box", "aria-hidden": "true" });
  logoBox.appendChild(createIcon({ name: "diversity_1", size: 22 }));
  brand.appendChild(logoBox);
  brand.appendChild(
    h("div", { class: "fb-app-header__titles" },
      h("span", { class: "fb-app-header__app-name" }, "Family Bridge"),
      h("span", { class: "fb-app-header__subtitle" }, subtitle),
    )
  );

  const actions = h("div", { class: "fb-app-header__actions" });
  actions.appendChild(
    h("a", {
      class: "fb-app-header__help",
      href: "#/help",
      "aria-label": "Trợ giúp khẩn cấp và tâm lý",
    },
      createIcon({ name: "support_agent", size: 18 }),
      h("span", {}, "Trợ giúp"),
    )
  );

  const avatar = h(
    "button",
    {
      class: "fb-app-header__avatar",
      type: "button",
      "aria-label": "Cá nhân",
      onclick: typeof onProfile === "function" ? onProfile : null,
    },
    createIcon({ name: "person", size: 18 }),
  );
  actions.appendChild(avatar);

  inner.appendChild(brand);
  inner.appendChild(actions);
  header.appendChild(inner);
  return header;
}
