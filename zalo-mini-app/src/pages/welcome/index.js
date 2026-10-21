// M01 — Chào mừng (Stitch handoff 2026-10-21). Frame tham chiếu:
// m01_ch_o_m_ng_390px + m01_ch_o_m_ng_320px_ch_l_n (code.html chỉ tham khảo
// bố cục — đã loại Design Spec/handoff, hotline "111", "miễn phí 24/7",
// claim "riêng tư tuyệt đối" theo DESIGN-REVIEW.md).
//
// Ràng buộc giữ nguyên từ nền tảng:
// - KHÔNG gọi getUserInfo/SDK ở màn mở đầu (không xin quyền nào, không tự
//   dựng đăng nhập Zalo ở đây) — đăng nhập đi qua /login với adapter.
// - CTA dẫn đúng luồng thật: /login (trong Zalo có đăng nhập im lặng một lần
//   từ main.js; ngoài Zalo hiện hướng dẫn). Không form mật khẩu ở đây.
// - Liên kết trợ giúp LUÔN hiển thị, không phụ thuộc vai trò/kết nối;
//   dẫn về trang Trợ giúp (nguồn liên hệ được xác minh ở đó), không tel:.
import { h } from "../../app/dom.js";
import { createButton, createLogo, createIcon } from "../../components/index.js";
import heroTeaUrl from "../../assets/illustrations/hero-welcome-tea.jpg";

/** Hàng tính năng của frame M01 (390px): icon + tiêu đề + mô tả ngắn. */
const FEATURES = [
  {
    icon: "style",
    title: "Thẻ cảm xúc & lời nhắn",
    text: "Bày tỏ nhẹ nhàng khi chưa sẵn sàng nói trực tiếp. Bạn luôn xem trước toàn bộ nội dung và tự bấm gửi.",
  },
  {
    icon: "hourglass_top",
    title: "Khoảng dừng 300 giây",
    text: "Tùy chọn 5 phút để bình tĩnh xem lại trước khi gửi. Hết giờ thư vẫn là bản nháp — không bao giờ tự gửi.",
  },
  {
    icon: "spa",
    title: "Đồng hành tự nguyện",
    text: "Lộ trình 4 tuần gợi ý mỗi tuần một việc nhỏ. Tham gia, nghỉ hay quay lại đều do bạn quyết định.",
  },
];

