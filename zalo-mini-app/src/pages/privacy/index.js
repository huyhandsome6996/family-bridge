// Riêng tư & đồng ý (Web Render Task 2, M5b — F15).
// Port NGỮ NGHĨA từ packages/family_bridge_mobile/f15_privacy/pages/privacy.js
// nhưng giữ page contract của app web này (h(), runId/cancelled, destroy).
//
// Hợp đồng backend F15 (packages/family_bridge_features/f15_privacy):
//   GET  /api/v1/privacy/overview → { shared_by_me:[{item_type,item_id,
//        share_id,recipient_id,approved_revision,revoked}], connections:[...],
//        next_cursor, has_more }  — cursor v2 "ov2|<created_at_iso>|<share_id>"
//        (nút "Tải thêm" chỉ hiện khi has_more; nối CÓ DEDUP theo khóa
//        item_type|item_id|share_id; dừng có trần khi không còn mục mới)
//        (payload KHÔNG có consents — trạng thái đồng ý đọc qua F01
//        GET /api/v1/consents, mỗi purpose đều được liệt kê)
//   POST /api/v1/privacy/grants/{item_type}/{item_id}/revoke {recipient_id?}
//   POST /api/v1/privacy/deletion-requests {categories} → 201/200(duplicate)
//        {request_id,status,receipt?,duplicate}
//   GET  /api/v1/privacy/deletion-requests/{id} → {request_id,status,
//        scope_categories,requested_at,completed_at,failure_detail,note}
//   POST /api/v1/privacy/deletion-requests/{id}/cancel {expected_revision?}
//   GET  /api/v1/privacy/deletion-requests/list → {results:[{request_id,
//        status,scope_categories,requested_at,revision}],next_cursor,has_more}
//        (mới nhất trước — dùng để ĐỌC LẠI trạng thái lúc mở trang)
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
//
// Port từ page-core F15 (packages/family_bridge_mobile/f15_privacy/page-core.js)
// những gì trang native còn thiếu — cursor v2 (R09), share_id + dedup, guard
// double-submit cho thu hồi, đọc lại ĐÚNG MỘT lần sau mutation mất response
// (K7 unknown outcome), phân loại lỗi kind=configuration.
//
// Task 3-c (P2-1 + P2-2 của QA-3):
// - P2-1: nối điều hướng tới trang "Chia sẻ từng mục" (/privacy-items) —
//   trước đây route mồ côi (0 điểm điều hướng tới nó trên cả 2 client).
// - P2-2: lúc mở trang đọc lại danh sách yêu cầu xóa ĐÃ CÓ trên máy chủ qua
//   adapter.listDeletionRequests() (shared, Task 3-b) — trạng thái không còn
//   mất sau reload; nút hủy trong danh sách nối vào đúng logic hủy có sẵn
//   (giữ expected_revision); list lỗi → báo thật, không bịa danh sách rỗng;
//   has_more=true → nói thật là còn yêu cầu cũ hơn trên máy chủ (không giả
//   vờ trang đầu tiên là toàn bộ — máy chủ cắt theo trang, mặc định 20).
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton, createCard, createDialog, createEmptyState, createErrorState,
  createDemoBanner, createIcon, createSkeleton,
} from "../../components/index.js";

// item_type thật từ grant registry F15 (F07/F08); loại lạ → hiện nguyên mã.
const ITEM_TYPE_LABELS = {
  mood_entry: "Ghi nhận tâm trạng",
  journal_page: "Trang nhật ký",
};

