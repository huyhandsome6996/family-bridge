// Riêng tư & đồng ý (Web Render Task 2, M5b — F15).
// Port NGỮ NGHĨA từ packages/family_bridge_mobile/f15_privacy/pages/privacy.js
// nhưng giữ page contract của app web này (h(), runId/cancelled, destroy).
//
// Hợp đồng backend F15 (packages/family_bridge_features/f15_privacy):
//   GET  /api/v1/privacy/overview → { shared_by_me:[{item_type,item_id,
//        recipient_id,approved_revision,revoked}], connections:[...] }
//        (payload KHÔNG có consents — trạng thái đồng ý đọc qua F01
//        GET /api/v1/consents, mỗi purpose đều được liệt kê)
//   POST /api/v1/privacy/grants/{item_type}/{item_id}/revoke {recipient_id?}
//   POST /api/v1/privacy/deletion-requests {categories} → 201/200(duplicate)
//        {request_id,status,receipt?,duplicate}
//   GET  /api/v1/privacy/deletion-requests/{id} → {request_id,status,
//        scope_categories,requested_at,completed_at,failure_detail,note}
//   POST /api/v1/privacy/deletion-requests/{id}/cancel {expected_revision?}
//   POST /api/v1/privacy/consents/{purpose}/withdraw → {purpose,withdrawn}
//
// TRUNG THỰC (FL-20/WF-21 + worklog Task 19):
// - Thu hồi chặn LẦN ĐỌC MỚI; bản sao ngoài ứng dụng (ảnh chụp màn hình) không
//   thu hồi được — copy lấy từ note thật của backend.
// - KHÔNG tuyên bố dữ liệu bị xóa sạch khi máy chủ chưa báo completed; trạng
//   thái failed_needs_action hiển thị đúng như thật.
// - Yêu cầu xóa ≠ dữ liệu biến mất ngay: máy chủ xác minh trước khi xử lý.
// - Biên nhận chỉ hiện MỘT LẦN (backend chỉ lưu hash — SEC-19/22).
// - Không polling: trạng thái mới hơn khi người dùng tải lại hoặc thao tác xong.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton, createCard, createDialog, createEmptyState, createErrorState,
  createDemoBanner, createSkeleton,
} from "../../components/index.js";

// item_type thật từ grant registry F15 (F07/F08); loại lạ → hiện nguyên mã.
const ITEM_TYPE_LABELS = {
  mood_entry: "Ghi nhận tâm trạng",
  journal_page: "Trang nhật ký",
};

// Allowlist phạm vi xóa dữ liệu — ĐÚNG DeletionRequest.CATEGORIES (models.py).
const DELETION_CATEGORIES = [
  { key: "account", label: "Tài khoản" },
  { key: "connections", label: "Kết nối & lời mời" },
  { key: "mood", label: "Ghi nhận tâm trạng" },
  { key: "journal", label: "Nhật ký" },
  { key: "drafts", label: "Bản thảo" },
  { key: "messages", label: "Tin nhắn" },
  { key: "ai", label: "Dữ liệu AI (gợi ý diễn đạt)" },
  { key: "surveys", label: "Khảo sát" },
  { key: "program_progress", label: "Tiến độ chương trình đồng hành" },
  { key: "appointments", label: "Lịch hẹn hỗ trợ nhà trường" },
];

// Bản đồ nhãn trạng thái xóa — ĐÚNG DeletionRequest.STATUSES. Nhãn mô tả
// trung thực: "completed" chỉ khi máy chủ báo, còn lại ghi rõ chưa xong.
const DELETION_STATUS_LABELS = {
  requested: "Đã tiếp nhận — chờ xác minh",
  verified: "Đã xác minh — chờ xử lý",
  processing: "Đang xử lý",
  completed: "Hoàn tất — máy chủ xác nhận mọi hạng mục đã xử lý xong",
  failed_needs_action: "Cần xử lý thêm — một số hạng mục chưa xong (yêu cầu chưa hoàn tất)",
  rejected: "Bị từ chối",
  cancelled: "Đã hủy",
};

