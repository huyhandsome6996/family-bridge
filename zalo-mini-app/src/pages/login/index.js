// F01/M03 — Đăng nhập: giải thích → đang đăng nhập → thành công / thất bại / thử lại.
// Stitch handoff 2026-10-21 (m03_ng_nh_p_b_ng_m_t_i_kho_n + m03_tr_ng_th_i_
// ng_nh_p_x_l_l_i): form mã tài khoản HS/PH + mật khẩu; vai trò do máy chủ
// xác định; lỗi hiển thị inline ngay dưới form (không toast che CTA).
// ĐÃ LOẠI theo DESIGN-REVIEW: SĐT/OTP, "đã liên kết Zalo", số lần thử/chốt
// khóa giả, bàn phím/status bar vẽ trong trang, khối Spec Note.
// Zalo thật (isZaloHost): giữ nguyên đường SDK (không đổi hành vi).
// Host WEB: form mã tài khoản + mật khẩu — đăng nhập /auth/class-session
// qua adapter, capabilities probe trung thực.
// Demo (?demo=1): phiên fixture có nhãn dữ liệu minh họa, không phải phiên thật.
import { h } from "../../app/dom.js";
import { isZaloHost, getTestBuildLabel } from "../../core/config.js";
import { hasLiveSession } from "../../core/session.js";
import { POLICY_PURPOSES } from "../../core/policy.js";
import { loginErrorMessage } from "../../core/login-error.js";
import logoLockupUrl from "../../assets/logo/logo-lockup-transparent.png";
import {
  createButton, createCard, createStatusBadge, createTopBar, createLogo,
  createIcon,
} from "../../components/index.js";
import {
  createCredentialForm, createLocalClassDisabledCard,
} from "./credential-form.js";
import {
  renderLegacyZaloLogin, LEGACY_ZALO_LOGIN_ENABLED,
} from "./legacy-zalo-login.js";

// destroy() chặn các cập nhật async của lần render gần nhất (đăng nhập chậm).
let markRenderCancelled = () => {};