// Trần tích lũy danh sách chia sẻ (bounded) — chống phình vô hạn khi máy chủ
// liên tục trả cursor mới; phần còn lại vẫn nằm an toàn trên máy chủ.
const SHARE_ITEMS_MAX = 300;

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
  showBottomNav: false, // trang phụ — tab dưới chỉ ở 5 trang cấp một (DESIGN.md §5)
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
      // Cursor v2 cho danh sách chia sẻ (port page-core F15/R09): con trỏ +
      // khóa dedup + cờ dừng có trần; sống qua các lần render lại trong cùng
      // một lần mở trang, reset khi nhận trang-1 mới từ máy chủ.
      renderSeq: 0,
      sharedNextCursor: null,
      sharedHasMore: false,
      sharedExhausted: false,
      sharedKeys: new Set(),
      loadMoreBusy: false,
      revokeBusy: false,
      reconcileNote: null,
    };

    const load = () => {
      const thisRun = ++runId;
      if (demo) { clear(body); body.appendChild(createDemoBanner()); }
      body.appendChild(createSkeleton({ variant: "line", count: 2 }));
      body.appendChild(h("p", { role: "status" }, "Đang tải trạng thái riêng tư…"));

      Promise.all([
        Promise.resolve().then(() => ctx.adapter.privacyOverview()),
        Promise.resolve().then(() => ctx.adapter.listConsents()).catch(() => null),
        // Danh sách yêu cầu xóa đã có trên máy chủ (P2-2/QA-3, adapter Task
        // 3-b): đọc lại lúc mở trang — lỗi → null và card sẽ báo thật, KHÔNG
        // bịa thành "chưa có yêu cầu nào".
        Promise.resolve()
          .then(() => ctx.adapter.listDeletionRequests())
          .catch(() => null),
      ])
        .then(([overview, consents, deletionPage]) => {
          if (cancelled || thisRun !== runId) return;
          renderPrivacy(body, ctx, {
            demo,
            overview: overview || { shared_by_me: [], connections: [] },
            consents: Array.isArray(consents) ? consents : null,
            // TRANG ĐẦY ĐỦ {results,next_cursor,has_more} (shape Task 3-b):
            // giữ cả has_more để card nói thật khi danh sách bị cắt theo trang.
            deletionPage: deletionPage && typeof deletionPage === "object"
              ? deletionPage : null,
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
              description:
                error && error.kind === "configuration"
                  ? "Ứng dụng chưa cấu hình địa chỉ máy chủ. Vui lòng cập nhật bản mới."
                  : error && error.kind === "timeout"
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

function renderPrivacy(body, ctx, { demo, overview, consents, deletionPage, state, reload, openDialogs }) {
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

  // "Chia sẻ từng mục" — điều hướng tới /privacy-items (P2-1/QA-3: route từng
  // mồ côi, web thiếu hẳn; giờ cả 2 client cùng nối từ vùng grants này).
  // Đặt SÁT card "Đang chia sẻ" nhưng NGOÀI card — card grants giữ nguyên
  // ngữ nghĩa riêng (trạng thái rỗng của card không kèm nút hành động).
  body.appendChild(
    h("div", { class: "fb-field" },
      h("p", { class: "fb-field__hint" },
        "Muốn chia sẻ đúng MỘT trang nhật ký cho một người nhận cụ thể? "
        + "Mở trang chia sẻ từng mục.",
      ),
      createButton({
        label: "Chia sẻ từng mục",
        variant: "ghost",
        ariaLabel: "Mở trang chia sẻ từng mục nhật ký",
        onClick: () => ctx.navigate("/privacy-items"),
      }),
    ),
  );

  body.appendChild(renderGrantsCard(ctx, overview, state, reload, openDialogs));
  body.appendChild(renderDeletionCard(ctx, state, reload, openDialogs, deletionPage));
  body.appendChild(renderConsentsCard(ctx, consents, reload, openDialogs));

  body.appendChild(
    h("p", { class: "fb-page__note" },
      "Không có trạng thái nào ở đây được bịa hoặc làm đẹp: khi chưa xử lý xong, "
      + "máy chủ ghi rõ yêu cầu chưa hoàn tất.",
    ),
  );

  // Đầu mối trợ giúp (frame M21 có hotline — BỎ số; dẫn tới trang Trợ giúp
  // luôn truy cập được, không bị khóa theo bất kỳ trạng thái nào).
  body.appendChild(
    h("section", { class: "fbc-help-pointer" },
      h("span", { class: "fbc-help-pointer__icon", "aria-hidden": "true" },
        createIcon({ name: "support_agent", size: 20 })),
      h("span", { class: "fbc-help-pointer__text" },
        h("span", { class: "fbc-help-pointer__title" }, "Cần trợ giúp hoặc tư vấn độc lập?"),
        h("span", { class: "fbc-help-pointer__hint" },
          "Danh bạ đầu mối được duyệt hiển thị tại trang Trợ giúp."),
      ),
      h("a", { class: "fb-btn fb-btn--ghost", href: "#/help" }, "Tìm trợ giúp"),
    ),
  );
}

/* ---------------------------- (1) Đang chia sẻ ----------------------------- */

// Khóa nhận dạng một mục chia sẻ cho dedup (cursor v2): cùng hình dạng với
// page-core F15 — item_type|item_id|share_id (share_id rỗng với provider cũ
// không có share id; khi đó khóa vẫn phân biệt theo item_id).
function shareKey(grant) {
  if (!grant) return "";
  return `${grant.item_type || ""}|${grant.item_id || ""}|${grant.share_id || ""}`;
}

function renderGrantsCard(ctx, overview, state, reload, openDialogs) {
  const wrap = h("div", {});
  const note = h("p", { class: "fb-page__note", role: "status", "aria-live": "polite" });
  wrap.appendChild(note);

  const grants = Array.isArray(overview.shared_by_me) ? overview.shared_by_me : [];

  // Mỗi lần render lại toàn trang là một lần nhận trang-1 MỚI từ máy chủ
  // (sau thu hồi/rút đồng ý) → con trỏ + khóa dedup reset theo dữ liệu mới.
  state.renderSeq = (state.renderSeq || 0) + 1;
  const renderSeq = state.renderSeq;
  state.sharedNextCursor = typeof overview.next_cursor === "string" && overview.next_cursor
    ? overview.next_cursor : null;
  state.sharedHasMore = Boolean(overview.has_more);
  state.sharedExhausted = false;
  state.sharedKeys = new Set(grants.map(shareKey));

  if (state.reconcileNote) note.textContent = state.reconcileNote;

  if (!grants.length) {
    // Trạng thái rỗng THẬT của máy chủ — không bịa mục nào.
    wrap.appendChild(
      h("p", { class: "fb-field__hint" },
        "Bạn chưa chia sẻ mục nào. Mỗi mục bạn chia sẻ sẽ hiện ở đây để bạn thu hồi riêng.",
      ),
    );
    return createCard({ title: "Đang chia sẻ", children: wrap });
  }

  const listWrap = h("div", {});
  wrap.appendChild(listWrap);
  grants.forEach((grant) => {
    if (grant) listWrap.appendChild(grantRow(grant));
  });

  // Vùng nút "Tải thêm" — render lại theo trạng thái cursor sau mỗi bước.
  const loadMoreArea = h("div", {});
  wrap.appendChild(loadMoreArea);
  drawLoadMore();

  function grantRow(grant) {
    const row = h("div", {
      class: "fbc-share-row",
      dataset: { shareId: grant.share_id || "" }, // share_id theo từng item (cursor v2)
    });
    row.appendChild(
      h("p", { class: "fbc-share-row__status" },
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
          if (state.revokeBusy) return; // một mutation riêng tư tại một thời điểm
          const dialog = createDialog({
            // Xác nhận ĐÚNG PHẠM VI theo frame M21: nêu đúng mục + hậu quả thật.
            title: `Thu hồi chia sẻ "${itemTypeLabel(grant.item_type)}"?`,
            message:
              "Bạn sắp thu hồi đúng mục này cho người nhận trong kết nối hiện có. "
              + "Người nhận sẽ không đọc được mục này nữa từ lần đọc kế tiếp. "
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
    return row;
  }

  // Nút "Tải thêm" (cursor v2 backend): CHỈ hiện khi has_more; click → GET
  // trang kế với cursor; nối CÓ DEDUP theo item_type|item_id|share_id; dừng
  // CÓ TRẦN khi trang kế không còn mục mới (không lặp vô hạn cùng một trang).
  function drawLoadMore() {
    clear(loadMoreArea);
    if (!state.sharedHasMore || state.sharedExhausted) return;
    if (listWrap.children.length >= SHARE_ITEMS_MAX) {
      loadMoreArea.appendChild(
        h("p", { class: "fb-field__hint" },
          `Đã hiển thị ${SHARE_ITEMS_MAX} mục gần nhất; các mục khác vẫn nằm an toàn trên máy chủ.`,
        ),
      );
      return;
    }
    loadMoreArea.appendChild(createButton({
      label: "Tải thêm",
      variant: "ghost",
      ariaLabel: "Tải thêm mục đang chia sẻ",
      onClick: onLoadMore,
    }));
  }

  function onLoadMore() {
    if (state.loadMoreBusy) return; // guard double-submit
    const cursor = state.sharedNextCursor;
    if (!cursor) {
      state.sharedHasMore = false;
      drawLoadMore();
      return;
    }
    state.loadMoreBusy = true;
    const btn = loadMoreArea.querySelector("button");
    if (btn) btn.disabled = true;
    Promise.resolve()
      .then(() => ctx.adapter.privacyOverview({ cursor }))
      .then((pageData) => {
        state.loadMoreBusy = false;
        // Trang đã render lại (mutation khác/tải lại) → response cũ bỏ, không
        // nối vào danh sách của lần render mới.
        if (renderSeq !== state.renderSeq || !listWrap.isConnected) return;
        const rows = Array.isArray(pageData && pageData.shared_by_me)
          ? pageData.shared_by_me : [];
        let freshCount = 0;
        rows.forEach((grant) => {
          if (!grant) return;
          const key = shareKey(grant);
          if (state.sharedKeys.has(key)) return; // dedup — không append trùng
          state.sharedKeys.add(key);
          freshCount += 1;
          listWrap.appendChild(grantRow(grant));
        });
        if (freshCount > 0) {
          state.sharedNextCursor = pageData && typeof pageData.next_cursor === "string"
            && pageData.next_cursor ? pageData.next_cursor : null;
          state.sharedHasMore = Boolean(pageData && pageData.has_more);
          if (!state.sharedHasMore) state.sharedExhausted = true;
          note.textContent = state.reconcileNote || "";
          drawLoadMore();
          return;
        }
        // Không có mục mới nào (ví dụ adapter chưa chuyển cursor tới máy chủ)
        // → dừng có trần, nói thật; không cho bấm vô hạn cùng một trang.
        state.sharedExhausted = true;
        drawLoadMore();
        note.textContent =
          "Chưa tải thêm được mục mới nào. Tải lại trang để xem danh sách mới nhất.";
      })
      .catch((error) => {
        state.loadMoreBusy = false;
        if (renderSeq !== state.renderSeq || !listWrap.isConnected) return;
        note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          error && error.kind === "timeout"
            ? "Kết nối quá thời gian chờ. Chưa tải thêm được — thử lại."
            : "Không tải thêm được. Thử lại.",
        ));
        drawLoadMore();
      });
  }

  function onRevoke(grant) {
    if (state.revokeBusy) return;
    state.revokeBusy = true;
    state.reconcileNote = null;
    clear(note);
    note.textContent = "Đang thu hồi…";
    Promise.resolve()
      .then(() => ctx.adapter.revokeGrant({
        itemType: grant.item_type,
        itemId: grant.item_id,
        recipientId: grant.recipient_id || null,
      }))
      .then(() => {
        state.revokeBusy = false;
        // Copy đối chiếu note thật của backend: chặn đọc mới, không thu hồi
        // được bản sao ngoài ứng dụng. Tải lại danh sách để thấy trạng thái mới.
        note.textContent =
          "Đã thu hồi. Lần đọc mới sẽ bị chặn; bản sao ngoài ứng dụng không thu hồi được.";
        reload();
      })
      .catch((error) => {
        state.revokeBusy = false;
        if (error && error.status === 401) {
          ctx.navigate("/login?reason=expired");
          return;
        }
        if (error && (error.kind === "timeout" || error.kind === "network")) {
          // Kết quả mutation CHƯA XÁC ĐỊNH (máy chủ có thể đã nhận): KHÔNG tự
          // gửi lại POST — đọc lại ĐÚNG MỘT lần để đối chiếu trạng thái thật
          // (port K7 từ page-core F15).
          state.reconcileNote =
            "Kết quả thu hồi CHƯA XÁC ĐỊNH (lỗi mạng/quá thời gian chờ). "
            + "Đã đọc lại trạng thái từ máy chủ đúng MỘT lần bên dưới; "
            + "ứng dụng không tự gửi lại yêu cầu thu hồi.";
          reload();
          return;
        }
        note.appendChild(h("span", { class: "fb-field__error", role: "alert" },
          "Không thu hồi được. Thử lại.",
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

function renderDeletionCard(ctx, state, reload, openDialogs, deletionPage) {
  const wrap = h("div", {});
  const statusBox = h("div", { role: "status", "aria-live": "polite" });
  const note = h("p", { class: "fb-page__note", role: "status", "aria-live": "polite" });
  // Danh sách yêu cầu xóa ĐÃ GỬI, đọc từ máy chủ lúc mở trang (P2-2/QA-3):
  // trước đây trạng thái chỉ sống trong bộ nhớ phiên — reload là mất đường UI
  // để xem lại. null = chưa tải được (lỗi thật); [] = máy chủ xác nhận rỗng.
  // has_more=true = máy chủ cắt theo trang → nói thật, không giả vờ đủ.
  const deletionRequests = deletionPage && Array.isArray(deletionPage.results)
    ? deletionPage.results : null;
  const deletionHasMore = Boolean(deletionPage && deletionPage.has_more);
  const listBox = h("div", {});
  const checkboxes = new Map();

  wrap.appendChild(
    h("p", { class: "fb-field__hint" },
      "Chọn phạm vi bạn muốn xóa. Yêu cầu sẽ được xác minh trước khi xử lý; "
      + "trạng thái luôn phản ánh thật — chưa xong sẽ ghi rõ. Yêu cầu xóa không "
      + "đồng nghĩa dữ liệu biến mất ngay lập tức.",
    ),
  );

  // Checklist phạm vi theo allowlist backend (DeletionRequest.CATEGORIES).
  const catList = h("div", { class: "fbc-cat-list" });
  DELETION_CATEGORIES.forEach(({ key, label }) => {
    const id = `fb-privacy-cat-${key}`;
    const checkbox = h("input", {
      type: "checkbox", id, value: key,
    });
    checkboxes.set(key, checkbox);
    catList.appendChild(
      h("label", { class: "fbc-cat", for: id },
        checkbox,
        h("span", {}, label),
      ),
    );
  });
  wrap.appendChild(catList);

  const submit = createButton({
    label: "Gửi yêu cầu xóa dữ liệu",
    variant: "danger",
    onClick: () => onRequest(),
  });
  wrap.appendChild(submit);
  wrap.appendChild(statusBox);
  wrap.appendChild(note);
  wrap.appendChild(listBox);
  drawRequests();

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

  // Đọc lại MỘT hàng trong danh sách (ví dụ sau 409 khi hủy từ danh sách):
  // cập nhật đúng hàng đó theo dữ liệu máy chủ trả về, không bịa trạng thái.
  function refreshListItem(requestId) {
    Promise.resolve()
      .then(() => ctx.adapter.getDeletionRequest(requestId))
      .then((detail) => {
        if (!detail) return;
        const item = deletionRequests
          && deletionRequests.find((row) => row && row.request_id === requestId);
        if (!item) return;
        item.status = detail.status;
        item.revision = typeof detail.revision === "number" ? detail.revision : item.revision;
        drawRequests();
      })
      .catch(() => { /* không đọc được → giữ dữ liệu đã có, không bịa */ });
  }

  function drawRequests() {
    clear(listBox);
    listBox.appendChild(
      h("p", { class: "fb-sec__sub" },
        "Các yêu cầu đã gửi (đọc từ máy chủ lúc tải trang):",
      ),
    );
    if (deletionRequests === null) {
      // Lỗi thật khi tải danh sách → báo thật, không bịa thành “không có”.
      listBox.appendChild(
        h("p", { class: "fb-field__hint" },
          "Chưa tải được danh sách yêu cầu xóa từ máy chủ. "
          + "Tải lại trang để xem trạng thái thật.",
        ),
      );
      return;
    }
    if (!deletionRequests.length) {
      listBox.appendChild(
        h("p", { class: "fb-field__hint" },
          "Chưa có yêu cầu xóa nào được ghi nhận trên máy chủ.",
        ),
      );
      return;
    }
    deletionRequests.forEach((request) => {
      if (request && request.request_id) listBox.appendChild(requestRow(request));
    });
    if (deletionHasMore) {
      // Máy chủ trả theo trang (mặc định 20 — NOTE-4/QA-3) — cắt thì nói
      // thật, không giả vờ đây là toàn bộ yêu cầu của người dùng.
      listBox.appendChild(
        h("p", { class: "fb-field__hint" },
          "Đang hiển thị các yêu cầu gần nhất; vẫn còn yêu cầu cũ hơn "
          + "được lưu trên máy chủ.",
        ),
      );
    }
  }

  function requestRow(request) {
    const row = h("div", {
      class: "fb-field",
      dataset: { requestId: request.request_id },
    });
    row.appendChild(
      h("p", {},
        h("strong", {}, "Yêu cầu xóa dữ liệu"),
        ` — ${deletionStatusLabel(request.status)}`,
      ),
    );
    const scope = Array.isArray(request.scope_categories) ? request.scope_categories : [];
    if (scope.length) {
      row.appendChild(
        h("p", { class: "fb-sec__sub" },
          `Phạm vi: ${scope.map((key) => {
            const found = DELETION_CATEGORIES.find((c) => c.key === key);
            return found ? found.label : key;
          }).join(", ")}`,
        ),
      );
    }
    const when = timeLabel(request.requested_at);
    if (when) row.appendChild(h("p", { class: "fb-sec__sub" }, `Tiếp nhận lúc: ${when}`));
    if (request.status === "requested") {
      row.appendChild(createButton({
        label: "Hủy yêu cầu xóa",
        variant: "ghost",
        ariaLabel: "Hủy yêu cầu xóa dữ liệu này",
        onClick: () => openCancelDialog(
          () => onCancel(request.request_id, request.revision, request),
        ),
      }));
    } else if (request.status
      && request.status !== "cancelled"
      && request.status !== "completed") {
      row.appendChild(
        h("p", { class: "fb-sec__sub" },
          "Yêu cầu đã vào xử lý nên không thể hủy — trạng thái sẽ phản ánh tiến trình thật.",
        ),
      );
    }
    return row;
  }

  // Hộp thoại xác nhận hủy dùng CHUNG cho cả trạng thái trong phiên lẫn từng
  // hàng trong danh sách — một copy, một hậu quả thật.
  function openCancelDialog(onConfirm) {
    const dialog = createDialog({
      title: "Hủy yêu cầu xóa dữ liệu?",
      message:
        "Bạn chỉ hủy được khi yêu cầu còn ở trạng thái chờ xác minh. "
        + "Sau khi xử lý bắt đầu, không thể hủy.",
      actions: [
        { label: "Giữ yêu cầu", variant: "ghost", onClick: () => {} },
        { label: "Hủy yêu cầu", variant: "danger", onClick: onConfirm },
      ],
    });
    openDialogs.add(dialog);
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
        onClick: () => openCancelDialog(() => onCancel()),
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
        if (deletionRequests && state.deletionRequestId) {
          // Đưa yêu cầu VỪA được máy chủ ghi nhận vào danh sách (đúng thứ tự
          // mới-nhất-trước của list_requests). requested_at/revision chưa có
          // trên response tạo → để trống thật; tải lại trang sẽ có đủ từ máy
          // chủ. Trùng request_id (duplicate) thì không thêm lại.
          const alreadyListed = deletionRequests.some(
            (row) => row && row.request_id === state.deletionRequestId,
          );
          if (!alreadyListed) {
            deletionRequests.unshift({
              request_id: state.deletionRequestId,
              status: state.deletionStatus,
              scope_categories: categories.slice(),
              requested_at: null,
              revision: null,
            });
          }
          drawRequests();
        }
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

  function onCancel(
    requestId = state.deletionRequestId,
    revision = state.deletionRevision,
    listItem = null,
  ) {
    if (!requestId) return;
    clear(note);
    note.textContent = "Đang hủy yêu cầu…";
    Promise.resolve()
      .then(() => ctx.adapter.cancelDeletionRequest(requestId, { expectedRevision: revision }))
      .then((result) => {
        const newStatus = (result && result.status) || "cancelled";
        // Cập nhật trạng thái MỚI THEO MÁY CHỦ ở mọi nơi đang hiển thị cùng
        // yêu cầu (hàng trong danh sách + panel trong phiên) — không để lệch
        // nhau (ví dụ duplicate: panel và danh sách cùng là một request_id).
        if (listItem) listItem.status = newStatus;
        const listed = deletionRequests
          && deletionRequests.find((row) => row && row.request_id === requestId);
        if (listed) listed.status = newStatus;
        if (listItem || listed) drawRequests();
        if (requestId === state.deletionRequestId) {
          state.deletionStatus = newStatus;
          drawStatus();
        }
        clear(note);
        note.textContent = "Yêu cầu đã hủy. Dữ liệu của bạn không bị xóa bởi yêu cầu này.";
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
          if (listItem
            || (deletionRequests
              && deletionRequests.some((row) => row && row.request_id === requestId))) {
            refreshListItem(requestId);
          }
          if (requestId === state.deletionRequestId) fetchStatus(requestId);
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
    const row = h("div", { class: "fbc-share-row" });
    row.appendChild(
      h("p", { class: "fbc-share-row__status" },
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
