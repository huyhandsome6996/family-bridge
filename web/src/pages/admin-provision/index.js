// Admin cấp phát cặp HS/PH (CAP-23 classroom.provision — 18/10/2026).
// Bảng hai cột: PHỤ HUYNH bên trái, HỌC SINH bên phải. Lưu = kết nối
// ACTIVE ngay cho cặp đó — KHÔNG cần hai bên xác nhận (quyết định mới của
// Huy, supersede luồng /proposal cho đúng chế độ cấp phát lớp học).
//
// TRUNG THỰC:
// - Thiếu grant "classroom.provision" → backend 404 → trang hiện trạng
//   thái "không có quyền" thật, không giả vùng quản trị.
// - Xem trước (preview) CHỈ ĐỌC. Lưu gửi batch_ref (crypto.randomUUID) —
//   gửi lại cùng batch khi nghi mất kết quả → server trả kết quả ĐÃ LƯU.
// - Kết quả theo từng hàng lấy từ phản hồi máy chủ; hàng lỗi hiện đỏ kèm
//   mã lỗi, không bao giờ hiện xanh cho hàng thất bại.
// - Cặp đã revoke không tự hồi sinh: chỉ kết nối lại khi tick chủ ý
//   "cho phép nối lại" → generation mới, grant cũ vẫn revoked.
// - Mật khẩu khởi tạo chỉ dùng cho tài khoản TẠO MỚI, không hiện lại.
import { h } from "../../app/dom.js";
import { getSessionGeneration } from "../../core/session.js";
import {
  createButton, createCard, createDialog, createErrorState, createSkeleton,
} from "../../components/index.js";

const MAX_ROWS = 50;

const ROW_STATUS_COPY = {
  will_connect: "Sẽ kết nối",
  will_create_accounts_and_connect: "Sẽ tạo tài khoản mới và kết nối",
  pair_already_active: "Đã kết nối từ trước — giữ nguyên",
  pending_proposal_will_close_and_connect: "Có đề xuất đang chờ — sẽ đóng và kết nối",
  pair_revoked: "Đã hủy kết nối trước đó — không tự nối lại",
  pair_revoked_reconnectable: "Đã hủy trước đó — sẽ nối lại (generation mới)",
  error: "Hàng không hợp lệ",
};

const APPLY_STATUS_COPY = {
  connected: "Đã kết nối",
  already_active: "Đã kết nối từ trước",
  reconnected: "Đã nối lại (generation mới)",
  error: "Thất bại",
};

let markRenderCancelled = () => {};