export const page = {
  id: "f01-login",
  title: "Đăng nhập",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    let cancelled = false;
    markRenderCancelled = () => { cancelled = true; };

    const webLogin = !isZaloHost() && !ctx.store.getState().demoMode;
    const root = h("div", {
      class: webLogin ? "fb-page fb-page--web-login" : "fb-page",
      dataset: { page: "f01-login" },
    });

    root.appendChild(
      webLogin ? h("header", { class: "fb-login-header" },
        h("a", { class: "fb-login-header__brand", href: "#/welcome", "aria-label": "Family Bridge — Giới thiệu" },
          createLogo({ size: "md" }), h("span", {}, "Family Bridge"),
        ),
        h("nav", { class: "fb-login-header__nav", "aria-label": "Hướng dẫn và hỗ trợ" },
          h("a", { href: "#/how-to-use" }, "Cách sử dụng"),
          h("a", { href: "#/help" }, "Tìm trợ giúp"),
        ),
      ) : createTopBar({
        title: "Đăng nhập",
        showBack: true,
        onBack: () => ctx.navigate("/how-to-use"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);
    const buildLabel = getTestBuildLabel();
    if (buildLabel) body.appendChild(createStatusBadge({ tone: "info", label: buildLabel }));

    const state = ctx.store.getState();
    const demo = Boolean(state.demoMode);
    const reason = ctx.params && typeof ctx.params.get === "function"
      ? ctx.params.get("reason")
      : null;

    /** Sau khi có phiên: kiểm tra đồng ý -> consent hoặc bước kế tiếp.
     * Dùng chung cho cả nút “Tiếp tục” khi đã có phiên (A05) và luồng web.
     * role đọc TƯƠI từ store (đăng nhập web setRole ngay trước khi gọi). */
    async function proceedAfterLogin() {
      let serviceAccepted = false;
      try {
        const consents = await ctx.adapter.listConsents();
        const service = consents.find((c) => c && c.purpose === POLICY_PURPOSES.service.purpose);
        serviceAccepted = Boolean(
          service && service.decision === "accepted"
            && !service.withdrawn
            && service.policy_version === POLICY_PURPOSES.service.version,
        );
      } catch (error) {
        // Không đọc được trạng thái đồng ý -> dẫn sang trang đồng ý để người
        // dùng ghi nhận rõ ràng (không âm thầm coi như đã đồng ý).
        serviceAccepted = false;
      }
      if (cancelled) return;
      const currentRole = ctx.store.getState().role || state.role;
      if (serviceAccepted && currentRole) ctx.navigate("/home");
      else if (serviceAccepted) ctx.navigate("/role-select");
      else ctx.navigate("/consent");
    }

    // ---- banner phiên hết hạn / đã đăng xuất ----
    if (reason === "expired") {
      body.appendChild(
        createStatusBadge({ tone: "warning", label: "Phiên đã hết hạn. Vui lòng đăng nhập lại." }),
      );
    } else if (reason === "logged-out") {
      body.appendChild(
        createStatusBadge({ tone: "info", label: "Bạn đã đăng xuất." }),
      );
    } else if (reason === "logged-out-pending") {
      body.appendChild(
        createStatusBadge({ tone: "info", label:
          "Bạn đã đăng xuất trên thiết bị. Máy chủ CHƯA xác nhận được thao tác thu hồi — " +
          "phiên cũ sẽ tự hết hạn theo thời hạn; nếu nghi ngờ, đăng nhập lại và đăng xuất lần nữa.",
        }),
      );
    }

    // ---- đã có phiên sống: đi tiếp, không đăng nhập lại ----
    if (hasLiveSession()) {
      body.appendChild(
        createCard({
          title: "Bạn đã đăng nhập",
          description: "Tiếp tục chọn vai trò trải nghiệm hoặc về trang chủ.",
          children: createButton({
            label: "Tiếp tục",
            variant: "primary",
            size: "lg",
            // A05: đi tiếp phải qua kiểm tra đồng ý service hiện hành —
            // KHÔNG đi thẳng /home khi chưa chấp nhận điều khoản.
            onClick: () => { proceedAfterLogin(); },
          }),
        }),
      );
      return root;
    }

    // ---- demo: giữ nguyên luồng fixture (có nhãn minh họa) ----
    if (demo) {
      let demoBusy = false;
      const demoStatus = h("p", { class: "fb-page__note", role: "status" });
      const demoButton = createButton({
        label: "Vào bản xem trước (dữ liệu minh họa)",
        variant: "cta",
        size: "lg",
        onClick: async () => {
          if (demoBusy) return;
          demoBusy = true;
          demoButton.disabled = true;
          demoStatus.textContent = "Đang đăng nhập…";
          try {
            await ctx.adapter.loginWithZaloToken();
            if (cancelled) return;
            demoStatus.textContent = "Đăng nhập thành công.";
            await proceedAfterLogin();
          } catch (error) {
            demoBusy = false;
            demoButton.disabled = false;
            demoStatus.textContent = loginErrorMessage(error);
          }
        },
      });
      body.appendChild(h("h2", { class: "fb-page__heading" }, "Đăng nhập bản xem trước"));
      body.appendChild(
        createCard({
          title: "Chế độ xem trước dùng dữ liệu minh họa",
          description:
            "Phiên trong chế độ này là dữ liệu minh họa trong bộ nhớ — KHÔNG phải phiên thật, " +
            "không gọi máy chủ xác thực. Bản thật dùng đăng nhập Zalo (Mini App) hoặc mã tài khoản (web).",
        }),
      );
      body.appendChild(demoButton);
      body.appendChild(demoStatus);
      body.appendChild(
        h("p", { class: "fb-page__note" },
          "Đăng nhập không đồng nghĩa với đồng ý nghiên cứu hay chia sẻ dữ liệu. " +
          "Nội dung riêng tư của bạn luôn theo quyền chia sẻ từng mục.",
        ),
      );
      body.appendChild(
        h("p", { class: "fb-page__aside" },
          h("a", { href: "#/help" }, "Tìm trợ giúp"),
        ),
      );
      return root;
    }

    // ---- Zalo legacy (giữ nguyên implementation, mặc định tắt theo lệnh Huy 16/10/2026) ----
    if (LEGACY_ZALO_LOGIN_ENABLED) {
      body.appendChild(renderLegacyZaloLogin({ ctx, proceedAfterLogin, cancelled: () => cancelled }));
      return root;
    }

    // ---- Form đăng nhập HS/PH (mã tài khoản + mật khẩu) — active cho cả Zalo Mini App và Web ----
    body.appendChild(renderCredentialLogin({ ctx, proceedAfterLogin, cancelled: () => cancelled }));
    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};

/**
 * Card chia đôi w02: brand panel (logo + badge riêng tư + narrative) +
 * form. Capabilities probe best-effort MỘT lần khi render — nếu máy chủ
 * báo local_class = false thì thay form bằng card trung thực (không giả).
 */
function renderCredentialLogin({ ctx, proceedAfterLogin, cancelled }) {
  const wrap = h("div", { class: "fb-cred" });
  const formSlot = h("div", { class: "fb-cred__slot" });

  // ---- Brand panel (Stitch w02 trái) ----
  const brand = h("div", { class: "fb-cred__brand" });
  const brandGlow1 = h("span", { class: "fb-cred__glow fb-cred__glow--1", "aria-hidden": "true" });
  const brandGlow2 = h("span", { class: "fb-cred__glow fb-cred__glow--2", "aria-hidden": "true" });
  brand.appendChild(brandGlow1);
  brand.appendChild(brandGlow2);

  const brandTop = h("div", { class: "fb-cred__brand-top" });
  brandTop.appendChild(h("div", { class: "fb-logo fb-logo--lg" },
    h("img", {
      src: logoLockupUrl, // Vite đóng gói asset local vào build
      alt: "Family Bridge",
      style: "height:40px;width:auto;",
    }),
  ));
  brandTop.appendChild(
    h("span", { class: "fb-cred__privacy-badge" },
      "Mỗi người giữ quyền riêng tư cho suy nghĩ của mình"),
  );
  brand.appendChild(brandTop);

  const brandMiddle = h("div", { class: "fb-cred__brand-middle" });
  brandMiddle.appendChild(h("h2", { class: "fb-cred__brand-title" }, "Một khoảng gần hơn để cùng lắng nghe"));
  brandMiddle.appendChild(
    h("p", { class: "fb-cred__brand-text" },
      "Family Bridge là nhịp cầu yên tĩnh, an tâm giữa học sinh và người chăm sóc. " +
      "Nơi mỗi cảm xúc được tôn trọng trọn vẹn trước khi chia sẻ."),
  );
  brand.appendChild(brandMiddle);

  const brandFoot = h("div", { class: "fb-cred__brand-foot" });
  brandFoot.appendChild(h("span", {}, "Dành cho học sinh & người chăm sóc"));
  brandFoot.appendChild(h("span", { class: "fb-cred__brand-version" }, "Bản thử nghiệm"));
  brand.appendChild(brandFoot);

  // ---- Form panel (Stitch w02 phải) ----
  const panel = h("div", { class: "fb-cred__panel" });
  panel.appendChild(
    h("div", { class: "fb-cred__head" },
      h("h1", { class: "fb-cred__heading" }, "Đăng nhập Family Bridge"),
      h("p", { class: "fb-cred__sub" },
        "Dành cho học sinh và người chăm sóc tham gia đợt thí điểm"),
    ),
  );

  const cred = createCredentialForm({
    onLogin: async ({ code, password }) => {
      const result = await ctx.adapter.loginWithCredentials({ code, password });
      if (cancelled()) return;
      // role do MÁY CHỦ trả — setRole và bỏ qua role-select. Không có role
      // (máy chủ cũ) → giữ luồng chọn vai trò xem trước như cũ.
      if (result && result.role) {
        ctx.setRole(result.role);
      }
      await proceedAfterLogin();
    },
  });
  formSlot.appendChild(cred.form);
  panel.appendChild(formSlot);

  // Frame M03: ghi chú vai trò — đúng hợp đồng (role do máy chủ trả sau khi
  // đăng nhập, xem proceedAfterLogin/setRole ở trên).
  panel.appendChild(
    h("div", { class: "fb-cred__role-note" },
      createIcon({ name: "info", size: 18, className: "fb-cred__role-note-icon" }),
      h("p", {},
        "Vai trò (Học sinh / Người chăm sóc) được máy chủ lớp học xác định " +
        "tự động ngay sau khi đăng nhập — bạn không cần tự chọn."),
    ),
  );

  panel.appendChild(
    h("div", { class: "fb-cred__notice" },
      h("span", { class: "fb-cred__notice-title" }, "Chưa có tài khoản?"),
      h("p", { class: "fb-cred__notice-text" },
        "Vui lòng liên hệ thầy cô hoặc người phụ trách lớp của bạn để nhận mã định danh. " +
        "Hệ thống không mở đăng ký công khai tự do."),
    ),
  );

  panel.appendChild(
    h("p", { class: "fb-cred__legal" },
      "Đăng nhập không đồng nghĩa với đồng ý nghiên cứu hay chia sẻ dữ liệu. " +
      "Bạn xem và rút lại lựa chọn đồng ý trong ",
      h("a", { href: "#/privacy" }, "Cài đặt & Riêng tư"),
      ".",
    ),
  );

  panel.appendChild(
    h("p", { class: "fb-page__aside" },
      h("a", { href: "#/help" }, "Tìm trợ giúp"),
    ),
  );

  wrap.appendChild(brand);
  wrap.appendChild(panel);

  // ---- Capabilities probe (best-effort, không bao giờ chặn đăng nhập) ----
  Promise.resolve()
    .then(() => ctx.adapter.getCapabilities())
    .then((caps) => {
      if (cancelled()) return;
      const methods = caps && caps.login_methods ? caps.login_methods : null;
      // local_class === false RÕ RÀNG mới hiển thị card tắt (mặc định kỳ vọng bật).
      if (methods && methods.local_class === false) {
        clearSlot();
        formSlot.appendChild(createLocalClassDisabledCard());
      }
    })
    .catch(() => { /* probe lỗi → bỏ qua, form vẫn dùng được */ });

  function clearSlot() {
    while (formSlot.firstChild) formSlot.removeChild(formSlot.firstChild);
  }

  return wrap;
}