// Hậu quả rút đồng ý — trung thực theo thiết kế F01/WF-17 (không đe dọa ảo).
const CONSENT_PURPOSES = {
  service: {
    label: "Dịch vụ Family Bridge",
    consequence:
      "Rút đồng ý dịch vụ sẽ khiến bạn không thể tiếp tục dùng Family Bridge "
      + "(không đăng nhập/đồng hành được nữa).",
  },
  ai_processing: {
    label: "AI gợi ý cách diễn đạt",
    consequence:
      "Rút đồng ý sẽ tắt gợi ý diễn đạt tự động khi bạn soạn thư; "
      + "các tính năng khác vẫn dùng được.",
  },
  research: {
    label: "Nghiên cứu tổng hợp (tùy chọn)",
    consequence:
      "Rút đồng ý sẽ loại dữ liệu của bạn khỏi khảo sát nghiên cứu; "
      + "không ảnh hưởng việc dùng ứng dụng.",
  },
};

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

function itemTypeLabel(code) {
  return ITEM_TYPE_LABELS[code] || String(code || "Mục chia sẻ");
}

function deletionStatusLabel(status) {
  return DELETION_STATUS_LABELS[status] || String(status || "Không rõ");
}

function timeLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function consentStatusLabel(record) {
  if (!record || record.decision === "none") return "Chưa có lựa chọn";
  if (record.withdrawn) return "Đã rút đồng ý";
  if (record.decision === "declined") return "Bạn đã từ chối";
  if (record.decision === "accepted") {
    const version = record.policy_version ? ` (phiên bản ${record.policy_version})` : "";
    const stale = record.current === false
      ? " — bản ghi theo phiên bản cũ, không tự áp dụng cho phiên bản hiện hành" : "";
    return `Đang đồng ý${version}${stale}`;
  }
  return String(record.decision || "Không rõ");
}

export const page = {
  id: "privacy",
  title: "Riêng tư & đồng ý",
  requiresRole: true,
  requiresAuth: true, // dữ liệu riêng tư theo phiên (router M1)
  showBottomNav: true,
  chrome: "app", // bọc trong app-shell web desktop (router M1)

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "privacy" } });
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
          title: "Cần đăng nhập để mở trang riêng tư",
          description:
            "Trang này hiển thị dữ liệu riêng của tài khoản bạn. Đăng nhập để tiếp tục.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    const state = {
      // Trạng thái yêu cầu xóa GIỮ TRONG BỘ NHỚ trang (không storage — SEC-10):
      // tải lại trang = đăng nhập lại, máy chủ vẫn giữ yêu cầu thật của bạn.
      deletionRequestId: null,
      deletionStatus: null,
      deletionScope: [],
      deletionRequestedAt: null,
      deletionRevision: null,
      receipt: null,
      duplicate: false,
    };

    const load = () => {
      const thisRun = ++runId;
      if (demo) { clear(body); body.appendChild(createDemoBanner()); }
      body.appendChild(createSkeleton({ variant: "line", count: 2 }));
      body.appendChild(h("p", { role: "status" }, "Đang tải trạng thái riêng tư…"));

      Promise.all([
        Promise.resolve().then(() => ctx.adapter.privacyOverview()),
        Promise.resolve().then(() => ctx.adapter.listConsents()).catch(() => null),
      ])
        .then(([overview, consents]) => {
          if (cancelled || thisRun !== runId) return;
          renderPrivacy(body, ctx, {
            demo,
            overview: overview || { shared_by_me: [], connections: [] },
            consents: Array.isArray(consents) ? consents : null,
            state,
            reload: load,
            openDialogs,
          });
        })
        .catch((error) => {
          if (cancelled || thisRun !== runId) return;
          if (error && error.status === 401) {
            ctx.navigate("/login?reason=expired");
            return;
          }
          clear(body);
          if (demo) body.appendChild(createDemoBanner());
          body.appendChild(
            createErrorState({
              title: "Không tải được trạng thái riêng tư",
              description: error && error.kind === "timeout"
                ? "Kết nối quá thời gian chờ. Vui lòng thử lại."
                : "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
              retryLabel: "Thử lại",
              onRetry: () => load(),
            }),
          );
        });
    };
    load();

    return root;
  },
};

