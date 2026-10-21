// M05 — Chọn vai trò xem trước (Stitch handoff 2026-10-21). Frame tham chiếu:
// m05_ch_n_vai_tr_xem_tr_c_frame_ch_nh + m05_tr_ng_th_i_ang_chuy_n_v_o_b_n_
// xem_tr_c (đã loại khối "Quy chuẩn bàn giao/Design Spec" và ảnh cá nhân
// remote theo DESIGN-REVIEW.md).
// 2 lựa chọn vai trò XEM TRƯỚC. Không precheck, không auto-chọn, không tạo
// tài khoản/phiên đăng nhập (chỉ setState xem trước). Có trạng thái đang
// chuyển tiếp: khóa nút + chip "Đang tải giao diện…" cho tới khi /home sẵn sàng.
import { h } from "../../app/dom.js";
import { createButton, createIcon, createTopBar } from "../../components/index.js";

const ROLE_CARDS = [
  {
    role: "student",
    icon: "diversity_1",
    title: "Con (học sinh THPT)",
    description:
      "Ghi nhận cảm xúc hàng ngày, mở lời nhẹ nhàng và gửi tâm sự khi sẵn sàng.",
    cta: "Xem giao diện của Con",
  },
  {
    role: "caregiver",
    icon: "family_restroom",
    title: "Người chăm sóc",
    description:
      "Lắng nghe tâm tư, nhận thông điệp chia sẻ và đồng hành cùng con khi được mời.",
    cta: "Xem giao diện của Người chăm sóc",
  },
];

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
    body.appendChild(
      h("p", { class: "fb-page__lead" },
        "Trải nghiệm trước cách hoạt động của ứng dụng. Vai trò tài khoản "
        + "chính thức do máy chủ lớp học xác định khi bạn đăng nhập.",
      ),
    );

    let choosing = false;
    const buttons = [];

    function setLoading(role) {
      for (const { button, card, self } of buttons) {
        button.disabled = true;
        if (self.role === role) {
          card.classList.add("fb-rs-card--loading");
          const chip = card.querySelector(".fb-rs-card__loading");
          if (chip) chip.hidden = false;
        }
      }
    }

    function resetLoading() {
      choosing = false;
      for (const { button, card } of buttons) {
        button.disabled = false;
        card.classList.remove("fb-rs-card--loading");
        const chip = card.querySelector(".fb-rs-card__loading");
        if (chip) chip.hidden = true;
      }
    }

    function choose(role) {
      if (choosing) return;
      choosing = true;
      setLoading(role);
      // ctx.setRole ở main.js trả Promise (import động) — hỗ trợ cả sync.
      Promise.resolve(ctx.setRole(role))
        .then(() => ctx.navigate("/home"))
        .catch(() => { resetLoading(); });
    }

    for (const self of ROLE_CARDS) {
      const card = h("section", { class: "fb-rs-card" });
      const head = h("div", { class: "fb-rs-card__head" });
      const circle = h("span", { class: "fb-rs-card__icon", "aria-hidden": "true" });
      circle.appendChild(createIcon({ name: self.icon, size: 24 }));
      head.appendChild(circle);
      head.appendChild(
        h("div", { class: "fb-rs-card__headtext" },
          h("h3", { class: "fb-rs-card__title" }, self.title),
          h("p", { class: "fb-rs-card__desc" }, self.description),
        ),
      );
      card.appendChild(head);

      // Chip trạng thái đang chuyển tiếp (frame M05-2) — ẩn khi idle.
      const loadingChip = h("span", { class: "fb-chip fb-rs-card__loading", hidden: true },
        createIcon({ name: "hourglass_top", size: 14 }),
        `Đang tải giao diện ${self.role === "student" ? "học sinh" : "người chăm sóc"}…`,
      );
      card.appendChild(loadingChip);

      const button = createButton({
        label: self.cta,
        variant: "primary",
        size: "lg",
        onClick: () => choose(self.role),
      });
      card.appendChild(button);
      buttons.push({ role: self.role, button, card, self });
      body.appendChild(card);
    }

    body.appendChild(
      h("p", { class: "fb-page__note" },
        "Đây là chế độ xem trước giao diện, chưa tạo tài khoản hay phiên đăng nhập.",
      ),
    );

    body.appendChild(
      h("div", { class: "fb-rs__links" },
        h("a", { class: "fb-rs__link", href: "#/login" },
          createIcon({ name: "person", size: 16 }),
          "Đăng nhập tài khoản thật",
        ),
        h("a", { class: "fb-rs__link", href: "#/help" },
          createIcon({ name: "support_agent", size: 16 }),
          "Tìm trợ giúp & hướng dẫn",
        ),
      ),
    );

    return root;
  },
};
