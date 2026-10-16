// Cài đặt (Web Render Task 2, M5b) — tên hiển thị / đổi mật khẩu / đổi mã
// đăng nhập / riêng tư / đăng xuất. Hợp đồng backend Task 19 (worklog):
//   POST /api/v1/auth/class-display-name {current_password, display_name}
//        (tài khoản lớp: đổi tên PHẢI xác thực lại bằng mật khẩu hiện tại)
//   PUT  /api/v1/auth/me {display_name}
//        (tài khoản Zalo: không có mật khẩu dùng được → đường này giữ nguyên)
//   POST /api/v1/auth/class-password {current_password,new_password}
//        → {changed:true, sessions_revoked_other:N}
//   POST /api/v1/auth/class-code {current_password,new_code}
//        → {login_code:"HSxxx", changed:true}
//   GET  /api/v1/auth/class-capabilities → settings.{change_password,change_code,...}
//
// TRUNG THỰC (DSA + worklog Task 19):
// - KHÔNG fake success: capabilities.settings.change_password === false hoặc
//   backend trả 404 → thẻ bị DISABLED kèm lý do, không bao giờ báo "đã đổi".
// - Session KHÔNG chứa mã đăng nhập (login trả {token,expires_at,user,consents})
//   → hiện mã đã che + ghi rõ "mã do lớp cấp — liên hệ giáo viên nếu mất mã".
// - Lỗi phân loại theo kind/code/details.reason (envelope {"error":{code,details}}).
// - Đăng xuất giữ pattern profile: adapter.logout() vô hiệu phiên NGAY, guard
//   theo generation, server thu hồi CHƯA XÁC NHẬN → reason=logged-out-pending.
import { h, clear } from "../../app/dom.js";
import {
  getSession, getSessionGeneration, hasLiveSession, setSession,
} from "../../core/session.js";
import {
  createButton, createCard, createDialog, createEmptyState, createDemoBanner,
} from "../../components/index.js";

const CODE_PATTERN = /^[A-Za-z0-9]{3,16}$/;

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

/** Copy lỗi chung cho các form cài đặt — đọc kind/code/details.reason, KHÔNG đoán thêm. */
export function settingsErrorCopy(error) {
  if (!error) return "Chưa hoàn tất được yêu cầu. Vui lòng thử lại.";
  const code = error && error.code ? String(error.code) : "";
  const reason = error && error.details && error.details.reason
    ? String(error.details.reason) : "";
  if (error.kind === "timeout" || error.kind === "network") {
    return "Máy chủ có thể đang khởi động (bản dùng thử). Thử lại sau khoảng một phút.";
  }
  if (error.kind === "stale_session") {
    return "Phiên đã thay đổi khi yêu cầu đang chạy — hãy kiểm tra lại trạng thái mới nhất rồi thử lại.";
  }
  if (error.status === 403 || reason === "reauth_failed" || code === "not_authorized") {
    return "Mật khẩu hiện tại chưa đúng.";
  }
  if (reason === "same_password" || code === "same_password") {
    return "Mật khẩu mới trùng mật khẩu hiện tại.";
  }
  if (reason === "duplicate_code" || code === "duplicate_code") {
    return "Mã này đã được tài khoản lớp khác dùng. Vui lòng chọn mã khác.";
  }
  if (reason === "same_code" || code === "same_code") {
    return "Mã mới trùng mã hiện tại.";
  }
  if (reason === "invalid_code_format" || code === "invalid_code_format") {
    return "Mã mới chưa đúng định dạng (3–16 chữ cái hoặc số, không dấu cách/ký tự đặc biệt).";
  }
  if (error.status === 400 && reason === "weak_password") {
    return "Mật khẩu mới chưa đủ mạnh theo yêu cầu của máy chủ.";
  }
  if (error.status === 404) {
    return "Tính năng này chưa được bật trên máy chủ.";
  }
  return error.message || "Chưa hoàn tất được yêu cầu. Vui lòng thử lại.";
}