let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;

/* ------------------------------- Trang chính ------------------------------- */

function renderPrivacy(body, ctx, { demo, overview, consents, state, reload, openDialogs }) {
  clear(body);
  if (demo) body.appendChild(createDemoBanner());

  const breadcrumb = h("nav", { class: "fb-breadcrumb", "aria-label": "Vị trí trang" });
  breadcrumb.appendChild(h("a", { class: "fb-breadcrumb__link", href: "#/home" }, "Trang chủ"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__sep", "aria-hidden": "true" }, "›"));
  breadcrumb.appendChild(h("span", { class: "fb-breadcrumb__current" }, "Riêng tư & đồng ý"));
  body.appendChild(breadcrumb);

  body.appendChild(
    h("header", { class: "fb-sec" },
      h("div", { class: "fb-sec__row" },
        h("span", { class: "fb-journey__kicker" }, "Bạn quyết định dữ liệu của mình"),
      ),
      h("h1", { class: "fb-sec__greeting" }, "Riêng tư & đồng ý"),
      h("p", { class: "fb-sec__sub" },
        "Mọi trạng thái dưới đây là dữ liệu thật từ máy chủ tại thời điểm tải trang.",
      ),
    ),
  );

  body.appendChild(renderGrantsCard(ctx, overview, reload));
  body.appendChild(renderDeletionCard(ctx, state, reload, openDialogs));
  body.appendChild(renderConsentsCard(ctx, consents, reload, openDialogs));

  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Không có trạng thái nào ở đây được bịa hoặc làm đẹp: khi chưa xử lý xong, "
      + "máy chủ ghi rõ yêu cầu chưa hoàn tất.",
    ),
  );
}

/* ---------------------------- (1) Đang chia sẻ ----------------------------- */

function renderGrantsCard(ctx, overview, reload) {
  const wrap = h("div", {});
  const note = h("p", { class: "fb-page__note", role: "status", "aria-live": "polite" });
  wrap.appendChild(note);

  const grants = Array.isArray(overview.shared_by_me) ? overview.shared_by_me : [];
  if (!grants.length) {
    // Trạng thái rỗng THẬT của máy chủ — không bịa mục nào.
    wrap.appendChild(
      h("p", { class: "fb-field__hint" },
        "Bạn chưa chia sẻ mục nào. Mỗi mục bạn chia sẻ sẽ hiện ở đây để bạn thu hồi riêng.",
      ),
    );
    return createCard({ title: "Đang chia sẻ", children: wrap });
  }

  grants.forEach((grant) => {
    if (!grant) return;
    const row = h("div", { class: "fb-field" });
    row.appendChild(
      h("p", {},
        h("strong", {}, itemTypeLabel(grant.item_type)),
        grant.revoked ? " — đã thu hồi" : " — đang chia sẻ",
      ),
    );
    if (!grant.revoked) {
      row.appendChild(createButton({
        label: "Thu hồi",
        variant: "danger",
        ariaLabel: `Thu hồi chia sẻ ${itemTypeLabel(grant.item_type)}`,
        onClick: () => {
          const dialog = createDialog({
            title: "Thu hồi chia sẻ mục này?",
            message:
              "Người nhận sẽ không đọc được mục này nữa từ lần đọc kế tiếp. "
              + "Bản sao đã lưu ngoài ứng dụng (ví dụ ảnh chụp màn hình) không thu hồi được.",
            actions: [
              { label: "Giữ nguyên", variant: "ghost", onClick: () => {} },
              {
                label: "Thu hồi",
                variant: "danger",
                onClick: () => onRevoke(grant),
              },
            ],
          });
          openDialogs.add(dialog);
        },
      }));
    }
    wrap.appendChild(row);
  });

  function onRevoke(grant) {
    clear(note);
    note.textContent = "Đang thu hồi…";
    Promise.resolve()
      .then(() => ctx.adapter.revokeGrant({
        itemType: grant.item_type,
        itemId: grant.item_id,
        recipientId: grant.recipient_id || null,
      }))
      .then(() => {
        // Copy đối chiếu note thật của backend: chặn đọc mới, không thu hồi
        // được bản sao ngoài ứng dụng. Tải lại danh sách để thấy trạng thái mới.
        note.textContent =
          "Đã thu hồi. Lần đọc mới sẽ bị chặn; bản sao ngoài ứng dụng không thu hồi được.";
        reload();
      })
      .catch((error) => {
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          error && error.kind === "timeout"
            ? "Kết nối quá thời gian chờ. Chưa thu hồi được — thử lại."
            : "Không thu hồi được. Thử lại.",
        ));
      });
  }

  return createCard({
    title: "Đang chia sẻ",
    description:
      "Từng mục bạn đã cho người đồng hành xem. Thu hồi chỉ chặn LẦN ĐỌC MỚI; "
      + "bản sao đã lưu ngoài ứng dụng (ví dụ ảnh chụp màn hình) không thu hồi được.",
    children: wrap,
  });
}

