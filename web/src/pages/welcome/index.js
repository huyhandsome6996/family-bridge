// U01 — Welcome (Stitch upgrade 2026-10): tái tạo màn chào theo
// docs/design/stitch-reference/u01_ch_o_m_ng_family_bridge/ (screen.png +
// code.html là chuẩn đối chiếu).
//
// Ràng buộc giữ nguyên từ nền tảng:
// - KHÔNG gọi getUserInfo/SDK ở màn mở đầu (không xin quyền nào, không tự
//   dựng đăng nhập Zalo ở đây) — đăng nhập đi qua /login với adapter.
// - CTA "Tiếp tục để đăng nhập" dẫn đúng luồng thật: /login — web đăng nhập
//   bằng mã tài khoản + mật khẩu (loginWithCredentials), KHÔNG có Zalo host.
//   (Port từ mini: label/icon Zalo được thay bằng copy web trung thực;
//   hành vi điều hướng /login giữ nguyên.)
// - Liên kết trợ giúp LUÔN hiển thị, không phụ thuộc vai trò/kết nối.
// Ngoại lệ copy so với prototype (ghi trong docs/design/stitch-ui-upgrade/):
// - "Hơn 1,200 gia đình…" chưa có bằng chứng -> caption trung tính.
// - "Tổng đài 111" chưa có nguồn được duyệt -> dẫn về trang Trợ giúp trong app
//   (nguồn liên hệ được xác minh ở đó), không gọi tel: trực tiếp.
// - Micro-copy chân trang không thay thế cổng đồng ý (consent gate riêng).
import { h } from "../../app/dom.js";
import { createButton, createLogo, createIcon } from "../../components/index.js";
import heroTeaUrl from "../../assets/illustrations/hero-welcome-tea.jpg";

export const page = {
  id: "u01-welcome",
  title: "Family Bridge",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    const root = h("div", { class: "fb-page", dataset: { page: "u01-welcome" } });

    // Pill thông báo phiên thử nghiệm
    root.appendChild(
      h("div", { class: "fb-welcome__pill-row" },
        h("span", { class: "fb-chip fb-chip--high" },
          createIcon({ name: "verified_user", size: 16, className: "fb-welcome__pill-icon" }),
          "Phiên bản thử nghiệm dành cho học sinh & phụ huynh THPT",
        ),
      ),
    );

    // Thẻ hero: logo thật + brand + headline + mô tả
    const hero = h("div", { class: "fb-welcome__hero" });
    const glow = h("div", { class: "fb-logo-glow" });
    glow.appendChild(createLogo({ size: "lg" }));
    hero.appendChild(glow);
    hero.appendChild(h("span", { class: "fb-brand-label" }, "Family Bridge"));
    hero.appendChild(
      h("h1", { class: "fb-welcome__title" }, "Mở lời nhẹ nhàng, gần nhau hơn"),
    );
    hero.appendChild(
      h("p", { class: "fb-welcome__desc" },
        "Cầu nối hỗ trợ giao tiếp và kết nối yêu thương giữa học sinh THPT và gia đình qua hành trình 4 tuần thấu hiểu. Hoàn toàn tự nguyện, tôn trọng sự riêng tư và ranh giới cá nhân.",
      ),
    );
    root.appendChild(hero);

    // Ảnh minh họa + overlay caption trung tính (không dùng số liệu chưa kiểm chứng)
    root.appendChild(
      h("figure", { class: "fb-photo fb-welcome__photo" },
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
            createIcon({ name: "favorite", size: 16, className: "fb-welcome__heart" }),
            " Không gian riêng tư cho gia đình bạn",
          ),
        ),
      ),
    );

    // Thẻ cam kết bảo mật & ranh giới
    const commitment = h("div", { class: "fb-welcome__commit" });
    const shieldCircle = h("span", { class: "fb-welcome__shield", "aria-hidden": "true" });
    shieldCircle.appendChild(createIcon({ name: "shield", size: 20, fill: true }));
    commitment.appendChild(shieldCircle);
    const commitBody = h("div", { class: "fb-welcome__commit-body" });
    commitBody.appendChild(
      h("div", { class: "fb-welcome__commit-head" },
        h("span", { class: "fb-welcome__commit-title" }, "Cam kết bảo mật & ranh giới"),
        h("span", { class: "fb-chip fb-chip--safety" }, "An toàn"),
      ),
    );
    commitBody.appendChild(
      h("p", { class: "fb-welcome__commit-text" },
        "Không chia sẻ tự động nhật ký, không phán xét, không áp lực điểm số.",
      ),
    );
    commitBody.appendChild(
      h("div", { class: "fb-welcome__commit-chips" },
        h("span", { class: "fb-chip fb-chip--low" },
          createIcon({ name: "lock", size: 14 }), "Chỉ mình bạn"),
        h("span", { class: "fb-chip fb-chip--low" },
          createIcon({ name: "timer", size: 14, className: "fb-welcome__chip-timer" }),
          "Quyền suy ngẫm 5 phút"),
      ),
    );
    commitment.appendChild(commitBody);
    root.appendChild(commitment);

    // CTA chính + hành động phụ — port web (task 19-a): web không có host
    // Zalo nên CTA không dùng glyph/copy Zalo. Class giữ đúng contract
    // design-system (fb-btn fb-btn--cta fb-btn--lg); size 48px đặt qua class
    // riêng của màn welcome; điều hướng /login giữ nguyên như mini.
    const actions = h("div", { class: "fb-welcome__actions" });
    const loginCta = h("button", {
      class: "fb-btn fb-btn--cta fb-btn--lg fb-welcome__cta",
      type: "button",
      onclick: () => ctx.navigate("/login"),
    });
    loginCta.appendChild(
      createIcon({ name: "arrow_forward", size: 20, className: "fb-welcome__cta-icon" }),
    );
    loginCta.appendChild(h("span", {}, "Tiếp tục để đăng nhập"));
    actions.appendChild(loginCta);
    actions.appendChild(
      h("div", { class: "fb-welcome__links" },
        h("button", {
          class: "fb-welcome__how",
          type: "button",
          onclick: () => ctx.navigate("/how-to-use"),
        },
          createIcon({ name: "info", size: 18 }),
          h("span", {}, "Tìm hiểu cách Family Bridge hoạt động"),
        ),
        h("a", { class: "fb-welcome__help", href: "#/help" },
          createIcon({ name: "phone_in_talk", size: 18, fill: true }),
          h("span", {}, "Tìm trợ giúp khẩn cấp & tâm lý"),
        ),
      ),
    );
    root.appendChild(actions);

    // Micro-copy: KHÔNG thay thế cổng đồng ý (consent) — chỉ nêu cam kết chung.
    root.appendChild(
      h("p", { class: "fb-welcome__micro" },
        "Family Bridge tôn trọng sự riêng tư của bạn. Mỗi mục chia sẻ đều do bạn chủ động quyết định và có thể thu hồi bất kỳ lúc nào.",
      ),
    );

    return root;
  },
};
