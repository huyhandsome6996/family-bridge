// F01 — Kết nối người đồng hành: tạo mã mời, nhập mã, xác nhận hai phía,
// danh sách lời mời, hủy lời mời, hủy kết nối (có xác nhận), làm mới thủ công.
// Luồng: A tạo mã -> B nhập mã + đồng ý -> A xác nhận -> backend kích hoạt.
// KHÔNG polling tự động (chỉ nút Làm mới); KHÔNG tự gửi lại thao tác ghi khi
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

function formatExpiry(iso) {
  const ms = Date.parse(iso || "");
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
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
      return "Không thể tự kết nối với chính mình.";
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
    const pendingOps = new Set();
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
        "Hai bên cùng xác nhận mới tạo được kết nối: một bên tạo mã mời, bên kia nhập mã, " +
        "người tạo mã xác nhận cuối cùng. Kết nối không cho phép đọc nhật ký hay nội dung " +
        "riêng của nhau — mọi mục chia sẻ vẫn do bạn quyết định.",
      ),
    );

    // ---- vùng trạng thái chung ----
    const noticeLine = h("p", { class: "fb-page__note", role: "status" });
    function notify(text) { noticeLine.textContent = text || ""; }

    // ---- danh sách kết nối đang hoạt động ----
    const connectionsArea = h("section", {});
    // ---- tạo mã mời ----
    const inviteArea = h("section", {});
    // ---- nhập mã ----
    const claimArea = h("section", {});
    // ---- danh sách lời mời ----
    const invitesArea = h("section", {});

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
    // Tạo mã mời
    // ------------------------------------------------------------------
    let createdInvite = null; // mã vừa tạo — hiển thị cho tới khi rời trang

    function showCreatedInvite(created) {
      createdInvite = created || null;
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

    function renderInviteSection(openInvite) {
      inviteArea.replaceChildren();
      if (createdInvite) {
        // Mã vừa tạo luôn được ưu tiên hiển thị (không bị vẽ đè khi refresh).
        showCreatedInvite(createdInvite);
        return;
      }
      const createRef = { current: null };
      const onCreate = guarded("create", createRef, async () => {
        await createInvite();
      });
      if (openInvite) {
        // Đang có lời mời mở của chính mình: không tạo thêm (backend cũng tự
        // hủy mã mở cũ khi tạo mã mới) — cho tạo mã mới thay thế.
        const replaceButton = createButton({
          label: "Tạo mã mới thay thế",
          variant: "ghost",
          onClick: onCreate,
        });
        createRef.current = replaceButton;
        inviteArea.appendChild(
          createCard({
            title: "Mã mời đang mở",
            description:
              "Bạn đã có một lời mời đang chờ (hết hạn lúc " +
              (formatExpiry(openInvite.expires_at) || "không rõ") +
              "). Tạo mã mới sẽ tự hủy mã này.",
            children: replaceButton,
          }),
        );
        return;
      }
      const createButtonEl = createButton({
        label: "Tạo mã mời",
        variant: "primary",
        size: "lg",
        onClick: onCreate,
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
        showCreatedInvite(created);
        await refresh({ silent: true });
      } catch (error) {
        if (cancelled) return;
        notify(messageFor(error));
      }
    }

    // ------------------------------------------------------------------
    // Nhập mã mời (phía bên kia)
    // ------------------------------------------------------------------
    function renderClaimSection() {
      claimArea.replaceChildren();
      const codeField = createInput({
        id: "fb-invite-code",
        label: "Nhập mã mời nhận được",
        hint: "Mã gồm 12 ký tự, không có chữ I, O và số 1, 0.",
        maxlength: 12,
        placeholder: "Ví dụ: AB2CD3EF4GH5",
        onInput: () => {
          codeField.input.value = codeField.input.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
          claimButton.disabled = codeField.input.value.length !== 12;
        },
      });
      const claimRef = { current: null };
      const claimButton = createButton({
        label: "Nhập mã mời",
        variant: "primary",
        disabled: true,
        onClick: guarded("claim", claimRef, async () => {
          const code = codeField.input.value.trim().toUpperCase();
          if (code.length !== 12) {
            codeField.setError("Mã phải đủ 12 ký tự.");
            return;
          }
          codeField.setError(null);
          notify("Đang kiểm tra mã…");
          try {
            const result = await ctx.adapter.claimInvite(code);
            if (cancelled) return;
            notify("");
            claimArea.replaceChildren();
            claimArea.appendChild(
              createCard({
                title: "Nhập mã thành công",
                description:
                  "Bạn đã đồng ý kết nối. Bây giờ chờ người tạo mã xác nhận phía còn lại — " +
                  "khi họ xác nhận, kết nối mới được kích hoạt cho cả hai.",
                children: createStatusBadge({
                  tone: "warning",
                  label: "Chờ người tạo mã xác nhận",
                }),
              }),
            );
            await refresh({ silent: true });
          } catch (error) {
            if (cancelled) return;
            codeField.setError(messageFor(error));
            notify("");
          }
        }),
      });
      claimRef.current = claimButton;
      claimArea.appendChild(
        createCard({
          title: "Đã nhận được mã mời?",
          description: "Nhập mã mời gồm 12 ký tự mà bên kia chuyển cho bạn.",
          children: [codeField, claimButton],
        }),
      );
    }

    // ------------------------------------------------------------------
    // Danh sách lời mời + hành động
    // ------------------------------------------------------------------
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
          h("p", { class: "fb-page__note" },
            (formatExpiry(invite.expires_at) ? `Hết hạn lúc ${formatExpiry(invite.expires_at)}.` : ""),
          ),
        ];
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
            description: `Trạng thái: ${connection.status === "active" ? "đang hoạt động" : connection.status} · thế hệ kết nối (generation): ${connection.generation}.`,
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
        if (error && error.status === 401) {
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

    function paint() {
      renderConnections(lastData.connections);
      renderInvites(lastData.invites);
      // Mã mời đang mở (pending/awaiting) của chính mình -> section tạo mã hiển thị khác
      const openInvite = lastData.invites.find(
        (invite) => invite.role === "inviter"
          && (invite.status === "pending" || invite.status === "awaiting_confirmation"),
      );
      renderInviteSection(openInvite || null);
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
        if (error && error.status === 401) {
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
        claimArea.replaceChildren();
        inviteArea.replaceChildren();
      }
    }

    // Khởi tạo
    body.insertBefore(
      h("div", { class: "fb-page__aside" }, refreshButton),
      connectionsArea,
    );
    renderClaimSection();
    refresh({});

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