/* ------------------------ (2) Yêu cầu xóa dữ liệu -------------------------- */

function renderDeletionCard(ctx, state, reload, openDialogs) {
  const wrap = h("div", {});
  const statusBox = h("div", { role: "status", "aria-live": "polite" });
  const note = h("p", { class: "fb-page__note", role: "status", "aria-live": "polite" });
  const checkboxes = new Map();

  wrap.appendChild(
    h("p", { class: "fb-field__hint" },
      "Chọn phạm vi bạn muốn xóa. Yêu cầu sẽ được xác minh trước khi xử lý; "
      + "trạng thái luôn phản ánh thật — chưa xong sẽ ghi rõ. Yêu cầu xóa không "
      + "đồng nghĩa dữ liệu biến mất ngay lập tức.",
    ),
  );

  DELETION_CATEGORIES.forEach(({ key, label }) => {
    const id = `fb-privacy-cat-${key}`;
    const checkbox = h("input", {
      type: "checkbox", id, value: key, style: "margin-right:8px",
    });
    checkboxes.set(key, checkbox);
    wrap.appendChild(
      h("div", { class: "fb-field" },
        h("label", { for: id }, checkbox, label),
      ),
    );
  });

  const submit = createButton({
    label: "Gửi yêu cầu xóa dữ liệu",
    variant: "danger",
    onClick: () => onRequest(),
  });
  wrap.appendChild(submit);
  wrap.appendChild(statusBox);
  wrap.appendChild(note);

  function selectedCategories() {
    const selected = [];
    checkboxes.forEach((checkbox, key) => {
      if (checkbox.checked) selected.push(key);
    });
    return selected;
  }

  function fetchStatus(requestId) {
    Promise.resolve()
      .then(() => ctx.adapter.getDeletionRequest(requestId))
      .then((detail) => {
        if (!detail) return;
        state.deletionStatus = detail.status;
        state.deletionScope = Array.isArray(detail.scope_categories) ? detail.scope_categories : [];
        state.deletionRequestedAt = detail.requested_at || null;
        state.deletionRevision = typeof detail.revision === "number" ? detail.revision : null;
        drawStatus();
      })
      .catch(() => {
        // Không lấy được chi tiết → vẫn giữ nguyên dữ liệu đã có, không bịa.
        drawStatus();
      });
  }

  function drawStatus() {
    clear(statusBox);
    if (!state.deletionRequestId) return;
    const panel = h("div", { class: "fb-field" });
    panel.appendChild(
      h("p", {},
        h("strong", {}, "Trạng thái hiện tại: "),
        deletionStatusLabel(state.deletionStatus),
      ),
    );
    if (state.deletionScope.length) {
      panel.appendChild(
        h("p", { class: "fb-sec__sub" },
          `Phạm vi: ${state.deletionScope.map((key) => {
            const found = DELETION_CATEGORIES.find((c) => c.key === key);
            return found ? found.label : key;
          }).join(", ")}`,
        ),
      );
    }
    const when = timeLabel(state.deletionRequestedAt);
    if (when) panel.appendChild(h("p", { class: "fb-sec__sub" }, `Tiếp nhận lúc: ${when}`));
    if (state.receipt) {
      panel.appendChild(
        h("p", { class: "fb-page__note" },
          "Mã biên nhận (lưu lại — chỉ hiện một lần): ",
          h("strong", {}, String(state.receipt)),
        ),
      );
    }
    if (state.duplicate) {
      panel.appendChild(
        h("p", { class: "fb-sec__sub" }, "Bạn đã có yêu cầu đang mở (máy chủ không tạo trùng)."),
      );
    }
    if (state.deletionStatus === "requested") {
      panel.appendChild(createButton({
        label: "Hủy yêu cầu xóa",
        variant: "ghost",
        onClick: () => {
          const dialog = createDialog({
            title: "Hủy yêu cầu xóa dữ liệu?",
            message:
              "Bạn chỉ hủy được khi yêu cầu còn ở trạng thái chờ xác minh. "
              + "Sau khi xử lý bắt đầu, không thể hủy.",
            actions: [
              { label: "Giữ yêu cầu", variant: "ghost", onClick: () => {} },
              { label: "Hủy yêu cầu", variant: "danger", onClick: () => onCancel() },
            ],
          });
          openDialogs.add(dialog);
        },
      }));
    } else if (state.deletionStatus
      && state.deletionStatus !== "cancelled"
      && state.deletionStatus !== "completed") {
      panel.appendChild(
        h("p", { class: "fb-sec__sub" },
          "Yêu cầu đã vào xử lý nên không thể hủy — trạng thái sẽ phản ánh tiến trình thật.",
        ),
      );
    }
    statusBox.appendChild(panel);
  }

  function onRequest() {
    clear(note);
    const categories = selectedCategories();
    if (!categories.length) {
      note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
        "Chọn ít nhất một phạm vi."));
      return;
    }
    const dialog = createDialog({
      title: "Gửi yêu cầu xóa dữ liệu?",
      message:
        "Yêu cầu sẽ được xác minh trước khi xử lý. Sau khi xử lý bắt đầu, không thể hủy. "
        + "Máy chủ sẽ trả mã biên nhận một lần duy nhất.",
      actions: [
        { label: "Chưa gửi", variant: "ghost", onClick: () => {} },
        { label: "Gửi yêu cầu", variant: "danger", onClick: () => submitRequest(categories) },
      ],
    });
    openDialogs.add(dialog);
  }

  function submitRequest(categories) {
    clear(note);
    submit.disabled = true;
    note.textContent = "Đang gửi yêu cầu…";
    Promise.resolve()
      .then(() => ctx.adapter.requestDeletion({ categories }))
      .then((result) => {
        state.deletionRequestId = (result && result.request_id) || null;
        state.deletionStatus = (result && result.status) || null;
        state.deletionScope = categories;
        state.duplicate = Boolean(result && result.duplicate);
        state.receipt = (result && result.receipt) || null;
        clear(note);
        if (result && result.receipt) {
          note.textContent = "Yêu cầu đã được ghi nhận. Trạng thái sẽ phản ánh tiến trình thật.";
        } else {
          note.textContent = "Yêu cầu đã được ghi nhận (trùng yêu cầu đang mở không tạo bản mới).";
        }
        drawStatus();
        if (state.deletionRequestId) fetchStatus(state.deletionRequestId);
      })
      .catch((error) => {
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          error && error.kind === "timeout"
            ? "Kết nối quá thời gian chờ. KẾT QUẢ CHƯA XÁC ĐỊNH: máy chủ có thể đã nhận yêu cầu — tải lại trang để kiểm tra trạng thái trước khi gửi lại."
            : "Không gửi được yêu cầu. Thử lại sau.",
        ));
      })
      .then(() => { submit.disabled = false; });
  }

  function onCancel() {
    if (!state.deletionRequestId) return;
    clear(note);
    note.textContent = "Đang hủy yêu cầu…";
    Promise.resolve()
      .then(() => ctx.adapter.cancelDeletionRequest(
        state.deletionRequestId,
        { expectedRevision: state.deletionRevision },
      ))
      .then((result) => {
        state.deletionStatus = (result && result.status) || "cancelled";
        clear(note);
        note.textContent = "Yêu cầu đã hủy. Dữ liệu của bạn không bị xóa bởi yêu cầu này.";
        drawStatus();
      })
      .catch((error) => {
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        if (error && error.status === 409) {
          // Xung đột revision: trạng thái đã đổi trên máy chủ → tải lại trạng
          // thái mới nhất, KHÔNG tự retry hủy (tránh hủy nhầm trạng thái cũ).
          clear(note);
          note.textContent =
            "Trạng thái yêu cầu vừa thay đổi trên máy chủ — đã tải lại trạng thái mới nhất. "
            + "Kiểm tra lại trước khi hủy tiếp.";
          fetchStatus(state.deletionRequestId);
          return;
        }
        const reason = error && error.details && error.details.reason
          ? String(error.details.reason) : "";
        note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          (error && error.code === "cancel_only_while_requested")
            || reason === "cancel_only_while_requested"
            ? "Yêu cầu đã vào xử lý nên không hủy được nữa."
            : "Không hủy được yêu cầu. Thử lại sau.",
        ));
      });
  }

  if (state.deletionRequestId) drawStatus();

  return createCard({
    title: "Yêu cầu xóa dữ liệu",
    description:
      "Máy chủ xử lý theo từng hạng mục và ghi sổ cái sự kiện; trạng thái chỉ báo "
      + "“Hoàn tất” khi mọi hạng mục đều xử lý thành công.",
    children: wrap,
  });
}