export const page = {
  id: "settings",
  title: "Cài đặt",
  requiresRole: true,
  requiresAuth: true, // cài đặt thao tác trên phiên lớp học (router M1)
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "settings" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    const openDialogs = new Set();
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
      const dialogs = Array.from(openDialogs);
      openDialogs.clear();
      for (const dialog of dialogs) {
        try { dialog.close(); } catch { /* đã đóng rồi */ }
      }
    };

    const demo = Boolean(readState(ctx.store).demoMode);
    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để mở cài đặt",
          description:
            "Cài đặt thao tác trên tài khoản của bạn. Đăng nhập để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) body.appendChild(createDemoBanner());

    const breadcrumb = h("nav", { class: "fb-breadcrumb", "aria-label": "Vị trí trang" });
    breadcrumb.appendChild(h("a", { class: "fb-breadcrumb__link", href: "#/home" }, "Trang chủ"));
    breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__sep", "aria-hidden": "true" }, "›"));
    breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__current" }, "Cài đặt"));
    body.appendChild(breadcrumb);

    body.appendChild(
      h("header", { class: "fb-sec" },
        h("div", { class: "fb-sec__row" },
          h("span", { class: "fb-journey__kicker" }, "Không gian an toàn • Bạn quyết định dữ liệu của mình"),
        ),
        h("h1", { class: "fb-sec__greeting" }, "Cài đặt"),
        h("p", { class: "fb-sec__sub" },
          "Đổi tên hiển thị, mật khẩu và mã đăng nhập — mọi thay đổi do máy chủ xác nhận mới được ghi nhận.",
        ),
      ),
    );

    const thisRun = ++runId;
    // Tên hiện tại: ưu tiên máy chủ (/auth/me), fallback tên trong phiên.
    const session = getSession();
    Promise.resolve()
      .then(() => ctx.adapter.getMyProfile())
      .catch(() => null)
      .then((profile) => {
        if (cancelled || thisRun !== runId) return;
        const currentName = (profile && profile.display_name)
          || (session && session.displayName) || "";
        Promise.resolve()
          .then(() => ctx.adapter.getCapabilities())
          .catch(() => ({}))
          .then((capabilities) => {
            if (cancelled || thisRun !== runId) return;
            renderSettings(body, ctx, {
              demo,
              currentName,
              capabilities: capabilities && typeof capabilities === "object" ? capabilities : {},
              openDialogs,
            });
          });
      });

    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

/* ------------------------------ Trang cài đặt ------------------------------ */

function renderSettings(body, ctx, { demo, currentName, capabilities, openDialogs }) {
  clear(body);
  if (demo) body.appendChild(createDemoBanner());
  const settingsCaps = (capabilities && capabilities.settings) || {};

  // ---- (1) Tên hiển thị: lớp → re-auth mật khẩu; Zalo → PUT /auth/me ----
  const sessionNow = getSession();
  body.appendChild(renderDisplayNameCard(ctx, currentName, {
    isClassLogin: sessionNow && sessionNow.loginMethod === "class",
  }));

  // ---- (2) Đổi mật khẩu: capabilities hoặc 404 thật → disabled trung thực ----
  body.appendChild(renderPasswordCard(ctx, {
    disabledByServer: settingsCaps.change_password === false,
  }));

  // ---- (3) Mã đăng nhập: session KHÔNG có mã → hiện đã che + ghi chú ----
  body.appendChild(renderClassCodeCard(ctx, {
    disabledByServer: settingsCaps.change_code === false,
  }));

  // ---- (4) Riêng tư & đồng ý → #/privacy ----
  body.appendChild(
    createCard({
      title: "Riêng tư",
      description:
        "Xem đang chia sẻ với ai, thu hồi từng mục, yêu cầu xóa dữ liệu và rút đồng ý — "
        + "quyền chia sẻ và đồng ý nằm ở một trang riêng để soát dễ dàng.",
      children: h("a", {
        class: "fb-btn fb-btn--primary",
        href: "#/privacy",
        "aria-label": "Mở trang Riêng tư và đồng ý",
      }, "Mở Riêng tư & đồng ý"),
    }),
  );

  // ---- (5) Đăng xuất (logout có xác nhận, thu hồi phía máy chủ) ----
  body.appendChild(renderLogoutCard(ctx, openDialogs));
}