export const page = {
  id: "u01-welcome",
  title: "Family Bridge",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "u01-welcome" } });

    // Hàng thương hiệu đầu trang (frame M01: logo + tên + chip "Zalo Mini App")
    const brandRow = h("div", { class: "fb-wm-brand" });
    brandRow.appendChild(createLogo({ size: "md" }));
    brandRow.appendChild(
      h("div", { class: "fb-wm-brand__text" },
        h("span", { class: "fb-wm-brand__name" }, "Family Bridge"),
        h("span", { class: "fb-wm-brand__host" }, "Zalo Mini App"),
      ),
    );
    root.appendChild(brandRow);

    // Hero: headline + mô tả + ảnh minh họa (asset local, caption trung tính)
    const hero = h("div", { class: "fb-wm-hero" });
    hero.appendChild(
      h("h1", { class: "fb-wm-hero__title" }, "Mở lời nhẹ nhàng, gần nhau hơn"),
    );
    hero.appendChild(
      h("p", { class: "fb-wm-hero__desc" },
        "Cầu nối giúp học sinh THPT và người thân lắng nghe tâm tư của nhau "
        + "mà không có áp lực phán xét. Mọi mục chia sẻ đều do bạn chủ động quyết định.",
      ),
    );
    hero.appendChild(
      h("figure", { class: "fb-photo fb-wm-hero__photo" },
        h("img", {
          src: heroTeaUrl,
          alt: "Mẹ và con trò chuyện bên tách trà trên ban công, ánh sáng ấm dịu",
          width: "1200",
          height: "655",
          loading: "eager",
          decoding: "async",
        }),
        h("figcaption", { class: "fb-photo__overlay" },
          h("span", { class: "fb-photo__caption fb-photo__caption--plain" },
            createIcon({ name: "favorite", size: 16, className: "fb-wm-hero__heart" }),
            " Không gian riêng tư cho gia đình bạn",
          ),
        ),
      ),
    );
    root.appendChild(hero);

    // Ba hàng tính năng theo frame M01 390px
    const features = h("div", { class: "fb-wm-features" });
    FEATURES.forEach(({ icon, title, text }) => {
      const row = h("div", { class: "fb-wm-feature" });
      const circle = h("span", { class: "fb-wm-feature__icon", "aria-hidden": "true" });
      circle.appendChild(createIcon({ name: icon, size: 22 }));
      row.appendChild(circle);
      row.appendChild(
        h("div", { class: "fb-wm-feature__body" },
          h("h2", { class: "fb-wm-feature__title" }, title),
          h("p", { class: "fb-wm-feature__text" }, text),
        ),
      );
      features.appendChild(row);
    });
    root.appendChild(features);

    // Thẻ cam kết bảo mật & ranh giới (giữ copy trung thực có sẵn)
    const commitment = h("div", { class: "fb-wm-commit" });
    const shieldCircle = h("span", { class: "fb-wm-commit__shield", "aria-hidden": "true" });
    shieldCircle.appendChild(createIcon({ name: "shield", size: 20, fill: true }));
    commitment.appendChild(shieldCircle);
    const commitBody = h("div", { class: "fb-wm-commit__body" });
    commitBody.appendChild(
      h("div", { class: "fb-wm-commit__head" },
        h("span", { class: "fb-wm-commit__title" }, "Cam kết bảo mật & ranh giới"),
        h("span", { class: "fb-chip fb-chip--safety" }, "An toàn"),
      ),
    );
    commitBody.appendChild(
      h("p", { class: "fb-wm-commit__text" },
        "Không chia sẻ tự động nhật ký, không phán xét, không áp lực điểm số.",
      ),
    );
    commitBody.appendChild(
      h("div", { class: "fb-wm-commit__chips" },
        h("span", { class: "fb-chip fb-chip--low" },
          createIcon({ name: "lock", size: 14 }), "Chỉ mình bạn"),
        h("span", { class: "fb-chip fb-chip--low" },
          createIcon({ name: "timer", size: 14 }),
          "Quyền suy ngẫm 5 phút"),
      ),
    );
    commitment.appendChild(commitBody);
    root.appendChild(commitment);

    // CTA chính + hành động phụ (frame: "Bắt đầu" → luồng đăng nhập thật)
    const actions = h("div", { class: "fb-wm-actions" });
    const loginCta = h("button", {
      class: "fb-btn fb-btn--cta fb-btn--lg fb-wm-actions__cta",
      type: "button",
      onclick: () => ctx.navigate("/login"),
    });
    loginCta.appendChild(
      createIcon({ name: "arrow_forward", size: 20, className: "fb-wm-actions__cta-icon" }),
    );
    loginCta.appendChild(h("span", {}, "Tiếp tục để đăng nhập"));
    actions.appendChild(loginCta);
    actions.appendChild(
      h("div", { class: "fb-wm-links" },
        h("button", {
          class: "fb-wm-links__how",
          type: "button",
          onclick: () => ctx.navigate("/how-to-use"),
        },
          createIcon({ name: "menu_book", size: 18 }),
          h("span", {}, "Xem cách Family Bridge hoạt động"),
        ),
        h("a", { class: "fb-wm-links__help", href: "#/help" },
          createIcon({ name: "support_agent", size: 18 }),
          h("span", {}, "Tìm trợ giúp học đường & tâm lý"),
        ),
      ),
    );
    root.appendChild(actions);

    // Micro-copy: KHÔNG thay thế cổng đồng ý (consent) — chỉ nêu cam kết chung.
    root.appendChild(
      h("p", { class: "fb-wm-micro" },
        "Family Bridge tôn trọng sự riêng tư của bạn. Mỗi mục chia sẻ đều do bạn chủ động quyết định và có thể thu hồi bất kỳ lúc nào.",
      ),
    );

    return root;
  },
};
