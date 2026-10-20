// F01 — "Người đồng hành" (Stitch port 2026-10, tham chiếu
// connect_01_ng_i_ng_h_nh_active_prelinked: head breadcrumb + Làm mới,
// grid 8/4, thẻ cặp đồng hành active prelinked, banner an toàn).
//
// BẤT BIẾN GIỮ NGUYÊN từ bản thật 1026 dòng (KHÔNG thay bằng dữ liệu minh họa):
// - Làm mới qua adapter THẬT (listConnections/listInvites, bounded A09);
// - Hủy kết nối: dialog xác nhận + revoke API thật; mất response (timeout/
//   stale_session) → kết quả CHƯA XÁC ĐỊNH, KHÔNG tự retry (A10);
// - Skeleton khi tải, empty state, error state + Thử lại;
// - Lời mời hai phía (tạo mã / nhập mã / kiểm tra đúng người / xác nhận /
//   hủy / từ chối) — luồng phụ, chỉ dùng khi người phụ trách yêu cầu thêm;
// - Tên tự khai báo (getMyProfile/updateMyProfile) để đối chiếu đúng người;
// - KHÔNG polling, KHÔNG toast giả thành công (toast "refresh" và "thông báo
//   đã chuyển đến ban phụ trách" của prototype là FAKE — không port), KHÔNG
//   icon chuông/avatar/menu chết.
//
// Prelinked: cặp do người phụ trách lớp cấp và kích hoạt SẴN — trang KHÔNG
// yêu cầu mã mời; empty state hướng Làm mới + liên hệ người phụ trách lớp,
// không đẩy luồng mã mời lên làm chính.
//
// LỖI ĐƯỢC XỬ LÝ RIÊNG (73bf129): backend ConnectionListView có guard nuốt
// exception → trả 200 rỗng. Trang không được coi danh sách rỗng là chắc chắn
// khi máy chủ suy giảm: khi listConnections trả rỗng, probe /ready — nếu
// không "ok" → hiển thị TRẠNG THÁI LỖI + Thử lại (không bao giờ nói
// "bạn chưa có cặp" dựa trên dữ liệu không tin cậy được).
// Giới hạn được ghi nhận trung thực: probe /ready chỉ soi được suy giảm
// toàn cục (DB chết/migration lỗi — đúng các nguyên nhân thực tế của guard);
// exception cục bộ khi DB vẫn sống thì 200-rỗng về mặt kỹ thuật là không
// thể phân biệt từ client — cần backend sửa guard trả 5xx (đã BÁO CÁO, không
// tự sửa package dùng chung). Empty state vẫn giữ hướng dẫn liên hệ người
// phụ trách lớp cho trường hợp bất định này.
import "../../styles/pages-connect.css";

import { h } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton, createCard, createDialog, createEmptyState, createErrorState,
  createIcon, createInput, createSkeleton, createStatusBadge,
} from "../../components/index.js";

let markRenderCancelled = () => {};

const RELATIONSHIP_LABELS = {
  primary: "Người đồng hành chính",
  backup: "Người hỗ trợ dự phòng",
};

// Số dòng mỗi lần tải danh sách (A09: bounded page + “Xem thêm”).
const LIST_PAGE_SIZE = 20;

const INVITE_STATUS_LABELS = {
  pending: "Chờ người kia nhập mã",
  awaiting_confirmation: "Chờ xác nhận",
  active: "Đã kết nối",
  declined: "Đã bị từ chối",
  canceled: "Đã hủy",
  expired: "Đã hết hạn",
};

const SELF_DECLARED_NOTE =
  "Tên tự khai báo — KHÔNG phải danh tính đã xác minh. " +
  "Hãy đối chiếu với nhau ngoài ứng dụng trước khi xác nhận.";