export const page = {
  id: "admin-provision",
  title: "Cấp tài khoản & kết nối",
  requiresAuth: true,
  requiresRole: false,
  chrome: "app",
  showBottomNav: false,

  render(ctx) {
    let cancelled = false;
    let runId = 0;
    markRenderCancelled = () => { cancelled = true; runId += 1; };

    const root = h("div", { class: "fb-page fb-admin-provision",
      dataset: { page: "admin-provision" } });
    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    body.appendChild(h("h2", { class: "fb-page__heading" },
      "Cấp tài khoản và kết nối cặp HS–PH"));
    body.appendChild(h("p", { class: "fb-page__lead" },
      "Mỗi hàng gán một phụ huynh/người chăm sóc (bên trái) với một học sinh "
      + "(bên phải). Khi bạn lưu, cặp đó thành kết nối hoạt động NGAY — hai "
      + "bên không cần xác nhận ghép đôi. Học sinh/vị thành niên vẫn tự chọn "
      + "đồng ý điều khoản và các lựa chọn AI/nghiên cứu của riêng mình."));

    const content = h("div", {});
    body.appendChild(content);

    const state = {
      classes: [],
      classRef: "",
      rows: [emptyRow()],
      preview: null,
      applying: false,
      batchRef: null,
      applyResult: null,
      backfill: null,
      backfillResult: null,
      backfillBatchRef: null,
    };

    // ------------------------------------------------------------------
    function emptyRow() {
      return { caregiver_code: "", student_code: "",
        caregiver_name: "", student_name: "", allow_reconnect: false };
    }

    function readRows() {
      return state.rows
        .filter((r) => r.caregiver_code.trim() || r.student_code.trim())
        .map((r) => ({
          caregiver_code: r.caregiver_code.trim(),
          student_code: r.student_code.trim(),
          caregiver_name: r.caregiver_name.trim(),
          student_name: r.student_name.trim(),
          allow_reconnect: r.allow_reconnect === true,
        }));
    }

    function statusClass(status) {
      if (status === "error" || status === "pair_revoked") return "is-error";
      if (status === "pair_already_active"
        || status === "pending_proposal_will_close_and_connect") return "is-warn";
      return "is-ok";
    }

    function copyForError(error) {
      if (!error) return "Chưa hoàn tất được yêu cầu. Vui lòng thử lại.";
      if (error.kind === "timeout" || error.kind === "network") {
        return "Máy chủ chưa phản hồi. Kết quả chưa chắc đã ghi — bấm lại "
          + "với cùng dữ liệu để máy chủ đối chiếu theo mã đợt.";
      }
      if (error.status === 404) {
        return "Tài khoản này không có quyền quản trị cấp phát cặp.";
      }
      if (error.status === 403) {
        return "Lớp này nằm ngoài phạm vi được cấp cho bạn.";
      }
      const detail = error.details && error.details.reason
        ? ` (${error.details.reason})` : "";
      return `Lỗi máy chủ${detail}. Không tự đoán — kiểm tra lại dữ liệu.`;
    }

    // ------------------------------------------------------------------
    function renderUnauthorized(message) {
      content.replaceChildren();
      content.appendChild(createErrorState({
        title: "Không có quyền truy cập",
        description: message,
        retryLabel: null,
      }));
    }

    function renderLoadError(error) {
      content.replaceChildren();
      content.appendChild(createErrorState({
        title: "Không tải được danh sách lớp",
        description: copyForError(error),
        retryLabel: "Thử lại",
        onRetry: () => load(),
      }));
    }

    // ------------------------------------------------------------------
    function renderWorkspace() {
      content.replaceChildren();

      // --- chọn lớp -----------------------------------------------------
      const classSelect = h("select", {
        class: "fb-input", id: "fb-admin-class",
        onChange: (e) => {
          state.classRef = e.target.value;
          state.preview = null;
          state.applyResult = null;
          state.backfill = null;
          state.backfillResult = null;
          renderWorkspace();
          loadBackfill();
        },
      });
      for (const item of state.classes) {
        classSelect.appendChild(h("option", {
          value: item.class_ref,
          selected: item.class_ref === state.classRef ? true : null,
        }, `${item.class_ref} — HS ${item.students} / PH ${item.caregivers}`
          + ` / đang chờ ${item.pending_proposals}`));
      }
      content.appendChild(createCard({
        title: "1. Chọn lớp trong phạm vi được cấp",
        description: null,
        children: h("div", {},
          h("label", { for: "fb-admin-class", class: "fb-admin-label" }, "Lớp"),
          classSelect),
      }));

      // --- bảng hai cột ---------------------------------------------------
      const grid = h("div", { class: "fb-admin-grid", role: "table",
        "aria-label": "Bảng ghép cặp phụ huynh – học sinh" });
      grid.appendChild(h("div", { class: "fb-admin-grid__head", role: "row" },
        h("div", { role: "columnheader" }, "Phụ huynh / Người chăm sóc"),
        h("div", { role: "columnheader" }, "Học sinh"),
        h("div", { role: "columnheader" }, "")));

      state.rows.forEach((row, index) => {
        const cell = (field, placeholder, label) => h("div", { role: "cell" },
          h("label", {
            class: "fb-admin-label", for: `fb-admin-${field}-${index}`,
          }, label),
          h("input", {
            class: "fb-input", id: `fb-admin-${field}-${index}`,
            value: row[field] || "", placeholder,
            onInput: (e) => { row[field] = e.target.value; },
          }));
        grid.appendChild(h("div", { class: "fb-admin-grid__row", role: "row" },
          cell("caregiver_code", "PH001", "Mã đăng nhập PH"),
          cell("student_code", "HS001", "Mã đăng nhập HS"),
          h("div", { role: "cell", class: "fb-admin-grid__rowmeta" },
            h("button", {
              class: "fb-btn fb-btn--ghost fb-btn--sm", type: "button",
              "aria-label": `Xóa hàng ${index + 1}`,
              onClick: () => {
                if (state.rows.length === 1) {
                  state.rows = [emptyRow()];
                } else {
                  state.rows.splice(index, 1);
                }
                renderWorkspace();
              },
            }, "Xóa"))));
      });
      content.appendChild(createCard({
        title: "2. Danh sách cặp (tối đa " + MAX_ROWS + " hàng/lần lưu)",
        description: "Tài khoản chưa có sẽ được tạo mới khi lưu — cần mật "
          + "khẩu khởi tạo bên dưới. Tài khoản đã có giữ nguyên mật khẩu, "
          + "mã và tên người dùng đã đổi.",
        children: h("div", {},
          grid,
          h("div", { class: "fb-admin-actions" },
            createButton({
              label: "Thêm hàng", variant: "ghost", size: "sm",
              disabled: state.rows.length >= MAX_ROWS,
              onClick: () => { state.rows.push(emptyRow()); renderWorkspace(); },
            }))),
      }));

      // --- mật khẩu khởi tạo ---------------------------------------------
      content.appendChild(createCard({
        title: "3. Mật khẩu khởi tạo cho tài khoản tạo mới",
        description: "Không dùng cho tài khoản đã có. Không lưu lại trên "
          + "trang — phát cho người dùng qua kênh riêng.",
        children: h("input", {
          class: "fb-input", type: "password", id: "fb-admin-init-password",
          autoComplete: "new-password",
          placeholder: "Chỉ cần khi có tài khoản tạo mới",
        }),
      }));

      // --- kết quả xem trước ---------------------------------------------
      if (state.preview) {
        content.appendChild(renderPreview(state.preview));
      }

      // --- kết quả lưu -----------------------------------------------------
      if (state.applyResult) {
        content.appendChild(renderApplyResult(state.applyResult));
      }

      // --- nút hành động ---------------------------------------------------
      const busy = state.applying;
      content.appendChild(h("div", { class: "fb-admin-actions" },
        createButton({
          label: "Kiểm tra trước khi cấp", variant: "primary",
          disabled: busy || !state.classRef,
          onClick: () => runPreview(),
        }),
        createButton({
          label: "Cấp tài khoản và kết nối", variant: "cta", size: "lg",
          disabled: busy || !state.classRef,
          onClick: () => confirmApply(),
        }),
        busy ? h("p", { class: "fb-page__note", role: "status" },
          "Đang xử lý — không đóng trang cho đến khi có kết quả từng hàng.")
          : null));

      // --- chuyển đổi cặp đang chờ ----------------------------------------
      content.appendChild(renderBackfillSection());
    }

    function renderPreview(preview) {
      const items = [];
      for (const row of preview.rows || []) {
        const label = ROW_STATUS_COPY[row.status] || row.status;
        items.push(h("li", {
          class: `fb-admin-result ${statusClass(row.status)}`,
        },
        h("strong", {}, `#${(row.row ?? 0) + 1} · ${row.caregiver_code || "?"}`
          + ` ↔ ${row.student_code || "?"}`),
        h("span", {}, label),
        row.problems && row.problems.length
          ? h("span", { class: "fb-admin-problems" },
            row.problems.join(", ")) : null,
        row.caregiver_display_name || row.student_display_name
          ? h("span", { class: "fb-admin-names" },
            [row.caregiver_display_name, row.student_display_name]
              .filter(Boolean).join(" ↔ ")) : null));
      }
      const s = preview.summary || {};
      return createCard({
        title: "Kết quả kiểm tra (chưa ghi gì)",
        description: `Tổng ${s.rows ?? 0} hàng · sẽ kết nối `
          + `${s.will_connect ?? 0} · tạo mới `
          + `${s.will_create_accounts_and_connect ?? 0} · đã active `
          + `${s.pair_already_active ?? 0} · lỗi ${s.errors ?? 0}`,
        children: h("ul", { class: "fb-admin-results" }, items),
      });
    }

    function renderApplyResult(result) {
      const items = [];
      for (const row of result.rows || []) {
        const label = APPLY_STATUS_COPY[row.status] || row.status;
        items.push(h("li", {
          class: `fb-admin-result ${statusClass(row.status)}`,
        },
        h("strong", {}, `#${(row.row ?? 0) + 1} · ${row.caregiver_code || "?"}`
          + ` ↔ ${row.student_code || "?"}`),
        h("span", {}, label),
        row.generation != null
          ? h("span", { class: "fb-admin-names" },
            `generation ${row.generation}`) : null,
        row.problems && row.problems.length
          ? h("span", { class: "fb-admin-problems" },
            row.problems.join(", ")) : null));
      }
      return createCard({
        title: "Kết quả lưu từ máy chủ",
        description: result.replayed
          ? "Đây là kết quả ĐÃ LƯU của mã đợt này (gửi lại không nhân đôi)."
          : `Kết nối mới ${result.connected ?? 0} · đã active `
            + `${result.already_active ?? 0} · nối lại `
            + `${result.reconnected ?? 0} · lỗi ${result.errors ?? 0}`,
        children: h("ul", { class: "fb-admin-results" }, items),
      });
    }

    // ------------------------------------------------------------------
    async function runPreview() {
      const thisRun = ++runId;
      state.applying = true;
      state.preview = null;
      renderWorkspace();
      try {
        const result = await ctx.adapter.adminPreviewPairs({
          classRef: state.classRef,
          rows: readRows(),
          initialPassword: initPasswordValue(),
        });
        if (cancelled || thisRun !== runId) return;
        state.preview = result;
      } catch (error) {
        if (cancelled || thisRun !== runId) return;
        content.prepend(createErrorState({
          title: "Không kiểm tra được danh sách",
          description: copyForError(error),
          retryLabel: "Thử lại",
          onRetry: () => runPreview(),
        }));
      } finally {
        if (!cancelled && thisRun === runId) {
          state.applying = false;
          renderWorkspace();
        }
      }
    }

    function initPasswordValue() {
      const field = document.getElementById("fb-admin-init-password");
      return field && field.value ? field.value : null;
    }

    function confirmApply() {
      const rows = readRows();
      if (!rows.length) return;
      // createDialog TỰ MỞ (gắn vào body) — không append lần hai.
      createDialog({
        title: "Cấp tài khoản và kết nối ngay?",
        message: "Khi lưu, mọi hàng hợp lệ sẽ thành kết nối HOẠT ĐỘNG "
          + "ngay — học sinh và phụ huynh không cần xác nhận ghép đôi. "
          + "Người dùng vẫn tự chọn đồng ý điều khoản và các lựa chọn "
          + "AI/nghiên cứu của riêng mình.",
        actions: [
          { label: "Xem lại", variant: "ghost" },
          { label: "Cấp và kết nối", variant: "cta",
            onClick: () => runApply(rows) },
        ],
      });
    }

    async function runApply(rows) {
      const thisRun = ++runId;
      const startGeneration = getSessionGeneration();
      state.applying = true;
      state.applyResult = null;
      // Kết quả chưa xác định (timeout) → GIỮ batch_ref cũ; lượt thử lại
      // kế tiếp dùng CÙNG mã để máy chủ đối chiếu, không nhân đôi.
      if (!state.batchRef) state.batchRef = crypto.randomUUID();
      const batchRef = state.batchRef;
      renderWorkspace();
      try {
        const result = await ctx.adapter.adminApplyPairs({
          classRef: state.classRef,
          rows,
          batchRef,
          initialPassword: initPasswordValue(),
        });
        if (cancelled || thisRun !== runId
          || getSessionGeneration() !== startGeneration) return;
        state.applyResult = result;
        state.batchRef = null; // đợt hoàn tất → lượt mới sẽ có mã mới
      } catch (error) {
        if (cancelled || thisRun !== runId) return;
        if (error && (error.kind === "timeout" || error.kind === "network")) {
          content.prepend(createErrorState({
            title: "Kết quả CHƯA XÁC ĐỊNH",
            description: "Máy chủ có thể đã nhận. Bấm 'Cấp tài khoản và "
              + "kết nối' một lần nữa với cùng dữ liệu — mã đợt được giữ "
              + "nguyên để máy chủ đối chiếu, không nhân đôi kết nối.",
            retryLabel: null,
          }));
        } else {
          content.prepend(createErrorState({
            title: "Không lưu được",
            description: copyForError(error),
            retryLabel: null,
          }));
        }
      } finally {
        if (!cancelled && thisRun === runId) {
          state.applying = false;
          renderWorkspace();
        }
      }
    }

    // ------------------------------------------------------------------
    function renderBackfillSection() {
      const children = [];
      children.push(h("p", { class: "fb-page__note" },
        "Chuyển các cặp HS–PH ĐANG CHỜ xác nhận trong danh sách đã cấp thành "
        + "kết nối hoạt động. Xem trước cho biết số lượng và danh sách trước "
        + "khi chuyển; cặp đã hủy kết nối sẽ không tự hồi sinh."));
      if (state.backfill) {
        const b = state.backfill;
        children.push(h("ul", { class: "fb-admin-results" },
          h("li", { class: "fb-admin-result is-ok" },
            h("strong", {}, "Tài khoản"),
            h("span", {}, `HS ${b.accounts.students} · PH `
              + `${b.accounts.caregivers}`)),
          h("li", { class: "fb-admin-result is-ok" },
            h("strong", {}, "Cặp đủ điều kiện chờ chuyển"),
            h("span", {}, String(b.proposals.eligible_pending))),
          h("li", { class: "fb-admin-result is-warn" },
            h("strong", {}, "Đã active từ trước"),
            h("span", {}, String(b.already_active_pairs))),
          h("li", { class: "fb-admin-result is-error" },
            h("strong", {}, "Bị chặn (tài khoản khóa/đã hủy)"),
            h("span", {}, String(b.proposals.blocked)))));
        for (const pair of (b.eligible_pairs || []).slice(0, 10)) {
          children.push(h("div", { class: "fb-admin-pairline" },
            `${pair.caregiver_code} ↔ ${pair.student_code}`
            + ` — ${pair.caregiver_name} ↔ ${pair.student_name}`));
        }
      }
      if (state.backfillResult) {
        children.push(h("p", { class: "fb-page__note", role: "status" },
          state.backfillResult.replayed
            ? "Kết quả ĐÃ LƯU của mã đợt này (không xử lý lại)."
            : `Đã chuyển ${state.backfillResult.activated ?? 0} cặp thành `
              + `kết nối active · đã active `
              + `${state.backfillResult.already_active ?? 0}`
              + ` · lỗi ${state.backfillResult.errors ?? 0}.`));
      }
      children.push(h("div", { class: "fb-admin-actions" },
        createButton({
          label: state.backfill ? "Tải lại danh sách chờ"
            : "Xem danh sách chờ",
          variant: "ghost",
          disabled: state.applying,
          onClick: () => loadBackfill(),
        }),
        createButton({
          label: "Chuyển thành kết nối", variant: "primary",
          disabled: state.applying
            || !state.backfill
            || !state.backfill.proposals
            || state.backfill.proposals.eligible_pending === 0,
          onClick: () => confirmBackfill(),
        })));
      return createCard({
        title: "4. Chuyển cặp đang chờ thành kết nối hoạt động",
        description: "Dùng cho bộ danh sách mẫu đã cấp trước đây (ví dụ "
          + "100 tài khoản, 50 cặp đề xuất còn chờ).",
        children: h("div", {}, children),
      });
    }

    async function loadBackfill() {
      const thisRun = ++runId;
      try {
        const data = await ctx.adapter.adminBackfillInventory({
          classRef: state.classRef || null,
        });
        if (cancelled || thisRun !== runId) return;
        state.backfill = data;
      } catch (error) {
        if (cancelled || thisRun !== runId) return;
        content.prepend(createErrorState({
          title: "Không tải được danh sách chờ",
          description: copyForError(error),
          retryLabel: "Thử lại",
          onRetry: () => loadBackfill(),
        }));
        return;
      }
      renderWorkspace();
    }

    function confirmBackfill() {
      createDialog({
        title: "Chuyển các cặp đang chờ thành kết nối?",
        message: "Mọi cặp đủ điều kiện trong phạm vi sẽ thành kết nối "
          + "hoạt động ngay — không cần hai bên xác nhận lại. Hành động "
          + "được ghi nguồn admin và mã đợt để theo dõi.",
        actions: [
          { label: "Để sau", variant: "ghost" },
          { label: "Chuyển ngay", variant: "primary",
            onClick: () => runBackfill() },
        ],
      });
    }

    async function runBackfill() {
      const thisRun = ++runId;
      const startGeneration = getSessionGeneration();
      if (!state.backfillBatchRef) {
        state.backfillBatchRef = crypto.randomUUID();
      }
      const batchRef = state.backfillBatchRef;
      state.applying = true;
      renderWorkspace();
      try {
        const result = await ctx.adapter.adminBackfillApply({
          classRef: state.classRef || null,
          batchRef,
        });
        if (cancelled || thisRun !== runId
          || getSessionGeneration() !== startGeneration) return;
        state.backfillResult = result;
        state.backfillBatchRef = null;
        state.backfill = null;
      } catch (error) {
        if (cancelled || thisRun !== runId) return;
        content.prepend(createErrorState({
          title: error && (error.kind === "timeout" || error.kind === "network")
            ? "Kết quả CHƯA XÁC ĐỊNH" : "Không chuyển được",
          description: error && (error.kind === "timeout"
            || error.kind === "network")
            ? "Máy chủ có thể đã nhận. Bấm 'Chuyển thành kết nối' lại — mã "
              + "đợt giữ nguyên để đối chiếu, không nhân đôi."
            : copyForError(error),
          retryLabel: null,
        }));
      } finally {
        if (!cancelled && thisRun === runId) {
          state.applying = false;
          renderWorkspace();
        }
      }
    }

    // ------------------------------------------------------------------
    async function load() {
      const thisRun = ++runId;
      content.replaceChildren(
        createSkeleton({ variant: "card", count: 3 }));
      try {
        const classes = await ctx.adapter.adminListClasses();
        if (cancelled || thisRun !== runId) return;
        state.classes = classes;
        state.classRef = classes[0] ? classes[0].class_ref : "";
        if (!classes.length) {
          renderUnauthorized(
            "Tài khoản của bạn chưa được cấp quyền quản trị lớp nào "
            + "(capability classroom.provision).");
          return;
        }
        renderWorkspace();
        // Tải nền danh sách chờ để nút chuyển sẵn trạng thái.
        loadBackfill();
      } catch (error) {
        if (cancelled || thisRun !== runId) return;
        if (error && error.status === 404) {
          renderUnauthorized(
            "Tài khoản này không có quyền quản trị cấp phát cặp "
            + "(trang không tồn tại với tài khoản thường).");
          return;
        }
        renderLoadError(error);
      }
    }

    load();

    return root;
  },

  destroy() {
    markRenderCancelled();
  },
};
