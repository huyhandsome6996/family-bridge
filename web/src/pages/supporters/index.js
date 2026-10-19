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

export const page = {
  id: "supporters",
  title: "Điểm tựa dự phòng",
  requiresRole: true,
  requiresAuth: true,
  chrome: "app",
  showBottomNav: true,

  render(ctx) {
    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "supporters" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const state = (ctx.store && typeof ctx.store.getState === "function") ? ctx.store.getState() : {};
    const isCaregiver = state.role === "caregiver";

    // Tiêu đề & giới thiệu
    body.appendChild(
      h("h2", { class: "fb-page__heading" }, isCaregiver ? "Cam kết điểm tựa hỗ trợ" : "Điểm tựa dự phòng của con"),
    );

    body.appendChild(
      h(
        "p",
        { class: "fb-page__intro" },
        isCaregiver
          ? "Nơi tiếp nhận và quản lý các đề nghị làm điểm tựa lắng nghe từ học sinh."
          : "Khi cần người lắng nghe ngoài gia đình hoặc thêm một chỗ dựa tin cậy, con có thể kết nối với thầy cô, cán bộ tham vấn hoặc người thân.",
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

    let cancelled = false;

    function refresh() {
      clear(mainContainer);
      mainContainer.appendChild(createSkeleton({ variant: "card", count: 2 }));
      mainContainer.appendChild(h("p", { class: "fb-status" }, "Đang tải dữ liệu điểm tựa…"));

      if (isCaregiver) {
        // Phía người hỗ trợ / phụ huynh
        Promise.resolve()
          .then(() => ctx.adapter.listSupporterCommitments())
          .then((commitments) => {
            if (cancelled) return;
            clear(mainContainer);
            renderSupporterView(mainContainer, ctx, commitments || [], refresh);
          })
          .catch((err) => {
            if (cancelled) return;
            clear(mainContainer);
            mainContainer.appendChild(
              createErrorState({
                title: "Không thể tải danh sách cam kết",
                description: "Vui lòng kiểm tra kết nối mạng rồi thử lại.",
                retryLabel: "Thử lại",
                onRetry: refresh,
              }),
            );
          });
      } else {
        // Phía học sinh
        Promise.all([
          Promise.resolve().then(() => ctx.adapter.listSupporterRoles()),
          Promise.resolve()
            .then(() => ctx.adapter.listConnections({ limit: 20 }))
            .then((data) => (data && Array.isArray(data.results)) ? data.results : [])
            .catch(() => []),
        ])
          .then(([roles, connections]) => {
            if (cancelled) return;
            clear(mainContainer);
            renderStudentView(mainContainer, ctx, roles || [], connections || [], refresh);
          })
          .catch((err) => {
            if (cancelled) return;
            clear(mainContainer);
            mainContainer.appendChild(
              createErrorState({
                title: "Không thể tải danh sách điểm tựa",
                description: "Vui lòng kiểm tra kết nối mạng rồi thử lại.",
                retryLabel: "Thử lại",
                onRetry: refresh,
              }),
            );
          });
      }
    }

    refresh();
    return root;
  },
};

/* ------------------- Student View ------------------- */
function renderStudentView(container, ctx, roles, connections, refresh) {
  const activeRoles = roles.filter((r) => r.status === "active" && r.can_contact);
  const pendingRoles = roles.filter((r) => r.status === "pending");

  // 1. Danh sách điểm tựa đang đồng hành
  const activeCard = createCard({
    title: "Điểm tựa đang đồng hành",
    description: "Những người đã đồng ý sẵn sàng lắng nghe khi con cần.",
    children: h("div", {},
      activeRoles.length === 0
        ? h("p", { class: "fb-page__note", style: "padding: var(--fb-space-3) 0;" },
            "Con chưa có điểm tựa nào đang hoạt động. Hãy mời người thân hoặc thầy cô bên dưới."
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
    description: "Chọn người đã kết nối với con để gửi lời mời làm điểm tựa hỗ trợ.",
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
      variant: "secondary",
      onClick: async () => {
        if (!confirm(`Bạn có chắc muốn dừng vai trò điểm tựa với ${name}?`)) return;
        try {
          await ctx.adapter.revokeSupporterRole({ roleId: role.role_id });
          refresh();
        } catch (e) {
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
    variant: "secondary",
    onClick: async () => {
      try {
        await ctx.adapter.revokeSupporterRole({ roleId: role.role_id });
        refresh();
      } catch (e) {
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

  form.onsubmit = async (e) => {
    e.preventDefault();
    const selectPerson = form.querySelector("#invite-person");
    const selectKind = form.querySelector("#invite-kind");
    const supporterId = selectPerson ? selectPerson.value : "";
    const relationshipKind = selectKind ? selectKind.value : "family";

    if (!supporterId) {
      alert("Vui lòng chọn người cần mời làm điểm tựa.");
      return;
    }

    try {
      await ctx.adapter.inviteSupporter({ supporterId, relationshipKind });
      alert("Lời đề nghị làm điểm tựa đã được chuyển đi thành công.");
      refresh();
    } catch (err) {
      alert("Không thể gửi lời đề nghị: " + (err.message || "Lỗi máy chủ"));
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

  if (connections.length === 0) {
    selectPerson.appendChild(h("option", { value: "" }, "Chưa có kết nối nào. Hãy tạo kết nối gia đình trước."));
  } else {
    for (const conn of connections) {
      const counterpartName = (conn.counterpart && conn.counterpart.display_name) || "Người đồng hành";
      const otherId = conn.other_party_id;
      selectPerson.appendChild(h("option", { value: otherId }, counterpartName));
    }
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
  const overlay = h("div", {
    class: "fb-overlay",
    style: "position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: var(--fb-space-4);",
  });

  const modal = h("div", {
    class: "fb-card",
    style: "max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto; background: white; padding: var(--fb-space-4); border-radius: var(--fb-radius-lg);",
  });
  overlay.appendChild(modal);

  const supporterName = role.supporter_name || "Điểm tựa";
  modal.appendChild(h("h3", { style: "margin-top: 0;" }, `Nhắn tin cho ${supporterName}`));
  modal.appendChild(
    h("p", { class: "fb-page__note" },
      "Lời nhắn MỚI của con sẽ được gửi trực tiếp tới điểm tựa. Không đính kèm thư cũ hay nhật ký.",
    ),
  );

  const textarea = h("textarea", {
    class: "fb-textarea",
    rows: 4,
    maxlength: 4000,
    placeholder: "Nhập nội dung con muốn chia sẻ hoặc nhờ hỗ trợ…",
    style: "width: 100%; padding: var(--fb-space-2); border-radius: var(--fb-radius-md); border: 1px solid var(--fb-color-border); margin: var(--fb-space-2) 0;",
  });
  modal.appendChild(textarea);

  const disclaimer = h("p", {
    class: "fb-page__note",
    style: "font-size: var(--fb-font-size-xs); color: var(--fb-color-text-secondary);",
  }, "Điểm tựa sẽ phản hồi khi sắp xếp được thời gian. Con có thể mở mục Tìm trợ giúp bất cứ lúc nào.");
  modal.appendChild(disclaimer);

  const btnContainer = h("div", { style: "display: flex; gap: var(--fb-space-2); justify-content: flex-end; margin-top: var(--fb-space-3);" });

  const cancelBtn = createButton({
    label: "Hủy",
    variant: "secondary",
    onClick: () => overlay.remove(),
  });

  let sending = false;
  const sendBtn = createButton({
    label: "Gửi tin nhắn",
    variant: "primary",
    onClick: async () => {
      const body = textarea.value.trim();
      if (!body) {
        alert("Vui lòng nhập nội dung lời nhắn.");
        return;
      }
      if (sending) return;
      sending = true;
      sendBtn.disabled = true;

      try {
        const key = newIdemKey();
        await ctx.adapter.contactSupporter({ roleId: role.role_id, body, key });
        overlay.remove();
        alert(`Tin nhắn đã được chuyển tới ${supporterName}. Nếu cần giúp khẩn cấp, con hãy mở trang Trợ giúp.`);
        refresh();
      } catch (err) {
        sending = false;
        sendBtn.disabled = false;
        alert("Không thể gửi tin nhắn: " + (err.message || "Lỗi kết nối máy chủ"));
      }
    },
  });

  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(sendBtn);
  modal.appendChild(btnContainer);

  document.body.appendChild(overlay);
  textarea.focus();
}

/* ------------------- Supporter View (Caregiver / Teacher) ------------------- */
function renderSupporterView(container, ctx, commitments, refresh) {
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
          await ctx.adapter.respondSupporterRole({ roleId: item.role_id, decision: "accept" });
          refresh();
        } catch (e) {
          alert("Lỗi: " + (e.message || "Không thể đồng ý"));
        }
      },
    }),
    createButton({
      label: "Từ chối",
      variant: "secondary",
      onClick: async () => {
        try {
          await ctx.adapter.respondSupporterRole({ roleId: item.role_id, decision: "decline" });
          refresh();
        } catch (e) {
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
    variant: "secondary",
    onClick: async () => {
      if (!confirm(`Bạn có chắc muốn dừng vai trò điểm tựa với học sinh ${studentName}?`)) return;
      try {
        await ctx.adapter.revokeSupporterRole({ roleId: item.role_id });
        refresh();
      } catch (e) {
        alert("Lỗi: " + (e.message || "Không thể dừng hỗ trợ"));
      }
    },
  });

  el.appendChild(info);
  el.appendChild(stopBtn);
  return el;
}