/* ------------------------ (3) Đồng ý theo mục đích ------------------------- */

function renderConsentsCard(ctx, consents, reload, openDialogs) {
  const wrap = h("div", {});

  if (!consents) {
    // listConsents lỗi → nói thật, không tự suy trạng thái đồng ý.
    wrap.appendChild(
      h("p", { class: "fb-field__hint" },
        "Chưa tải được trạng thái đồng ý từ máy chủ. Tải lại trang để xem trạng thái thật.",
      ),
    );
    return createCard({
      title: "Đồng ý theo mục đích",
      description: "Lựa chọn của bạn cho từng mục đích sử dụng dữ liệu.",
      children: wrap,
    });
  }

  ["service", "ai_processing", "research"].forEach((purpose) => {
    const config = CONSENT_PURPOSES[purpose];
    const record = consents.find((item) => item && item.purpose === purpose) || null;
    const row = h("div", { class: "fb-field" });
    row.appendChild(
      h("p", {},
        h("strong", {}, config.label),
        ` — ${consentStatusLabel(record)}`,
      ),
    );
    if (record && record.decision === "accepted" && !record.withdrawn) {
      row.appendChild(createButton({
        label: "Rút đồng ý",
        variant: "danger",
        ariaLabel: `Rút đồng ý cho ${config.label}`,
        onClick: () => {
          const dialog = createDialog({
            title: `Rút đồng ý: ${config.label}?`,
            message: config.consequence,
            actions: [
              { label: "Giữ đồng ý", variant: "ghost", onClick: () => {} },
              { label: "Rút đồng ý", variant: "danger", onClick: () => onWithdraw(purpose) },
            ],
          });
          openDialogs.add(dialog);
        },
      }));
    }
    wrap.appendChild(row);
  });

  function onWithdraw(purpose) {
    Promise.resolve()
      .then(() => ctx.adapter.withdrawConsent({ purpose }))
      .then((result) => {
        reload();
        return result;
      })
      .catch((error) => {
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        clear(wrap);
        wrap.appendChild(
          h("p", { class: "fb-field__error", role: "alert" },
            error && error.kind === "timeout"
              ? "Kết nối quá thời gian chờ. Chưa rút được đồng ý — thử lại."
              : "Không rút được đồng ý. Thử lại sau.",
          ),
        );
      });
  }

  return createCard({
    title: "Đồng ý theo mục đích",
    description:
      "Đồng ý được ghi theo từng mục đích, từng phiên bản chính sách. "
      + "Rút đồng ý ghi nhận vào sổ cái sự kiện của máy chủ.",
    children: wrap,
  });
}