function formatExpiry(iso) {
  const ms = Date.parse(iso || "");
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isUnexpired(iso) {
  const ms = Date.parse(iso || "");
  if (Number.isNaN(ms)) return true; // không rõ hạn -> không tự hủy hiển thị
  return ms > Date.now();
}

/** Nhãn danh tính của người kia: tên tự khai báo hoặc trạng thái chưa đặt. */
function counterpartLabel(counterpart) {
  if (counterpart && counterpart.display_name) {
    return `${counterpart.display_name} (tên tự khai báo, chưa xác minh)`;
  }
  return "Người này chưa đặt tên gọi — hãy hỏi trực tiếp để chắc chắn đúng người";
}

/** Thông điệp tiếng Việt cho lỗi nghiệp vụ (theo envelope code/details). */
function messageFor(error) {
  if (!error) return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
  if (error.kind === "timeout") return "Kết nối quá thời gian chờ. Vui lòng thử lại.";
  if (error.kind === "network") return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (error.kind === "configuration") return error.message;
  // A10: stale session ≠ thất bại chắc chắn — với thao tác ghi, máy chủ có
  // thể đã xử lý trước khi response bị bỏ theo phiên. Phải giữ bất định.
  if (error.kind === "stale_session") {
    return "Phiên đã thay đổi khi yêu cầu đang chạy — kết quả CHƯA XÁC ĐỊNH. " +
      "Bấm Làm mới để kiểm tra trạng thái thật trước khi thử lại.";
  }
  const reason = error.details && error.details.reason ? error.details.reason : null;
  if (error.status === 401) return "Phiên đã hết hạn. Vui lòng đăng nhập lại.";
  if (error.status === 403 && reason === "consent_required") {
    return "Cần chấp nhận Điều khoản sử dụng trước khi kết nối. Mở phần Đồng ý & quyền riêng tư.";
  }
  switch (reason || error.code) {
    case "invalid_or_expired_code":
      return "Mã không đúng hoặc đã hết hạn. Kiểm tra lại mã được cấp.";
    case "already_connected":
      return "Hai bên đã có kết nối đang hoạt động.";
    case "self_connect_denied":
      return "Đây là mã do chính bạn tạo — không thể tự kết nối với mình.";
    case "candidate_not_claimed_yet":
      return "Chưa có ai nhập mã này nên chưa thể xác nhận.";
    case "invite_not_open":
    case "invite_not_confirmable":
      return "Lời mời này không còn có thể thao tác.";
    case "revision_conflict":
      return "Dữ liệu lời mời đã thay đổi. Bấm Làm mới rồi thử lại.";
    case "account_inactive":
      return "Tài khoản của một trong hai bên hiện không thể kích hoạt kết nối.";
    case "rate_limited":
    case "too_many_claim_attempts":
      return "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.";
    case "invite_not_found":
      return "Không tìm thấy lời mời này. Nếu vừa tạo mã, bấm Làm mới để hòa giải — mã cũ có thể đã bị thay thế.";
    case "connection_not_found":
      return "Không tìm thấy kết nối này.";
    default:
      return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
  }
}

/** A10: thông điệp cho THAO TÁC GHI thất bại — giữ bất định khi mất response
 * (timeout/stale): máy chủ có thể đã xử lý; KHÔNG tự retry, cho kiểm tra
 * trạng thái bằng Làm mới trước khi thử lại. */
function mutationOutcomeText(error, { what = "yêu cầu" } = {}) {
  if (error && (error.kind === "timeout" || error.kind === "stale_session")) {
    return `${what} quá thời gian chờ hoặc phiên đã đổi — kết quả CHƯA XÁC ĐỊNH. ` +
      "Bấm Làm mới để kiểm tra trạng thái thật trước khi thử lại.";
  }
  return messageFor(error);
}

export const page = {
  id: "f01-connect",
  title: "Người đồng hành",
  requiresRole: true,
  requiresAuth: true, // dữ liệu phiên lớp học — guard router dẫn về /login
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    let cancelled = false;
    let runId = 0;
    // A08: mọi dialog do trang này mở phải được đóng khi destroy — dialog
    // cũ còn sống trong document.body vẫn bấm được và vẫn gọi mutation.
    const openDialogs = new Set();
    function trackDialog(dialog) {
      openDialogs.add(dialog);
      return dialog;
    }
    markRenderCancelled = () => {
      cancelled = true;
      runId += 1;
      // A08: đóng mọi dialog còn mở của trang (close được gọi lại lần nữa
      // cũng vô hại — bọc try/catch).
      const dialogs = Array.from(openDialogs);
      openDialogs.clear();
      for (const dialog of dialogs) {
        try { dialog.close(); } catch { /* đã đóng rồi */ }
      }
    };

    const root = h("div", { class: "fb-conn", dataset: { page: "f01-connect" } });

    const state = ctx.store.getState();
    const demo = Boolean(state.demoMode);

    if (!demo && !hasLiveSession()) {
      ctx.navigate("/login?reason=expired");
      return root;
    }

    // ---- head: breadcrumb + tiêu đề + lead + Làm mới ----
    const head = h("header", { class: "fb-conn__head" });
    const headRow = h("div", { class: "fb-conn__head-row" });
    const headText = h("div", { class: "fb-conn__head-text" });

    const crumb = h("nav", { class: "fb-conn__crumb", "aria-label": "Vị trí trang" });
    crumb.appendChild(h("a", { href: "#/home" }, "Trang chủ"));
    crumb.appendChild(createIcon({ name: "chevron_right", size: 14 }));
    crumb.appendChild(h("span", { class: "fb-conn__crumb-current", "aria-current": "page" }, "Người đồng hành"));
    headText.appendChild(crumb);
    headText.appendChild(h("h1", { class: "fb-conn__title" }, "Người đồng hành"));
    headText.appendChild(
      h("p", { class: "fb-conn__lead" },
        "Cặp đồng hành được người phụ trách lớp cấp và kích hoạt sẵn. Bạn vẫn tự quyết " +
        "định nội dung muốn chia sẻ — từng mục một.",
      ),
    );
    headRow.appendChild(headText);

    const headActions = h("div", { class: "fb-conn__head-actions" });
    const refreshButton = createButton({
      label: "Làm mới",
      variant: "ghost",
      ariaLabel: "Cập nhật lại trạng thái liên kết",
      onClick: () => refresh({}),
    });
    headActions.appendChild(refreshButton);
    headRow.appendChild(headActions);
    head.appendChild(headRow);
    root.appendChild(head);

    // ---- grid 8/4 ----
    const grid = h("div", { class: "fb-conn__grid" });
    root.appendChild(grid);

    const primary = h("div", { class: "fb-conn__primary" });
    const sideCol = h("div", { class: "fb-conn__col" });
    grid.appendChild(primary);
    grid.appendChild(sideCol);

    // Banner an toàn (copy trung thực — không "bảo mật tuyệt đối")
    const banner = h("section", { class: "fb-conn__banner" });
    const bannerIcon = h("span", { class: "fb-conn__banner-icon", "aria-hidden": "true" });
    bannerIcon.appendChild(createIcon({ name: "verified_user", size: 22 }));
    banner.appendChild(bannerIcon);
    banner.appendChild(
      h("div", {},
        h("div", { class: "fb-conn__banner-title" }, "Không gian an toàn & minh bạch"),
        h("p", { class: "fb-conn__banner-text" },
          "Kết nối không mở quyền xem nội dung riêng của nhau. Mọi dòng chia sẻ chỉ đến " +
          "người đồng hành khi bạn chủ động gửi.",
        ),
      ),
    );
    primary.appendChild(banner);

    // ---- vùng trạng thái chung ----
    const noticeLine = h("p", { class: "fb-page__note", role: "status" });
    function notify(text) { noticeLine.textContent = text || ""; }

    // ---- danh sách kết nối đang hoạt động ----
    const connectionsArea = h("section", { class: "fb-conn__section", "aria-label": "Kết nối đang hoạt động" });
    // ---- tạo mã mời (luồng phụ) ----
    const inviteArea = h("section", {});
    // ---- nhập mã ----
    const claimArea = h("section", {});
    // ---- danh sách lời mời ----
    const invitesArea = h("section", {});
    // ---- tên gọi tự khai báo (cột phụ) ----
    const nameArea = h("section", {});

    primary.appendChild(connectionsArea);
    primary.appendChild(noticeLine);

    const inviteWrap = h("section", { class: "fb-conn__section" });
    inviteWrap.appendChild(h("h2", { class: "fb-page__heading" }, "Kết nối khác bằng lời mời"));
    inviteWrap.appendChild(
      h("p", { class: "fb-page__note" },
        "Chỉ dùng khi người phụ trách lớp yêu cầu ghép nối bổ sung. Cặp đồng hành hiện " +
        "tại vẫn giữ nguyên.",
      ),
    );
    inviteWrap.appendChild(inviteArea);
    primary.appendChild(inviteWrap);

    const claimWrap = h("section", { class: "fb-conn__section" });
    claimWrap.appendChild(h("h2", { class: "fb-page__heading" }, "Nhập mã mời bạn nhận được"));
    claimWrap.appendChild(claimArea);
    primary.appendChild(claimWrap);

    primary.appendChild(invitesArea);

    // Cột phụ (4/12) — "Quyền riêng tư & Lựa chọn" (tham chiếu Stitch
    // connect_01). Copy trung thực: ranh giới thật của hệ thống, KHÔNG
    // "bảo mật tuyệt đối", KHÔNG "xác thực bởi trường", KHÔNG dữ liệu tài
    // khoản bịa. Mọi liên kết dẫn tới trang thật (#/privacy, #/help).
    const privacyAside = h("section", {
      class: "fb-conn__aside-card",
      "aria-labelledby": "fb-conn-privacy-title",
    });
    const asideHead = h("div", { class: "fb-conn__aside-head" });
    const asideHeadIcon = h("span", { class: "fb-conn__aside-head-icon", "aria-hidden": "true" });
    asideHeadIcon.appendChild(createIcon({ name: "shield_person", size: 20 }));
    asideHead.appendChild(asideHeadIcon);
    asideHead.appendChild(
      h("h2", { class: "fb-conn__aside-title", id: "fb-conn-privacy-title" },
        "Quyền riêng tư & Lựa chọn"),
    );
    privacyAside.appendChild(asideHead);

    const privacyPoints = [
      {
        icon: "lock",
        title: "Kết nối không mở quyền xem tự do",
        text: "Người đồng hành không thể xem nhật ký riêng tư, cảm xúc cá nhân hay những thư bạn chưa chủ động gửi.",
      },
      {
        icon: "send",
        title: "Chia sẻ theo từng mục riêng",
        text: "Mỗi dòng chia sẻ chỉ đến người đồng hành khi bạn chủ động gửi — từng mục một, có thể thu hồi riêng.",
      },
      {
        icon: "tune",
        title: "Toàn quyền thu hồi",
        text: "Bạn có thể xem và thu hồi từng quyền đã cấp bất cứ lúc nào trong Riêng tư & đồng ý.",
      },
    ];
    for (const point of privacyPoints) {
      const row = h("div", { class: "fb-conn__point" });
      const pointIcon = h("span", { class: "fb-conn__point-icon", "aria-hidden": "true" });
      pointIcon.appendChild(createIcon({ name: point.icon, size: 15 }));
      row.appendChild(pointIcon);
      row.appendChild(
        h("div", {},
          h("div", { class: "fb-conn__point-title" }, point.title),
          h("p", { class: "fb-conn__point-text" }, point.text),
        ),
      );
      privacyAside.appendChild(row);
    }

    const asideLinks = h("div", { class: "fb-conn__aside-links" });
    asideLinks.appendChild(
      h("a", { class: "fb-conn__aside-link", href: "#/privacy" },
        h("span", {}, "Riêng tư & đồng ý"),
        createIcon({ name: "arrow_forward", size: 16 }),
      ),
    );
    asideLinks.appendChild(
      h("a", { class: "fb-conn__aside-link fb-conn__aside-link--muted", href: "#/help" },
        h("span", {}, "Hướng dẫn & Trợ giúp"),
        createIcon({ name: "arrow_forward", size: 16 }),
      ),
    );
    privacyAside.appendChild(asideLinks);
    sideCol.appendChild(nameArea);
    sideCol.appendChild(privacyAside);

    const busyOps = new Set();
    function isBusy(op) { return busyOps.has(op); }
    function setBusy(op, value) {
      if (value) busyOps.add(op); else busyOps.delete(op);
    }

    // guarded(op, ref, run): chặn double-click. ref = { current: button }
    // được gán SAU khi tạo nút — tránh TDZ khi onClick tham chiếu chính nó.
    function guarded(op, ref, run) {
      return async (...args) => {
        if (cancelled || isBusy(op)) return;
        setBusy(op, true);
        if (ref && ref.current) ref.current.disabled = true;
        try {
          await run(...args);
        } finally {
          setBusy(op, false);
          if (!cancelled && ref && ref.current) ref.current.disabled = false;
        }
      };
    }

    // ------------------------------------------------------------------
    // Tên gọi tự khai báo (để hai bên kiểm tra đúng người)
    // ------------------------------------------------------------------
    const nameState = { value: "", loaded: false, dirty: false };

    function renderNameCard() {
      nameArea.replaceChildren();
      const nameField = createInput({
        id: "fb-display-name",
        label: "Tên gọi của bạn (tự khai báo)",
        hint: "Ví dụ: “Mẹ Nam” hoặc “Minh — lớp 9A”. Bên kia sẽ thấy tên này để " +
          "kiểm tra đúng người trước khi kết nối và trước khi hủy kết nối.",
        maxlength: 80,
        placeholder: "Chưa đặt tên gọi",
        onInput: () => {
          // A13: input của người dùng là dirty — GET chậm không được ghi đè.
          nameState.dirty = true;
          nameState.value = nameField.input.value;
          saveRef.current.disabled = nameField.input.value.trim().length === 0;
        },
      });
      nameField.input.value = nameState.value;
      const saveRef = { current: null };
      const saveButton = createButton({
        label: "Lưu tên gọi",
        variant: "ghost",
        disabled: nameState.value.trim().length === 0,
        onClick: guarded("save-name", saveRef, async () => {
          try {
            const saved = await ctx.adapter.updateMyProfile({
              displayName: nameState.value.trim(),
            });
            if (cancelled) return;
            nameState.value = (saved && saved.display_name) || nameState.value.trim();
            notify("Tên gọi đã được cập nhật trên máy chủ. " + SELF_DECLARED_NOTE);
            renderNameCard();
          } catch (error) {
            if (cancelled) return;
            notify(messageFor(error));
          }
        }),
      });
      saveRef.current = saveButton;
      nameArea.appendChild(
        createCard({
          title: "Tên gọi để kiểm tra đúng người",
          description: SELF_DECLARED_NOTE +
            " Không xin số điện thoại, vị trí hay ép quyền tên/avatar.",
          children: [nameField, saveButton],
        }),
      );
    }

    async function loadName() {
      try {
        const profile = await ctx.adapter.getMyProfile();
        if (cancelled) return;
        // A13: người dùng đã gõ trong lúc GET chậm -> KHÔNG ghi đè dữ liệu
        // mới nhập bằng response cũ; tên máy chủ chỉ áp dụng khi input sạch.
        if (nameState.dirty) return;
        nameState.value = (profile && profile.display_name) || "";
        nameState.loaded = true;
        renderNameCard();
      } catch {
        if (cancelled) return;
        // Không chặn trang: chỉ ghi chú nhỏ.
        nameState.loaded = true;
        renderNameCard();
      }
    }

    // ------------------------------------------------------------------
    // Tạo mã mời
    // ------------------------------------------------------------------
    let createdInvite = null; // {invite_id, code, expires_at} — còn hợp lệ mới hiển thị

    function showCreatedInvite(created) {
      inviteArea.replaceChildren();
      const codeText = h("p", {
        class: "fb-page__title",
        style: "font-family:monospace;font-size:24px;letter-spacing:3px;",
      }, created.code);
      inviteArea.appendChild(
        createCard({
          title: "Mã mời của bạn",
          description: null,
          children: [
            codeText,
            h("p", { class: "fb-page__note" },
              "Mã chỉ hiển thị MỘT lần. Hãy nhờ bên kia mở Family Bridge và nhập mã này. " +
              "Mã hết hạn lúc: " + (formatExpiry(created.expires_at) || "không rõ") + ".",
            ),
            createStatusBadge({ tone: "info", label: "Đã tạo mã mời — chưa có ai nhập mã" }),
          ],
        }),
      );
    }

    /** Card "đang có lời mời chờ người kia nhập mã" (không còn raw code). */
    function showOpenPendingCard(openInvite) {
      inviteArea.replaceChildren();
      const replaceRef = { current: null };
      const replaceButton = createButton({
        label: "Tạo mã mới thay thế",
        variant: "ghost",
        onClick: guarded("create", replaceRef, async () => {
          await createInvite();
        }),
      });
      replaceRef.current = replaceButton;
      inviteArea.appendChild(
        createCard({
          title: "Mã mời đang mở",
          description:
            "Bạn đã có một lời mời đang chờ (hết hạn lúc " +
            (formatExpiry(openInvite.expires_at) || "không rõ") +
            "). Vì lý do bảo mật bạn không xem lại được mã này — hãy dùng mã " +
            "đã chuyển cho bên kia, hoặc tạo mã mới (mã cũ tự bị hủy).",
          children: replaceButton,
        }),
      );
    }

    /** Card "đã có người nhập mã" — mã KHÔNG còn dùng được. */
    function showClaimedCard(openInvite) {
      inviteArea.replaceChildren();
      const replaceRef = { current: null };
      const replaceButton = createButton({
        label: "Tạo mã mới thay thế",
        variant: "ghost",
        onClick: guarded("create", replaceRef, async () => {
          await createInvite();
        }),
      });
      replaceRef.current = replaceButton;
      inviteArea.appendChild(
        createCard({
          title: "Mã mời đã có người nhập",
          description:
            "Mã này đã được dùng — KHÔNG còn sử dụng được. Kiểm tra tên người nhập " +
            "(" + counterpartLabel(openInvite.counterpart) + ") trong thẻ lời mời bên dưới, " +
            "rồi xác nhận hoặc từ chối ở đó.",
          children: replaceButton,
        }),
      );
    }

    function renderInviteSection(openInvite) {
      if (createdInvite) {
        // Mã hợp lệ (backend xác nhận vẫn pending + chưa hết hạn) giữ nguyên
        // hiển thị sau một refresh bình thường.
        showCreatedInvite(createdInvite);
        return;
      }
      if (openInvite && openInvite.status === "awaiting_confirmation") {
        showClaimedCard(openInvite);
        return;
      }
      if (openInvite && openInvite.status === "pending") {
        showOpenPendingCard(openInvite);
        return;
      }
      inviteArea.replaceChildren();
      const createRef = { current: null };
      const createButtonEl = createButton({
        label: "Tạo mã mời",
        variant: "primary",
        size: "lg",
        onClick: guarded("create", createRef, async () => {
          await createInvite();
        }),
      });
      createRef.current = createButtonEl;
      inviteArea.appendChild(
        createCard({
          title: "Mời người đồng hành kết nối",
          description:
            "Tạo mã mời 12 ký tự rồi chuyển cho con/người thân nhập trong ứng dụng. " +
            "Mã chỉ hiển thị một lần và có thời hạn 7 ngày.",
          children: createButtonEl,
        }),
      );
    }

    async function createInvite() {
      notify("Đang tạo mã mời…");
      try {
        const created = await ctx.adapter.createInvite({ relationshipKind: "primary" });
        if (cancelled) return;
        notify("");
        createdInvite = created || null;
        showCreatedInvite(createdInvite);
        await refresh({ silent: true });
      } catch (error) {
        if (cancelled) return;
        // A10: mã mời chỉ trả một lần — nếu kết quả chưa xác định thì KHÔNG
        // được tự tạo lại (trùng lời mời), cho hòa giải bằng Làm mới trước.
        notify(mutationOutcomeText(error, {
          what: "Tạo mã mời",
        }));
      }
    }

    // ------------------------------------------------------------------
    // Nhập mã mời (phía bên kia) — kiểm tra đúng người TRƯỚC khi đồng ý
    // ------------------------------------------------------------------
    // claimState sống qua các lần refresh: lỗi mạng không được phá trạng
    // thái này, và KHÔNG BAO GIỜ tự replay thao tác ghi (claim chỉ chạy khi
    // người dùng bấm nút).
    const claimState = {
      mode: "form",     // form | preview | claimed
      typedCode: "",
      preview: null,    // {code, relationship_kind, expires_at, counterpart}
    };

    function renderClaimSection() {
      const hadFocus = document.activeElement
        && document.activeElement.id === "fb-invite-code";
      claimArea.replaceChildren();

      if (claimState.mode === "claimed") {
        const name = claimState.preview && claimState.preview.counterpart
          && claimState.preview.counterpart.display_name;
        claimArea.appendChild(
          createCard({
            title: "Bạn đã đồng ý kết nối",
            description:
              "Với " + (name
                ? `${name} (tên tự khai báo). `
                : "người tạo mã. ") +
              "Bây giờ chờ người tạo mã đối chiếu và xác nhận phía còn lại — " +
              "khi họ xác nhận, kết nối mới được kích hoạt cho cả hai.",
            children: createStatusBadge({
              tone: "warning",
              label: "Chờ người tạo mã xác nhận",
            }),
          }),
        );
        return;
      }

      if (claimState.mode === "preview") {
        const preview = claimState.preview;
        const name = preview.counterpart && preview.counterpart.display_name;
        const agreeRef = { current: null };
        const agreeButton = createButton({
          label: "Đồng ý kết nối",
          variant: "cta",
          onClick: guarded("claim", agreeRef, async () => {
            notify("Đang gửi đồng ý…");
            try {
              const result = await ctx.adapter.claimInvite(preview.code);
              if (cancelled) return;
              notify("");
              claimState.mode = "claimed";
              claimState.preview = result || preview;
              renderClaimSection();
              await refresh({ silent: true });
            } catch (error) {
              if (cancelled) return;
              claimState.mode = "form";
              renderClaimSection();
              notify(mutationOutcomeText(error, { what: "Đồng ý kết nối" }));
            }
          }),
        });
        agreeRef.current = agreeButton;
        const retypeRef = { current: null };
        const retypeButton = createButton({
          label: "Nhập lại mã khác",
          variant: "ghost",
          onClick: () => {
            claimState.mode = "form";
            claimState.typedCode = "";
            claimState.preview = null;
            renderClaimSection();
          },
        });
        retypeRef.current = retypeButton;
        claimArea.appendChild(
          createCard({
            title: "Kiểm tra đúng người trước khi đồng ý",
            description:
              "Người tạo mã này: " + (name
                ? `${name} — ${SELF_DECLARED_NOTE}`
                : "chưa đặt tên gọi (" + SELF_DECLARED_NOTE + ")") +
              ". Quan hệ đề nghị: " +
              (RELATIONSHIP_LABELS[preview.relationship_kind]
                || preview.relationship_kind) +
              ". Chỉ đồng ý khi đúng là người bạn định kết nối.",
            children: [agreeButton, retypeButton],
          }),
        );
        return;
      }

      // mode "form"
      const codeField = createInput({
        id: "fb-invite-code",
        label: "Nhập mã mời nhận được",
        hint: "Mã gồm 12 ký tự, không có chữ I, O và số 1, 0.",
        maxlength: 12,
        placeholder: "Ví dụ: AB2CD3EF4GH5",
        onInput: () => {
          claimState.typedCode = codeField.input.value
            .toUpperCase().replace(/[^A-Z2-9]/g, "");
          codeField.input.value = claimState.typedCode;
          checkButton.disabled = claimState.typedCode.length !== 12;
        },
      });
      codeField.input.value = claimState.typedCode;
      const checkRef = { current: null };
      const checkButton = createButton({
        label: "Kiểm tra mã",
        variant: "primary",
        disabled: claimState.typedCode.length !== 12,
        onClick: guarded("preview", checkRef, async () => {
          const code = claimState.typedCode.trim().toUpperCase();
          if (code.length !== 12) {
            codeField.setError("Mã phải đủ 12 ký tự.");
            return;
          }
          codeField.setError(null);
          notify("Đang kiểm tra mã…");
          try {
            const preview = await ctx.adapter.previewInvite(code);
            if (cancelled) return;
            notify("");
            claimState.mode = "preview";
            claimState.preview = { ...preview, code };
            renderClaimSection();
          } catch (error) {
            if (cancelled) return;
            codeField.setError(messageFor(error));
            notify("");
          }
        }),
      });
      checkRef.current = checkButton;
      claimArea.appendChild(
        createCard({
          title: "Đã nhận được mã mời?",
          description:
            "Nhập mã mời gồm 12 ký tự mà bên kia chuyển cho bạn. Bạn sẽ thấy " +
            "ai tạo mã trước khi quyết định đồng ý.",
          children: [codeField, checkButton],
        }),
      );

      if (hadFocus) {
        const input = claimArea.querySelector("#fb-invite-code");
        if (input) input.focus();
      }
    }

    // ------------------------------------------------------------------
    // Danh sách lời mời + hành động
    // ------------------------------------------------------------------
    function confirmDialog(invite) {
      const name = counterpartLabel(invite.counterpart);
      const dialog = trackDialog(createDialog({
        title: "Xác nhận kết nối?",
        message:
          `Người nhập mã của bạn: ${name}. ` + SELF_DECLARED_NOTE +
          " Chỉ xác nhận khi đúng là người bạn định kết nối. Sau khi xác nhận, " +
          "kết nối được kích hoạt cho cả hai.",
        actions: [
          { label: "Xem lại", variant: "ghost", onClick: () => dialog.close() },
          {
            label: "Xác nhận kết nối",
            variant: "cta",
            onClick: () => {
              dialog.close();
              // A08: confirmNow đi qua guarded("confirm-request") — busy
              // guard bao trùm request thật, chống double-submit.
              guarded("confirm-request", null, () => confirmNow(invite))();
            },
          },
        ],
      }));
    }

    async function confirmNow(invite) {
      // A08: trang đã destroy -> KHÔNG gửi request từ xác UI đã chết.
      if (cancelled || !hasLiveSession()) return;
      notify("Đang xác nhận…");
      try {
        const result = await ctx.adapter.confirmInvite(invite.invite_id, {
          expectedRevision: typeof invite.revision === "number" ? invite.revision : null,
        });
        if (cancelled) return;
        const connection = result && result.connection;
        notify(connection
          ? `Hai bên đã kết nối (${RELATIONSHIP_LABELS[connection.relationship_kind] || connection.relationship_kind}).`
          : "Hai bên đã kết nối.");
        await refresh({ silent: true });
      } catch (error) {
        if (cancelled) return;
        notify(mutationOutcomeText(error, { what: "Xác nhận kết nối" }));
        await refresh({ silent: true });
      }
    }

    function inviteActions(invite) {
      const actions = [];
      const isInviter = invite.role === "inviter";
      if (invite.status === "pending" && isInviter) {
        const ref = { current: null };
        const button = createButton({
          label: "Hủy lời mời này",
          variant: "ghost",
          onClick: guarded(`cancel-${invite.invite_id}`, ref, async () => {
            try {
              await ctx.adapter.cancelInvite(invite.invite_id);
              if (cancelled) return;
              notify("Lời mời đã được hủy.");
              await refresh({ silent: true });
            } catch (error) {
              if (cancelled) return;
              notify(mutationOutcomeText(error, { what: "Hủy lời mời" }));
            }
          }),
        });
        ref.current = button;
        actions.push(button);
      }
      if (invite.status === "awaiting_confirmation" && isInviter) {
        const confirmRef = { current: null };
        const confirmButton = createButton({
          label: "Xác nhận kết nối",
          variant: "cta",
          onClick: guarded(`confirm-${invite.invite_id}`, confirmRef, async () => {
            confirmDialog(invite);
          }),
        });
        confirmRef.current = confirmButton;
        actions.push(confirmButton);
        const cancelRef = { current: null };
        const cancelButton = createButton({
          label: "Hủy lời mời",
          variant: "ghost",
          onClick: guarded(`cancel-${invite.invite_id}`, cancelRef, async () => {
            try {
              await ctx.adapter.cancelInvite(invite.invite_id);
              if (cancelled) return;
              notify("Lời mời đã được hủy.");
              await refresh({ silent: true });
            } catch (error) {
              if (cancelled) return;
              notify(mutationOutcomeText(error, { what: "Hủy lời mời" }));
            }
          }),
        });
        cancelRef.current = cancelButton;
        actions.push(cancelButton);
      }
      if (invite.status === "awaiting_confirmation" && !isInviter) {
        const declineRef = { current: null };
        const declineButton = createButton({
          label: "Từ chối lời mời",
          variant: "ghost",
          onClick: guarded(`decline-${invite.invite_id}`, declineRef, async () => {
            try {
              await ctx.adapter.declineInvite(invite.invite_id);
              if (cancelled) return;
              notify("Lời mời đã bị từ chối.");
              await refresh({ silent: true });
            } catch (error) {
              if (cancelled) return;
              notify(mutationOutcomeText(error, { what: "Từ chối lời mời" }));
            }
          }),
        });
        declineRef.current = declineButton;
        actions.push(declineButton);
      }
      return actions;
    }

    function renderInvites(invites, { hasMore = false, onLoadMore = null } = {}) {
      invitesArea.replaceChildren();
      const rows = invites.filter((invite) => invite && invite.status !== "active");
      invitesArea.appendChild(h("h2", { class: "fb-page__heading" }, "Lời mời gần đây"));
      if (!rows.length) {
        invitesArea.appendChild(
          createEmptyState({
            title: "Chưa có lời mời nào",
            description: "Lời mời bạn tạo hoặc nhận sẽ hiện ở đây kèm trạng thái.",
            action: null,
          }),
        );
        return;
      }
      // A09: hiện TOÀN BỘ trang đã tải (không slice ẩn dòng) — dòng vượt
      // trang được nạp bằng nút “Xem thêm”. Lời mời đã hết hạn không còn
      // hiện hành động như còn hiệu lực (A06).
      for (const invite of rows) {
        const expiredOpen = (invite.status === "pending"
          || invite.status === "awaiting_confirmation")
          && !isUnexpired(invite.expires_at);
        const effectiveStatus = expiredOpen ? "expired" : invite.status;
        const label = INVITE_STATUS_LABELS[effectiveStatus] || effectiveStatus;
        const tone = effectiveStatus === "pending" ? "info"
          : effectiveStatus === "awaiting_confirmation" ? "warning"
            : "neutral";
        const side = invite.role === "inviter" ? "Bạn tạo" : "Bạn nhận";
        const kind = RELATIONSHIP_LABELS[invite.relationship_kind] || invite.relationship_kind;
        const children = [
          createStatusBadge({ tone, label: `${side} · ${label}` }),
        ];
        if (effectiveStatus === "awaiting_confirmation") {
          // Nhận biết đúng người: ai đã nhập mã / ai tạo mã.
          children.push(h("p", { class: "fb-page__note" },
            invite.role === "inviter"
              ? `Người nhập mã: ${counterpartLabel(invite.counterpart)}.`
              : `Người tạo mã: ${counterpartLabel(invite.counterpart)}.`));
        }
        children.push(h("p", { class: "fb-page__note" },
          (formatExpiry(invite.expires_at) ? `Hết hạn lúc ${formatExpiry(invite.expires_at)}.` : ""),
        ));
        // A06: lời mời đã hết hạn KHÔNG còn nút hành động.
        if (!expiredOpen) {
          for (const action of inviteActions(invite)) children.push(action);
        }
        invitesArea.appendChild(
          createCard({
            title: `${side} lời mời — ${kind}`,
            description: null,
            children,
          }),
        );
      }
      if (hasMore && onLoadMore) {
        const moreRef = { current: null };
        const moreButton = createButton({
          label: "Xem thêm lời mời",
          variant: "ghost",
          onClick: guarded("invites-more", moreRef, onLoadMore),
        });
        moreRef.current = moreButton;
        invitesArea.appendChild(moreButton);
      }
    }

    // ------------------------------------------------------------------
    // Kết nối đang hoạt động — thẻ "Người đồng hành" (Stitch prelinked)
    // ------------------------------------------------------------------
    function overviewField(label, value) {
      const field = h("div", { class: "fb-conn__overview-field" });
      field.appendChild(h("span", { class: "fb-conn__overview-label" }, label));
      field.appendChild(h("span", { class: "fb-conn__overview-value" }, value));
      return field;
    }

    function companionCard(connection) {
      const kind = RELATIONSHIP_LABELS[connection.relationship_kind]
        || connection.relationship_kind
        || "Không rõ";
      const displayName = connection.counterpart && connection.counterpart.display_name
        ? String(connection.counterpart.display_name)
        : "";
      const initial = displayName.trim().charAt(0).toUpperCase() || "•";
      const isActive = connection.status === "active";
      const statusLabel = isActive ? "Đã kết nối" : (connection.status || "Không rõ");

      const card = h("section", { class: "fb-conn__card", "aria-label": "Cặp đồng hành" });
      // Nền tonal trang trí (markup tĩnh, không dữ liệu người dùng)
      card.appendChild(h("span", { class: "fb-conn__card-glow", "aria-hidden": "true" }));

      // Top bar: trạng thái thật của kết nối
      const cardTop = h("div", { class: "fb-conn__card-top" });
      cardTop.appendChild(createStatusBadge({
        tone: isActive ? "success" : "neutral",
        label: statusLabel,
      }));
      card.appendChild(cardTop);

      // Hồ sơ người đồng hành — CHỈ dữ liệu API trả (tên hiển thị), fallback
      // trung tính khi thiếu; KHÔNG tên/online/last-seen bịa.
      const profile = h("div", { class: "fb-conn__profile" });
      const avatarCol = h("div", { class: "fb-conn__avatar-col" });
      avatarCol.appendChild(h("span", { class: "fb-conn__avatar", "aria-hidden": "true" }, initial));
      profile.appendChild(avatarCol);
      const meta = h("div", { class: "fb-conn__meta" });
      const nameRow = h("div", { class: "fb-conn__name-row" });
      nameRow.appendChild(h("h3", { class: "fb-conn__name" }, displayName || "Chưa đặt tên gọi"));
      nameRow.appendChild(h("span", { class: "fb-conn__role-chip" }, kind));
      meta.appendChild(nameRow);
      meta.appendChild(
        h("p", { class: "fb-conn__source" },
          createIcon({ name: "family_restroom", size: 16 }),
          h("span", {}, displayName
            ? "Tên do người đồng hành tự khai báo — chưa phải danh tính đã xác minh."
            : "Người này chưa đặt tên gọi — hãy hỏi trực tiếp để chắc chắn đúng người."),
        ),
      );
      profile.appendChild(meta);
      card.appendChild(profile);

      // Box tổng quan đọc-only (dữ liệu thật từ API)
      const overview = h("div", { class: "fb-conn__overview" });
      overview.appendChild(overviewField("Người đồng hành", displayName || "Chưa đặt tên gọi"));
      overview.appendChild(overviewField("Loại kết nối", kind));
      overview.appendChild(overviewField("Trạng thái", statusLabel));
      card.appendChild(overview);
      if (typeof connection.generation === "number") {
        card.appendChild(
          h("p", { class: "fb-conn__generation" },
            `Thế hệ kết nối (generation): ${connection.generation}.`),
        );
      }

      // Hành động chính — liên kết đến các màn thật
      const actionsRow = h("div", { class: "fb-conn__card-actions" });
      actionsRow.appendChild(
        h("a", { class: "fb-btn fb-btn--primary", href: "#/mailbox" }, "Mở hộp thư"),
      );
      actionsRow.appendChild(
        h("a", { class: "fb-btn fb-btn--ghost", href: "#/privacy" }, "Quản lý chia sẻ"),
      );
      card.appendChild(actionsRow);

      // Chân thẻ: ranh giới + hủy kết nối (dialog thật + revoke API thật)
      const cardFooter = h("div", { class: "fb-conn__card-footer" });
      cardFooter.appendChild(
        h("span", { class: "fb-conn__footer-note" },
          createIcon({ name: "info", size: 16 }),
          h("span", {}, "Tùy chọn kết nối"),
        ),
      );
      const footerSide = h("div", { class: "fb-conn__footer-side" });
      const revokeRef = { current: null };
      const revokeButton = h("button", {
        class: "fb-conn__unlink",
        type: "button",
        onclick: guarded(`revoke-${connection.connection_id}`, revokeRef, async () => {
          const dialog = trackDialog(createDialog({
            title: "Hủy kết nối cặp đồng hành này?",
            message:
              `Bạn sắp hủy kết nối với: ${counterpartLabel(connection.counterpart)}. ` +
              "Sau khi hủy, các quyền chia sẻ dựa trên kết nối này mất hiệu lực NGAY và " +
              "KHÔNG tự hồi sinh. Muốn kết nối lại, người phụ trách lớp phải cấp và ghép " +
              "nối lại cặp mới — hãy cân nhắc kỹ trước khi xác nhận.",
            actions: [
              {
                label: "Giữ kết nối",
                variant: "ghost",
                onClick: () => dialog.close(),
              },
              {
                label: "Hủy kết nối",
                variant: "danger",
                onClick: () => {
                  dialog.close();
                  // A08: request thật đi qua cùng một guarded op — busy
                  // guard bao trùm cả thời gian request chạy.
                  guarded(`revoke-${connection.connection_id}`, revokeRef,
                    () => revokeNow(connection))();
                },
              },
            ],
          }));
        }),
      }, "Hủy kết nối cặp này…");
      revokeRef.current = revokeButton;
      footerSide.appendChild(revokeButton);
      cardFooter.appendChild(footerSide);
      card.appendChild(cardFooter);

      return card;
    }

    function renderConnections(connections, { hasMore = false, onLoadMore = null } = {}) {
      connectionsArea.replaceChildren();
      connectionsArea.appendChild(
        h("h2", { class: "fb-page__heading" }, "Kết nối đang hoạt động"),
      );
      // 73bf129: backend có thể nuốt exception của ConnectionListView thành
      // 200 rỗng — khi probe ready không "ok", danh sách rỗng KHÔNG tin cậy.
      if (lastData.connDegraded) {
        connectionsArea.appendChild(
          createErrorState({
            title: "Chưa xác định được trạng thái kết nối",
            description:
              "Máy chủ đang phản hồi không ổn định nên danh sách người đồng hành chưa thể " +
              "tin cậy — danh sách rỗng lúc này CÓ THỂ do lỗi máy chủ, không phải do bạn " +
              "chưa có cặp. Vui lòng thử lại khi hệ thống ổn định.",
            retryLabel: "Thử lại",
            onRetry: () => refresh({}),
          }),
        );
        return;
      }
      if (!connections.length) {
        // Prelinked: cặp do người phụ trách cấp sẵn — hướng Làm mới + liên hệ
        // người phụ trách lớp, KHÔNG đẩy luồng mã mời làm chính.
        connectionsArea.appendChild(
          createEmptyState({
            title: "Chưa thấy người đồng hành? Nhấn Làm mới hoặc liên hệ người phụ trách lớp",
            description:
              "Cặp đồng hành được người phụ trách lớp cấp và kích hoạt sẵn. Nếu bạn chưa " +
              "thấy ai, hãy bấm Làm mới để tải trạng thái mới nhất, hoặc liên hệ người " +
              "phụ trách lớp để được ghép nối.",
            action: { label: "Làm mới", onClick: () => refresh({}) },
          }),
        );
        return;
      }
      // A09: toàn bộ trang đã tải đều hiển thị (không slice); trang tiếp theo
      // qua nút “Xem thêm”.
      for (const connection of connections) {
        connectionsArea.appendChild(companionCard(connection));
      }
      if (hasMore && onLoadMore) {
        const moreRef = { current: null };
        const moreButton = createButton({
          label: "Xem thêm kết nối",
          variant: "ghost",
          onClick: guarded("connections-more", moreRef, onLoadMore),
        });
        moreRef.current = moreButton;
        connectionsArea.appendChild(moreButton);
      }
    }

    async function revokeNow(connection) {
      // A08: không gửi request từ trang đã chết.
      if (cancelled || !hasLiveSession()) return;
      notify("Đang hủy kết nối…");
      try {
        const result = await ctx.adapter.revokeConnection(connection.connection_id);
        if (cancelled) return;
        notify(result && result.note ? result.note : "Kết nối đã được hủy.");
        await refresh({ silent: true });
      } catch (error) {
        if (cancelled) return;
        if (error && error.status === 401 && !hasLiveSession()) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        // A10: mất response sau thao tác ghi — KHÔNG tự thử lại (tránh hủy
        // hai lần với kết quả không xác định) — báo trạng thái chưa xác định.
        notify(mutationOutcomeText(error, { what: "Hủy kết nối" }));
      }
    }

    // ------------------------------------------------------------------
    // Làm mới (thủ công, không polling)
    // ------------------------------------------------------------------
    let lastData = {
      connections: [],
      invites: [],
      connCursor: null,
      invCursor: null,
      connDegraded: false,
    };

    /**
     * Đồng bộ mã đang hiển thị với trạng thái backend theo invite_id:
     * - còn pending + chưa hết hạn -> giữ (không mất mã hợp lệ sau refresh);
     * - awaiting/canceled/expired/biến mất -> ngừng hiển thị mã như còn dùng.
     */
    function reconcileCreatedInvite() {
      if (!createdInvite) return;
      const row = lastData.invites.find(
        (invite) => invite && invite.invite_id === createdInvite.invite_id,
      );
      const stillUsable = Boolean(
        row && row.role === "inviter"
        && row.status === "pending"
        && isUnexpired(row.expires_at),
      );
      if (!stillUsable) createdInvite = null;
    }

    /**
     * A06: hòa giải trạng thái phía B với dữ liệu backend mới nhất — badge
     * “Chờ người tạo mã xác nhận” KHÔNG được sống sót khi lời mời đã
     * active/canceled/declined/expired hoặc biến mất khỏi danh sách.
     */
    function reconcileClaimState() {
      if (claimState.mode === "form" || !claimState.preview) return;
      const inviteId = claimState.preview.invite_id;
      const row = inviteId
        ? lastData.invites.find((invite) => invite && invite.invite_id === inviteId)
        : null;
      const stillOpen = Boolean(
        row && row.status === "awaiting_confirmation" && isUnexpired(row.expires_at),
      );
      if (!stillOpen) {
        // Kết nối đã active (lời mời rời danh sách), đã bị hủy/từ chối/hết
        // hạn — trạng thái thật nằm ở các mục khác trên trang.
        claimState.mode = "form";
        claimState.typedCode = "";
        claimState.preview = null;
      }
    }

    function paint() {
      renderConnections(lastData.connections, {
        hasMore: Boolean(lastData.connCursor),
        onLoadMore: loadMoreConnections,
      });
      renderInvites(lastData.invites, {
        hasMore: Boolean(lastData.invCursor),
        onLoadMore: loadMoreInvites,
      });
      reconcileCreatedInvite();
      reconcileClaimState();
      const openInvite = lastData.invites.find(
        (invite) => invite.role === "inviter"
          && (invite.status === "pending" || invite.status === "awaiting_confirmation"),
      );
      renderInviteSection(openInvite || null);
      // Ô nhập mã luôn được dựng lại TỪ claimState — lỗi mạng trước đó không
      // thể để trống vĩnh viễn, và mã đã gõ được giữ lại.
      renderClaimSection();
    }

    async function loadMoreConnections() {
      if (!lastData.connCursor || cancelled) return;
      const pageData = await ctx.adapter.listConnections({ cursor: lastData.connCursor });
      if (cancelled) return;
      lastData.connections = lastData.connections.concat(pageData.results || []);
      lastData.connCursor = pageData.nextCursor || null;
      paint();
    }

    async function loadMoreInvites() {
      if (!lastData.invCursor || cancelled) return;
      const pageData = await ctx.adapter.listInvites({ cursor: lastData.invCursor });
      if (cancelled) return;
      lastData.invites = lastData.invites.concat(pageData.results || []);
      lastData.invCursor = pageData.nextCursor || null;
      paint();
    }

    async function refresh({ silent = false } = {}) {
      const thisRun = ++runId;
      if (!silent) {
        connectionsArea.replaceChildren();
        connectionsArea.appendChild(createSkeleton({ variant: "card", count: 2 }));
        invitesArea.replaceChildren();
        notify("");
      }
      try {
        // A09: mỗi lần Làm mới nạp lại TRANG ĐẦU (bounded) — cursor của các
        // trang sau được nạp lại bằng nút “Xem thêm”.
        const [connectionsPage, invitesPage] = await Promise.all([
          ctx.adapter.listConnections({ limit: LIST_PAGE_SIZE }),
          ctx.adapter.listInvites({ limit: LIST_PAGE_SIZE }),
        ]);
        if (cancelled || thisRun !== runId) return;
        lastData = {
          connections: connectionsPage.results || [],
          invites: invitesPage.results || [],
          connCursor: connectionsPage.nextCursor || null,
          invCursor: invitesPage.nextCursor || null,
          connDegraded: false,
        };
        // 73bf129 — guard nuốt exception ở backend ConnectionListView trả về
        // 200 rỗng: danh sách rỗng phải được ĐỐI CHỨNG trước khi báo "chưa có
        // cặp". Probe /ready (nhẹ, chỉ chạy khi danh sách rỗng): nếu máy chủ
        // không "ok" → coi danh sách là KHÔNG TIN CẬY → error state + Thử
        // lại, tuyệt đối không trình bày như "bạn chưa có người đồng hành".
        if (!lastData.connections.length) {
          let ready = "unknown";
          try {
            ready = await ctx.adapter.getBackendReady();
          } catch {
            ready = "unreachable";
          }
          if (cancelled || thisRun !== runId) return;
          if (ready !== "ok") lastData.connDegraded = true;
        }
        paint();
      } catch (error) {
        if (cancelled || thisRun !== runId) return;
        // 401 của response lỗi thời (phiên đã được đổi mới) KHÔNG đá người
        // dùng ra đăng nhập — chỉ khi phiên hiện tại thật sự đã chết.
        if (error && error.status === 401 && !hasLiveSession()) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        connectionsArea.replaceChildren();
        connectionsArea.appendChild(
          createErrorState({
            title: "Không tải được dữ liệu kết nối",
            description: messageFor(error),
            retryLabel: "Thử lại",
            onRetry: () => refresh({}),
          }),
        );
        invitesArea.replaceChildren();
        inviteArea.replaceChildren();
        // claimArea KHÔNG bị xóa: dựng lại từ claimState (giữ mã đã gõ).
        renderClaimSection();
      }
    }

    // Khởi tạo
    renderNameCard();
    renderClaimSection();
    loadName();
    refresh({});

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