/* ---------------------------- (1) Tên hiển thị ---------------------------- */

function renderDisplayNameCard(ctx, currentName, { isClassLogin }) {
  const status = h("p", { class: "fb-page__note", role: "status", "aria-live": "polite" });
  const nameField = h("input", {
    class: "fb-input",
    type: "text",
    value: currentName || "",
    maxlength: "80",
    placeholder: "Tên bạn muốn người đồng hành thấy",
    "aria-label": "Tên hiển thị mới",
  });
  // Tài khoản lớp (HS/PH): đổi tên là thay đổi nhạy cảm → xác thực lại bằng
  // mật khẩu hiện tại (hợp đồng Task 19: POST /auth/class-display-name).
  // Tài khoản Zalo: không có mật khẩu dùng được → giữ PUT /auth/me.
  const passwordField = isClassLogin
    ? h("input", {
      class: "fb-input", type: "password",
      autocomplete: "current-password",
      placeholder: "Mật khẩu hiện tại (xác thực lại)",
      "aria-label": "Mật khẩu hiện tại để xác thực lại khi đổi tên",
    })
    : null;
  const saveBtn = createButton({
    label: "Lưu tên hiển thị",
    variant: "primary",
    onClick: () => onSave(),
  });

  function onSave() {
    clear(status);
    const next = String(nameField.value || "").trim();
    if (!next) {
      status.appendChild(h("span", { class: "fb-field__error", role: "alert" },
        "Tên hiển thị không được bỏ trống."));
      return;
    }
    if (isClassLogin && !(passwordField && String(passwordField.value || ""))) {
      status.appendChild(h("span", { class: "fb-field__error", role: "alert" },
        "Vui lòng nhập mật khẩu hiện tại để xác thực lại."));
      return;
    }
    saveBtn.disabled = true;
    status.textContent = "Đang lưu…";
    Promise.resolve()
      .then(() => (isClassLogin
        ? ctx.adapter.changeClassDisplayName({
          currentPassword: String(passwordField.value || ""),
          displayName: next,
        })
        : ctx.adapter.updateMyProfile({ displayName: next })))
      .then((updated) => {
        // Cập nhật tên trong phiên (in-memory) để topbar/sidebar hiển thị khớp.
        const session = getSession();
        if (session) {
          setSession({ ...session, displayName: (updated && updated.display_name) || next });
        }
        status.textContent = "Đã cập nhật tên hiển thị.";
      })
      .catch((error) => {
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        if (error && error.status === 403) {
          status.appendChild(h("span", { class: "fb-field__error", role: "alert" },
            "Mật khẩu hiện tại chưa đúng. Tên hiển thị chưa được đổi."));
          return;
        }
        status.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          settingsErrorCopy(error)));
      })
      .then(() => { saveBtn.disabled = false; });
  }

  const fields = passwordField
    ? h("div", { class: "fb-field" }, nameField, passwordField, saveBtn, status)
    : h("div", { class: "fb-field" }, nameField, saveBtn, status);

  return createCard({
    title: "Tên hiển thị",
    description: isClassLogin
      ? "Tên bạn tự khai báo để người đồng hành nhận ra bạn (không phải danh tính Zalo xác minh). "
        + "Đổi tên cần xác thực lại bằng mật khẩu hiện tại."
      : "Tên bạn tự khai báo để người đồng hành nhận ra bạn (không phải danh tính Zalo xác minh). "
        + "Đổi tên không cần mật khẩu.",
    children: fields,
  });
}

/* ---------------------------- (2) Đổi mật khẩu ---------------------------- */

