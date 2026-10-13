// F01 — Kết nối người đồng hành: tạo mã mời, KIỂM TRA ĐÚNG NGƯỜI trước khi
// đồng ý, xác nhận hai phía, danh sách lời mời, hủy lời mời, hủy kết nối
// (có xác nhận), làm mới thủ công.
//
// Luồng: A tạo mã -> B nhập mã + KIỂM TRA (preview: ai tạo mã?) -> B đồng ý
// -> A đối chiếu tên người nhập mã rồi xác nhận -> backend kích hoạt.
//
// Review fixes ghi nhớ ở đây:
// - "XÁC NHẬN ĐÚNG NGƯỜI": hai bên xem tên TỰ KHAI BÁO của nhau (nhãn rõ:
//   không phải danh tính Zalo đã xác minh) trước khi chấp nhận/xác nhận/hủy
//   kết nối. Không xin số điện thoại/GPS, không ép quyền tên/avatar Zalo.
// - "PHỤC HỒI SAU LỖI MẠNG": refresh lỗi KHÔNG phá ô nhập mã; Thử lại thành
//   công khôi phục đúng trạng thái (giữ mã đã gõ), không tự replay thao tác ghi.
// - "MÃ MỜI HẾT HIỆU LỰC": mã vừa tạo luôn được đối chiếu với trạng thái
//   backend theo invite_id; mã canceled/expired/đã active không còn hiển thị
//   như còn dùng được; mã còn hợp lệ KHÔNG bị mất sau một refresh bình thường.
// KHÔNG polling tự động (chỉ nút Làm mới); không tự gửi lại thao tác ghi khi
// mất response — hiển thị "chưa xác định" và cho làm mới.
import { h } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton, createCard, createDialog, createEmptyState, createErrorState,
  createInput, createSkeleton, createStatusBadge, createTopBar,
} from "../../components/index.js";

let markRenderCancelled = () => {};

const RELATIONSHIP_LABELS = {
  primary: "Người đồng hành chính",
  backup: "Người hỗ trợ dự phòng",
};

const INVITE_STATUS_LABELS = {
  pending: "Chờ người kia nhập mã",
  awaiting_confirmation: "Chờ xác nhận",
  active: "Đã kết nối",
  declined: "Đã bị từ chối",
  canceled: "Đã hủy",
  expired: "Đã hết hạn",
};

const SELF_DECLARED_NOTE =
  "Tên tự khai báo — KHÔNG phải danh tính Zalo đã xác minh. " +
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
    return `${counterpart.display_name} (tên tự khai báo, chưa xác minh Zalo)`;
  }
  return "Người này chưa đặt tên gọi — hãy hỏi trực tiếp để chắc chắn đúng người";
}

/** Thông điệp tiếng Việt cho lỗi nghiệp vụ (theo envelope code/details). */
function messageFor(error) {
  if (!error) return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
  if (error.kind === "timeout") return "Kết nối quá thời gian chờ. Vui lòng thử lại.";
  if (error.kind === "network") return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  if (error.kind === "configuration") return error.message;
  const reason = error.details && error.details.reason ? error.details.reason : null;
  if (error.status === 401) return "Phiên đã hết hạn. Vui lòng đăng nhập lại.";
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
    case "rate_limited":
    case "too_many_claim_attempts":
      return "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ít phút.";
    case "invite_not_found":
      return "Không tìm thấy lời mời này.";
    case "connection_not_found":
      return "Không tìm thấy kết nối này.";
    default:
      return "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
  }
}

