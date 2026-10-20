// F11 — Điểm tựa dự phòng (US-022 & US-035).
// Tích hợp hoàn chỉnh vào Web SPA chính:
// - Quản lý vai trò điểm tựa (student: mời, xem danh sách active/pending, liên hệ, hủy; supporter: nhận lời, từ chối, dừng).
// - Payload contact chỉ { body } + header X-Idempotency-Key.
// - Disclaimer tĩnh, liên kết F13 luôn sẵn sàng.

import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createCard,
  createButton,
  createEmptyState,
  createErrorState,
  createSkeleton,
  createIcon,
  createStatusBadge,
  createDemoBanner,
} from "../../components/index.js";

const RELATION_LABELS = {
  family: "Người thân",
  teacher: "Thầy cô",
  counselor: "Cán bộ tham vấn",
};

function newIdemKey() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `f11-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let activeOverlays = [];
let pageCleanup = null;

export const page = {
  id: "supporters",
  title: "Điểm tựa dự phòng",
  requiresRole: false,
  requiresAuth: false,
  chrome: "app",
  showBottomNav: true,

  render(ctx) {
    let cancelled = false;

    pageCleanup = () => {
      cancelled = true;
      activeOverlays.forEach((el) => {
        if (el && typeof el.remove === "function") el.remove();
      });
      activeOverlays = [];
    };

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "supporters" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const state = (ctx.store && typeof ctx.store.getState === "function") ? ctx.store.getState() : {};
    const demo = Boolean(state.demoMode);

    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để sử dụng điểm tựa dự phòng",
          description: "Đăng nhập để kết nối và nhắn tin với điểm tựa tin cậy.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    if (demo) {
      body.appendChild(createDemoBanner({ onExit: () => ctx.exitDemo() }));
    }

    // Tiêu đề & giới thiệu
    body.appendChild(
      h("h2", { class: "fb-page__heading" }, "Điểm tựa dự phòng"),
    );

    body.appendChild(
      h(
        "p",
        { class: "fb-page__intro" },
        "Khi cần người lắng nghe ngoài gia đình hoặc thêm một chỗ dựa tin cậy, bạn có thể kết nối với thầy cô, cán bộ tham vấn hoặc người thân.",
      ),
    );

    // Banner an toàn & disclaimer
    const banner = h(
      "div",
      { class: "fb-signal-safety", style: "margin-bottom: var(--fb-space-4);" },
      h(
        "div",
        { class: "fb-signal-safety__row" },
        createIcon({ name: "info", size: 18 }),
        h(
          "p",
          {},
          h("strong", {}, "Lưu ý: "),
          "Điểm tựa là người đã đồng ý tiếp nhận tâm sự, không cam kết trực 24/7. Nếu cần hỗ trợ khẩn cấp, hãy mở ",
          h("a", { href: "#/help" }, "Trang tìm trợ giúp (F13)"),
          " ngay.",
        ),
      ),
    );
    body.appendChild(banner);

    const mainContainer = h("div", { id: "supporters-main" });
    body.appendChild(mainContainer);

    function refresh() {
      clear(mainContainer);
      mainContainer.appendChild(createSkeleton({ variant: "card", count: 2 }));
      mainContainer.appendChild(h("p", { class: "fb-status" }, "Đang tải dữ liệu điểm tựa…"));

      Promise.all([
        Promise.resolve().then(() => ctx.adapter.listSupporterCommitments()).catch((e) => {
          if (e && e.status === 401) throw e;
          return [];
        }),
        Promise.resolve().then(() => ctx.adapter.listSupporterRoles()).catch((e) => {
          if (e && e.status === 401) throw e;
          return [];
        }),
        Promise.resolve()
          .then(() => ctx.adapter.listConnections({ limit: 20 }))
          .then((data) => (data && Array.isArray(data.results)) ? data.results : [])
          .catch((e) => {
            if (e && e.status === 401) throw e;
            return [];
          }),
      ])
        .then(([commitments, roles, connections]) => {
          if (cancelled) return;
          clear(mainContainer);

          const commitmentList = Array.isArray(commitments) ? commitments : [];
          const roleList = Array.isArray(roles) ? roles : [];
          const connectionList = Array.isArray(connections) ? connections : [];

          // 1. Nếu có cam kết hoặc người dùng là caregiver: hiển thị mục cam kết
          if (commitmentList.length > 0 || state.role === "caregiver") {
            renderSupporterCommitmentsSection(mainContainer, ctx, commitmentList, refresh);
          }

          // 2. Hiển thị mục điểm tựa của bản thân cho học sinh hoặc khi có vai trò điểm tựa
          if (state.role !== "caregiver" || roleList.length > 0 || commitmentList.length === 0) {
            renderStudentRolesSection(mainContainer, ctx, roleList, connectionList, refresh);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (err && err.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          clear(mainContainer);
          mainContainer.appendChild(
            createErrorState({
              title: "Không thể tải dữ liệu điểm tựa",
              description: "Vui lòng kiểm tra kết nối mạng rồi thử lại.",
              retryLabel: "Thử lại",
              onRetry: refresh,
            }),
          );
        });
    }

    refresh();
    return root;
  },

  destroy() {
    if (typeof pageCleanup === "function") pageCleanup();
    pageCleanup = null;
  },
};

/* ------------------- Section 1: Supporter Roles (My Supporters) ------------------- */
function renderStudentRolesSection(container, ctx, roles, connections, refresh) {
  const activeRoles = roles.filter((r) => r.status === "active" && r.can_contact);
  const pendingRoles = roles.filter((r) => r.status === "pending");

  // 1. Danh sách điểm tựa đang đồng hành
  const activeCard = createCard({
    title: "Điểm tựa đang đồng hành",
    description: "Những người đã đồng ý sẵn sàng lắng nghe khi bạn cần.",
    children: h("div", {},
      activeRoles.length === 0
        ? h("p", { class: "fb-page__note", style: "padding: var(--fb-space-3) 0;" },
            "Bạn chưa có điểm tựa nào đang hoạt động. Hãy mời người thân hoặc thầy cô bên dưới."
          )
        : h("div", { class: "fb-list" },
            ...activeRoles.map((role) => createActiveRoleItem(role, ctx, refresh))
          )
    ),
  });
  container.appendChild(activeCard);

  // 2. Form mời điểm tựa mới
  const inviteSection = createCard({
    title: "Mời thêm điểm tựa",
    description: "Chọn người đã kết nối với bạn để gửi lời mời làm điểm tựa hỗ trợ.",
    children: createInviteForm(ctx, connections, refresh),
  });
  container.appendChild(inviteSection);

  // 3. Danh sách đang chờ phản hồi
  if (pendingRoles.length > 0) {
    const pendingCard = createCard({
      title: "Lời mời đang chờ phản hồi",
      description: "Người được mời cần đăng nhập và xác nhận đồng ý làm điểm tựa.",
      children: h("div", { class: "fb-list" },
        ...pendingRoles.map((role) => createPendingRoleItem(role, ctx, refresh))
      ),
    });
    container.appendChild(pendingCard);
  }
}

function createActiveRoleItem(role, ctx, refresh) {
  const roleId = role.role_id || role.id;
  const name = role.supporter_name || "Người hỗ trợ";
  const relation = RELATION_LABELS[role.relationship_kind] || role.relationship_kind;

  const item = h("div", {
    class: "fb-list__item",
    style: "display: flex; justify-content: space-between; align-items: center; padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  const info = h("div", {},
    h("h4", { style: "margin: 0; font-size: var(--fb-font-size-md);" }, name),
    h("p", { class: "fb-page__note", style: "margin: var(--fb-space-1) 0 0;" }, `Vai trò: ${relation}`),
  );

  const actions = h("div", { style: "display: flex; gap: var(--fb-space-2);" },
    createButton({
      label: "Nhắn tin",
      variant: "primary",
      onClick: () => openContactModal(role, ctx, refresh),
    }),
    createButton({
      label: "Dừng",
      variant: "ghost",
      onClick: async () => {
        if (!confirm(`Bạn có chắc muốn dừng vai trò điểm tựa với ${name}?`)) return;
        try {
          await ctx.adapter.revokeSupporterRole({ roleId });
          refresh();
        } catch (e) {
          if (e && e.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          alert("Không thể dừng vai trò điểm tựa: " + (e.message || "Lỗi máy chủ"));
        }
      },
    }),
  );

  item.appendChild(info);
  item.appendChild(actions);
  return item;
}

function createPendingRoleItem(role, ctx, refresh) {
  const roleId = role.role_id || role.id;
  const name = role.supporter_name || "Người hỗ trợ";
  const relation = RELATION_LABELS[role.relationship_kind] || role.relationship_kind;

  const item = h("div", {
    class: "fb-list__item",
    style: "display: flex; justify-content: space-between; align-items: center; padding: var(--fb-space-2) 0;",
  });

  const info = h("div", {},
    h("p", { style: "margin: 0; font-weight: 500;" }, name),
    h("p", { class: "fb-page__note", style: "margin: 0;" }, `Quan hệ: ${relation} • Đang chờ phản hồi`),
  );

  const cancelBtn = createButton({
    label: "Thu hồi",
    variant: "ghost",
    onClick: async () => {
      try {
        await ctx.adapter.revokeSupporterRole({ roleId });
        refresh();
      } catch (e) {
        if (e && e.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        alert("Không thể thu hồi lời mời: " + (e.message || "Lỗi máy chủ"));
      }
    },
  });

  item.appendChild(info);
  item.appendChild(cancelBtn);
  return item;
}

function createInviteForm(ctx, connections, refresh) {
  const form = h("form", {
    style: "display: flex; flex-direction: column; gap: var(--fb-space-3); margin-top: var(--fb-space-2);",
  });

  const feedbackContainer = h("div", {});
  form.appendChild(feedbackContainer);

  if (connections.length === 0) {
    const emptyNotice = h("div", {
      style: "background: var(--fb-color-bg-secondary, #f8f9fa); padding: var(--fb-space-3); border-radius: var(--fb-radius-md);",
    },
      h("p", { class: "fb-page__note", style: "margin: 0 0 var(--fb-space-3); color: var(--fb-color-text-primary);" },
        "Bạn cần có ít nhất một kết nối gia đình/người thân đã xác nhận để chọn làm điểm tựa dự phòng."
      ),
      h("div", { style: "display: flex; gap: var(--fb-space-2); flex-wrap: wrap;" },
        createButton({
          label: "Xem đề xuất kết nối lớp học",
          variant: "primary",
          onClick: () => ctx.navigate("/proposal"),
        }),
        createButton({
          label: "Tạo/Nhập mã kết nối",
          variant: "ghost",
          onClick: () => ctx.navigate("/connect"),
        }),
      ),
    );
    form.appendChild(emptyNotice);
    return form;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    clear(feedbackContainer);
    const selectPerson = form.querySelector("#invite-person");
    const selectKind = form.querySelector("#invite-kind");
    const supporterId = selectPerson ? selectPerson.value : "";
    const relationshipKind = selectKind ? selectKind.value : "family";

    if (!supporterId) {
      feedbackContainer.appendChild(
        h("div", { class: "fb-status fb-status--warning", style: "margin-bottom: var(--fb-space-2);" },
          h("span", {}, "Vui lòng chọn người cần mời làm điểm tựa."),
        ),
      );
      return;
    }

    try {
      await ctx.adapter.inviteSupporter({ supporterId, relationshipKind });
      feedbackContainer.appendChild(
        h("div", { class: "fb-status fb-status--success", style: "margin-bottom: var(--fb-space-2);" },
          h("span", {}, "Lời mời đã được chuyển đi."),
        ),
      );
      refresh();
    } catch (err) {
      if (err && err.status === 401) {
        ctx.navigate("/login?reason=expired");
        return;
      }
      feedbackContainer.appendChild(
        h("div", { class: "fb-status fb-status--error", style: "margin-bottom: var(--fb-space-2);" },
          h("span", {}, "Không thể gửi lời đề nghị: " + (err.message || "Lỗi máy chủ")),
        ),
      );
    }
  };

  // Dropdown người đã kết nối
  const personGroup = h("div", {},
    h("label", { for: "invite-person", style: "display: block; font-weight: 600; margin-bottom: var(--fb-space-1);" }, "Chọn người đã kết nối:"),
  );

  const selectPerson = h("select", {
    id: "invite-person",
    class: "fb-select",
    style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border);",
  });

  for (const conn of connections) {
    const counterpartName = (conn.counterpart && conn.counterpart.display_name) || "Người đồng hành";
    const otherId = conn.other_party_id;
    selectPerson.appendChild(h("option", { value: otherId }, counterpartName));
  }
  personGroup.appendChild(selectPerson);
  form.appendChild(personGroup);

  // Chọn loại quan hệ
  const kindGroup = h("div", {},
    h("label", { for: "invite-kind", style: "display: block; font-weight: 600; margin-bottom: var(--fb-space-1);" }, "Quan hệ hỗ trợ:"),
    h("select", {
      id: "invite-kind",
      class: "fb-select",
      style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border);",
    },
      h("option", { value: "family" }, "Người thân"),
      h("option", { value: "teacher" }, "Thầy cô"),
      h("option", { value: "counselor" }, "Cán bộ tham vấn"),
    ),
  );
  form.appendChild(kindGroup);

  const submitBtn = createButton({
    label: "Gửi lời đề nghị làm điểm tựa",
    variant: "primary",
    type: "submit",
  });
  form.appendChild(submitBtn);

  return form;
}

/* ------------------- Contact Modal ------------------- */
function openContactModal(role, ctx, refresh) {
  const roleId = role.role_id || role.id;
  const overlay = h("div", {
    class: "fb-overlay",
    style: "position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: var(--fb-space-4);",
  });
  activeOverlays.push(overlay);

  const modal = h("div", {
    class: "fb-card",
    style: "max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; background: white; padding: var(--fb-space-4); border-radius: var(--fb-radius-lg);",
  });
  overlay.appendChild(modal);

  const supporterName = role.supporter_name || "Điểm tựa";
  modal.appendChild(h("h3", { style: "margin-top: 0;" }, `Nhắn tin cho ${supporterName}`));
  modal.appendChild(
    h("p", { class: "fb-page__note" },
      "Lời nhắn của bạn sẽ được gửi trực tiếp tới điểm tựa. Không đính kèm thư cũ hay nhật ký riêng tư.",
    ),
  );

  const statusContainer = h("div", {});
  modal.appendChild(statusContainer);

  const textarea = h("textarea", {
    class: "fb-textarea",
    rows: 4,
    maxlength: 4000,
    placeholder: "Nhập nội dung bạn muốn chia sẻ hoặc nhờ hỗ trợ…",
    style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border); margin: var(--fb-space-2) 0;",
  });
  modal.appendChild(textarea);

  const disclaimer = h("p", {
    class: "fb-page__note",
    style: "font-size: var(--fb-font-size-xs); color: var(--fb-color-text-secondary);",
  }, "Điểm tựa sẽ phản hồi khi sắp xếp được thời gian. Bạn có thể mở mục Tìm trợ giúp bất cứ lúc nào.");
  modal.appendChild(disclaimer);

  const btnContainer = h("div", { style: "display: flex; gap: var(--fb-space-2); justify-content: flex-end; margin-top: var(--fb-space-3);" });

  const cancelBtn = createButton({
    label: "Đóng",
    variant: "ghost",
    onClick: () => {
      overlay.remove();
      activeOverlays = activeOverlays.filter((o) => o !== overlay);
    },
  });

  let sending = false;
  const sendBtn = createButton({
    label: "Gửi tin nhắn",
    variant: "primary",
    onClick: async () => {
      clear(statusContainer);
      const bodyText = textarea.value.trim();
      if (!bodyText) {
        statusContainer.appendChild(
          h("div", { class: "fb-status fb-status--warning", style: "margin-bottom: var(--fb-space-2);" },
            h("span", {}, "Vui lòng nhập nội dung lời nhắn."),
          ),
        );
        return;
      }
      if (sending) return;
      sending = true;
      sendBtn.disabled = true;

      try {
        const key = newIdemKey();
        await ctx.adapter.contactSupporter({ roleId, body: bodyText, key });
        statusContainer.appendChild(
          h("div", { class: "fb-status fb-status--success", style: "margin-bottom: var(--fb-space-2);" },
            h("span", {}, "Tin nhắn đã được chuyển tới người hỗ trợ qua hộp thư riêng tư."),
          ),
        );
        textarea.value = "";
        setTimeout(() => {
          overlay.remove();
          activeOverlays = activeOverlays.filter((o) => o !== overlay);
          refresh();
        }, 1200);
      } catch (err) {
        sending = false;
        sendBtn.disabled = false;
        if (err && err.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        statusContainer.appendChild(
          h("div", { class: "fb-status fb-status--error", style: "margin-bottom: var(--fb-space-2);" },
            h("span", {}, "Không thể gửi tin nhắn: " + (err.message || "Lỗi kết nối máy chủ")),
          ),
        );
      }
    },
  });

  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(sendBtn);
  modal.appendChild(btnContainer);

  document.body.appendChild(overlay);
  textarea.focus();
}

/* ------------------- Section 2: Supporter Commitments ------------------- */
function renderSupporterCommitmentsSection(container, ctx, commitments, refresh) {
  const pendingCommitments = commitments.filter((c) => c.status === "pending");
  const activeCommitments = commitments.filter((c) => c.status === "active");

  // 1. Các đề nghị đang chờ bạn xác nhận
  const pendingCard = createCard({
    title: "Đề nghị làm điểm tựa mới",
    description: "Học sinh đã mời bạn làm điểm tựa hỗ trợ. Hãy xác nhận cam kết.",
    children: h("div", {},
      pendingCommitments.length === 0
        ? h("p", { class: "fb-page__note", style: "padding: var(--fb-space-3) 0;" }, "Không có đề nghị nào đang chờ bạn xác nhận.")
        : h("div", { class: "fb-list" },
            ...pendingCommitments.map((item) => createPendingCommitmentItem(item, ctx, refresh))
          )
    ),
  });
  container.appendChild(pendingCard);

  // 2. Các bạn học sinh bạn đang đồng hành
  const activeCard = createCard({
    title: "Đang làm điểm tựa hỗ trợ",
    description: "Những học sinh mà bạn đã đồng ý làm điểm tựa.",
    children: h("div", {},
      activeCommitments.length === 0
        ? h("p", { class: "fb-page__note", style: "padding: var(--fb-space-3) 0;" }, "Bạn chưa có cam kết hỗ trợ nào đang hoạt động.")
        : h("div", { class: "fb-list" },
            ...activeCommitments.map((item) => createActiveCommitmentItem(item, ctx, refresh))
          )
    ),
  });
  container.appendChild(activeCard);
}

function createPendingCommitmentItem(item, ctx, refresh) {
  const roleId = item.role_id || item.id;
  const studentName = item.student_name || "Học sinh";
  const relation = RELATION_LABELS[item.relationship_kind] || item.relationship_kind;

  const el = h("div", {
    class: "fb-list__item",
    style: "display: flex; justify-content: space-between; align-items: center; padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  const info = h("div", {},
    h("h4", { style: "margin: 0;" }, `Học sinh: ${studentName}`),
    h("p", { class: "fb-page__note", style: "margin: var(--fb-space-1) 0 0;" }, `Đề nghị vai trò: ${relation}`),
  );

  const actions = h("div", { style: "display: flex; gap: var(--fb-space-2);" },
    createButton({
      label: "Đồng ý hỗ trợ",
      variant: "primary",
      onClick: async () => {
        try {
          await ctx.adapter.respondSupporterRole({ roleId, decision: "accept" });
          refresh();
        } catch (e) {
          if (e && e.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          alert("Lỗi: " + (e.message || "Không thể đồng ý"));
        }
      },
    }),
    createButton({
      label: "Từ chối",
      variant: "ghost",
      onClick: async () => {
        try {
          await ctx.adapter.respondSupporterRole({ roleId, decision: "decline" });
          refresh();
        } catch (e) {
          if (e && e.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          alert("Lỗi: " + (e.message || "Không thể từ chối"));
        }
      },
    }),
  );

  el.appendChild(info);
  el.appendChild(actions);
  return el;
}

function createActiveCommitmentItem(item, ctx, refresh) {
  const roleId = item.role_id || item.id;
  const studentName = item.student_name || "Học sinh";
  const relation = RELATION_LABELS[item.relationship_kind] || item.relationship_kind;

  const el = h("div", {
    class: "fb-list__item",
    style: "display: flex; justify-content: space-between; align-items: center; padding: var(--fb-space-3) 0; border-bottom: 1px solid var(--fb-color-border);",
  });

  const info = h("div", {},
    h("h4", { style: "margin: 0;" }, `Học sinh: ${studentName}`),
    h("p", { class: "fb-page__note", style: "margin: var(--fb-space-1) 0 0;" }, `Vai trò: ${relation} • Đang hiệu lực`),
  );

  const stopBtn = createButton({
    label: "Dừng hỗ trợ",
    variant: "ghost",
    onClick: async () => {
      if (!confirm(`Bạn có chắc muốn dừng vai trò điểm tựa với học sinh ${studentName}?`)) return;
      try {
        await ctx.adapter.revokeSupporterRole({ roleId });
        refresh();
      } catch (e) {
        if (e && e.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        alert("Lỗi: " + (e.message || "Không thể dừng hỗ trợ"));
      }
    },
  });

  el.appendChild(info);
  el.appendChild(stopBtn);
  return el;
}