function renderPasswordCard(ctx, { disabledByServer }) {
  const wrap = h("div", {});
  let disabled = Boolean(disabledByServer);
  draw();

  function draw() {
    clear(wrap);
    const note = h("p", { class: "fb-page__note", role: "status", "aria-live": "polite" });
    const messages = h("ul", { class: "fb-page__note" });

    if (disabled) {
      wrap.appendChild(
        h("p", { class: "fb-field__hint" },
          "Đổi mật khẩu chưa được bật trên máy chủ. Không có gì bị đổi hay giả lập.",
        ),
      );
      return;
    }

    const current = h("input", {
      class: "fb-input", type: "password", autocomplete: "current-password",
      placeholder: "Mật khẩu hiện tại", "aria-label": "Mật khẩu hiện tại",
    });
    const next = h("input", {
      class: "fb-input", type: "password", autocomplete: "new-password",
      placeholder: "Mật khẩu mới", "aria-label": "Mật khẩu mới",
    });
    const confirm = h("input", {
      class: "fb-input", type: "password", autocomplete: "new-password",
      placeholder: "Nhập lại mật khẩu mới", "aria-label": "Nhập lại mật khẩu mới",
    });
    const submit = createButton({
      label: "Đổi mật khẩu",
      variant: "primary",
      onClick: () => onSubmit(),
    });

    function onSubmit() {
      clear(note); clear(messages);
      const currentPassword = String(current.value || "");
      const newPassword = String(next.value || "");
      if (newPassword !== String(confirm.value || "")) {
        note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          "Mật khẩu nhập lại chưa khớp."));
        return;
      }
      submit.disabled = true;
      note.textContent = "Đang đổi mật khẩu…";
      Promise.resolve()
        .then(() => ctx.adapter.changeClassPassword({ currentPassword, newPassword }))
        .then((result) => {
          const revokedOther = result && typeof result.sessions_revoked_other === "number"
            ? result.sessions_revoked_other : 0;
          // Đếm phiên bị đăng xuất LÀ DỮ LIỆU MÁY CHỦ — không bịa, không trừ.
          note.textContent =
            `Đã đổi mật khẩu. ${revokedOther} phiên khác đã được đăng xuất.`;
          current.value = ""; next.value = ""; confirm.value = "";
        })
        .catch((error) => {
          if (error && error.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          if (error && error.status === 404) {
            // Máy chủ chưa có tính năng → disabled trung thực, KHÔNG fake success.
            disabled = true;
            draw();
            return;
          }
          const reason = error && error.details && error.details.reason
            ? String(error.details.reason) : "";
          const serverMessages = error && error.details
            && Array.isArray(error.details.messages) ? error.details.messages : [];
          if (reason === "weak_password" && serverMessages.length) {
            note.textContent = "Mật khẩu mới chưa đủ mạnh:";
            serverMessages.forEach((message) => {
              messages.appendChild(h("li", {}, String(message)));
            });
          } else {
            note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
              settingsErrorCopy(error)));
          }
        })
        .then(() => { if (!disabled) submit.disabled = false; });
    }

    wrap.appendChild(h("div", { class: "fb-field" }, current, next, confirm, submit, note, messages));
  }

  return createCard({
    title: "Đổi mật khẩu",
    description:
      "Đổi mật khẩu sẽ đăng xuất các phiên khác, giữ nguyên phiên hiện tại của bạn.",
    children: wrap,
  });
}

/* --------------------------- (3) Mã đăng nhập ---------------------------- */