export const page = {
  id: "f01-connect",
  title: "Kết nối người đồng hành",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    let cancelled = false;
    let runId = 0;
    markRenderCancelled = () => {
      cancelled = true;
      runId += 1;
    };

    const root = h("div", { class: "fb-page", dataset: { page: "f01-connect" } });

    root.appendChild(
      createTopBar({
        title: "Kết nối người đồng hành",
        showBack: true,
        onBack: () => ctx.navigate(ctx.store.getState().role ? "/home" : "/profile"),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const state = ctx.store.getState();
    const demo = Boolean(state.demoMode);

    if (!demo && !hasLiveSession()) {
      ctx.navigate("/login?reason=expired");
      root.appendChild(h("div", { class: "fb-page__body" }));
      return root;
    }

    body.appendChild(
      h("p", { class: "fb-page__lead" },
        "Hai bên cùng xác nhận mới tạo được kết nối: một bên tạo mã mời, bên kia nhập mã và " +
        "KIỂM TRA đúng người trước khi đồng ý, người tạo mã đối chiếu lại rồi xác nhận cuối cùng. " +
        "Kết nối không cho phép đọc nhật ký hay nội dung riêng của nhau — mọi mục chia sẻ vẫn " +
        "do bạn quyết định.",
      ),
    );

    // ---- vùng trạng thái chung ----
    const noticeLine = h("p", { class: "fb-page__note", role: "status" });
    function notify(text) { noticeLine.textContent = text || ""; }

    // ---- tên gọi tự khai báo ----
    const nameArea = h("section", {});
    // ---- danh sách kết nối đang hoạt động ----
    const connectionsArea = h("section", {});
    // ---- tạo mã mời ----
    const inviteArea = h("section", {});
    // ---- nhập mã ----
    const claimArea = h("section", {});
    // ---- danh sách lời mời ----
    const invitesArea = h("section", {});

    body.appendChild(nameArea);
    body.appendChild(connectionsArea);
    body.appendChild(noticeLine);
    body.appendChild(inviteArea);
    body.appendChild(claimArea);
    body.appendChild(invitesArea);

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
    // Tên gọi tự khai báo (để hai bên đối chiếu đúng người)
    // ------------------------------------------------------------------
    const nameState = { value: "", loaded: false };

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
          title: "Để hai bên kiểm tra đúng người",
          description: SELF_DECLARED_NOTE +
            " Không xin số điện thoại, vị trí hay ép quyền tên/avatar Zalo.",
          children: [nameField, saveButton],
        }),
      );
    }

    async function loadName() {
      try {
        const profile = await ctx.adapter.getMyProfile();
        if (cancelled) return;
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
        notify(messageFor(error));
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
              notify(messageFor(error));
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
      const dialog = createDialog({
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
              confirmNow(invite);
            },
          },
        ],
      });
    }

    async function confirmNow(invite) {
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
        notify(messageFor(error));
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
              notify("Đã hủy lời mời.");
              await refresh({ silent: true });
            } catch (error) {
              if (cancelled) return;
              notify(messageFor(error));
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
              notify("Đã hủy lời mời.");
              await refresh({ silent: true });
            } catch (error) {
              if (cancelled) return;
              notify(messageFor(error));
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
              notify("Đã từ chối lời mời.");
              await refresh({ silent: true });
            } catch (error) {
              if (cancelled) return;
              notify(messageFor(error));
            }
          }),
        });
        declineRef.current = declineButton;
        actions.push(declineButton);
      }
      return actions;
    }

    function renderInvites(invites) {
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
      for (const invite of rows.slice(0, 20)) {
        const label = INVITE_STATUS_LABELS[invite.status] || invite.status;
        const tone = invite.status === "pending" ? "info"
          : invite.status === "awaiting_confirmation" ? "warning"
            : "neutral";
        const side = invite.role === "inviter" ? "Bạn tạo" : "Bạn nhận";
        const kind = RELATIONSHIP_LABELS[invite.relationship_kind] || invite.relationship_kind;
        const children = [
          createStatusBadge({ tone, label: `${side} · ${label}` }),
        ];
        if (invite.status === "awaiting_confirmation") {
          // Nhận biết đúng người: ai đã nhập mã / ai tạo mã.
          children.push(h("p", { class: "fb-page__note" },
            invite.role === "inviter"
              ? `Người nhập mã: ${counterpartLabel(invite.counterpart)}.`
              : `Người tạo mã: ${counterpartLabel(invite.counterpart)}.`));
        }
        children.push(h("p", { class: "fb-page__note" },
          (formatExpiry(invite.expires_at) ? `Hết hạn lúc ${formatExpiry(invite.expires_at)}.` : ""),
        ));
        for (const action of inviteActions(invite)) children.push(action);
        invitesArea.appendChild(
          createCard({
            title: `${side} lời mời — ${kind}`,
            description: null,
            children,
          }),
        );
      }
    }

    // ------------------------------------------------------------------
    // Kết nối đang hoạt động
    // ------------------------------------------------------------------
    function renderConnections(connections) {
      connectionsArea.replaceChildren();
      connectionsArea.appendChild(
        h("h2", { class: "fb-page__heading" }, "Kết nối đang hoạt động"),
      );
      if (!connections.length) {
        connectionsArea.appendChild(
          createEmptyState({
            title: "Chưa kết nối với ai",
            description:
              "Tạo mã mời để mời con/người thân kết nối, hoặc nhập mã mời bạn nhận được.",
            action: null,
          }),
        );
        return;
      }
      for (const connection of connections.slice(0, 20)) {
        const kind = RELATIONSHIP_LABELS[connection.relationship_kind]
          || connection.relationship_kind;
        const revokeRef = { current: null };
        const revokeButton = createButton({
          label: "Hủy kết nối",
          variant: "danger",
          onClick: guarded(`revoke-${connection.connection_id}`, revokeRef, async () => {
            const dialog = createDialog({
              title: "Hủy kết nối này?",
              message:
                `Bạn sắp hủy kết nối với: ${counterpartLabel(connection.counterpart)}. ` +
                "Sau khi hủy, các quyền chia sẻ dựa trên kết nối này mất hiệu lực và " +
                "không tự hồi sinh. Muốn kết nối lại, hai bên phải tạo và xác nhận một " +
                "lời mời mới.",
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
                    revokeNow(connection);
                  },
                },
              ],
            });
          }),
        });
        revokeRef.current = revokeButton;
        connectionsArea.appendChild(
          createCard({
            title: kind,
            description:
              `Người đồng hành: ${counterpartLabel(connection.counterpart)}. ` +
              `Trạng thái: ${connection.status === "active" ? "đang hoạt động" : connection.status} ` +
              `· thế hệ kết nối (generation): ${connection.generation}.`,
            children: revokeButton,
          }),
        );
      }
    }

    async function revokeNow(connection) {
      notify("Đang hủy kết nối…");
      try {
        const result = await ctx.adapter.revokeConnection(connection.connection_id);
        if (cancelled) return;
        notify(result && result.note ? result.note : "Đã hủy kết nối.");
        await refresh({ silent: true });
      } catch (error) {
        if (cancelled) return;
        if (error && error.status === 401 && !hasLiveSession()) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        // Mất response sau thao tác ghi: không tự thử lại (tránh hủy hai lần
        // với kết quả không xác định) — báo trạng thái chưa xác định.
        notify(error && error.kind === "timeout"
          ? "Hủy kết nối quá thời gian chờ — kết quả chưa xác định. Bấm Làm mới để kiểm tra trạng thái thật."
          : messageFor(error));
      }
    }

    // ------------------------------------------------------------------
    // Làm mới (thủ công, không polling)
    // ------------------------------------------------------------------
    const refreshButton = createButton({
      label: "Làm mới",
      variant: "ghost",
      onClick: () => refresh({}),
    });

    let lastData = { connections: [], invites: [] };

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

    function paint() {
      renderConnections(lastData.connections);
      renderInvites(lastData.invites);
      reconcileCreatedInvite();
      const openInvite = lastData.invites.find(
        (invite) => invite.role === "inviter"
          && (invite.status === "pending" || invite.status === "awaiting_confirmation"),
      );
      renderInviteSection(openInvite || null);
      // Ô nhập mã luôn được dựng lại TỪ claimState — lỗi mạng trước đó không
      // thể để trống vĩnh viễn, và mã đã gõ được giữ lại.
      renderClaimSection();
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
        const [connections, invites] = await Promise.all([
          ctx.adapter.listConnections(),
          ctx.adapter.listInvites(),
        ]);
        if (cancelled || thisRun !== runId) return;
        lastData = { connections, invites };
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
    body.insertBefore(
      h("div", { class: "fb-page__aside" }, refreshButton),
      connectionsArea,
    );
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