function renderClassCodeCard(ctx, { disabledByServer }) {
  const wrap = h("div", {});
  let disabled = Boolean(disabledByServer);
  draw();

  function draw() {
    clear(wrap);
    const note = h("p", { class: "fb-page__note", role: "status", "aria-live": "polite" });

    // Phiên KHÔNG chứa mã đăng nhập (login trả token/user/expires_at/consents) —
    // hiện trạng thái đã che + hướng dẫn thật, không đoán mã.
    wrap.appendChild(
      h("p", { class: "fb-field__hint" },
        "Mã hiện tại: •••••• (đã che). Mã đăng nhập do lớp cấp — liên hệ giáo viên nếu mất mã.",
      ),
    );
    if (disabled) {
      wrap.appendChild(
        h("p", { class: "fb-field__hint" },
          "Đổi mã đăng nhập chưa được bật trên máy chủ.",
        ),
      );
      return;
    }

    const currentPassword = h("input", {
      class: "fb-input", type: "password", autocomplete: "current-password",
      placeholder: "Mật khẩu hiện tại", "aria-label": "Mật khẩu hiện tại để đổi mã",
    });
    const newCode = h("input", {
      class: "fb-input", type: "text", autocomplete: "off",
      placeholder: "Mã mới (3–16 chữ cái/số)", "aria-label": "Mã đăng nhập mới",
      maxlength: "16",
    });
    const submit = createButton({
      label: "Đổi mã đăng nhập",
      variant: "primary",
      onClick: () => onSubmit(),
    });

    function onSubmit() {
      clear(note);
      const code = String(newCode.value || "").trim();
      if (!CODE_PATTERN.test(code)) {
        note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          "Mã mới chưa đúng định dạng (3–16 chữ cái hoặc số, không dấu cách/ký tự đặc biệt)."));
        return;
      }
      submit.disabled = true;
      note.textContent = "Đang đổi mã…";
      Promise.resolve()
        .then(() => ctx.adapter.changeClassCode({
          currentPassword: String(currentPassword.value || ""),
          newCode: code,
        }))
        .then((result) => {
          const loginCode = result && result.login_code ? String(result.login_code) : code;
          note.textContent = `Đã đổi mã đăng nhập thành ${loginCode}.`;
          currentPassword.value = ""; newCode.value = "";
        })
        .catch((error) => {
          if (error && error.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          if (error && error.status === 404) {
            disabled = true;
            draw();
            return;
          }
          note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
            settingsErrorCopy(error)));
        })
        .then(() => { if (!disabled) submit.disabled = false; });
    }

    wrap.appendChild(
      h("div", { class: "fb-field" }, currentPassword, newCode, submit, note),
    );
  }

  return createCard({
    title: "Mã đăng nhập",
    description:
      "Mã là tên tài khoản lớp học để đăng nhập web. Đổi mã cần mật khẩu hiện tại.",
    children: wrap,
  });
}

/* ------------------------------ (5) Đăng xuất ----------------------------- */

function renderLogoutCard(ctx, openDialogs) {
  const button = createButton({
    label: "Đăng xuất",
    variant: "danger",
    onClick: () => {
      const dialog = createDialog({
        title: "Đăng xuất?",
        message:
          "Phiên đăng nhập trên thiết bị này sẽ bị thu hồi. Dữ liệu bạn chia sẻ theo từng mục vẫn giữ nguyên theo lựa chọn của bạn.",
        actions: [
          { label: "Ở lại", variant: "ghost", onClick: () => {} },
          {
            label: "Đăng xuất",
            variant: "danger",
            onClick: () => doLogout(),
          },
        ],
      });
      openDialogs.add(dialog);
    },
  });

  async function doLogout() {
    const startGeneration = getSessionGeneration();
    let revokeConfirmed = true;
    try {
      await ctx.adapter.logout();
    } catch (error) {
      revokeConfirmed = false; // client đã đăng xuất; server thu hồi CHƯA XÁC NHẬN
    }
    if (getSessionGeneration() !== startGeneration) return; // phiên mới khác actor
    ctx.navigate(revokeConfirmed
      ? "/login?reason=logged-out"
      : "/login?reason=logged-out-pending");
  }

  return createCard({
    title: "Đăng xuất",
    description:
      "Kết thúc phiên trên thiết bị này. Token phiên chỉ nằm trong bộ nhớ trình duyệt.",
    children: button,
  });
}
