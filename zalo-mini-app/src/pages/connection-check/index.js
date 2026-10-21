// Connection-check — chạy kiểm tra một lần khi mở màn: getBackendHealth()
// rồi getBackendReady() qua ctx.adapter (không import trực tiếp src/core).
// Trạng thái: loading -> success | unavailable | error. Demo mode
// (bật rõ ràng) cho phép chọn kịch bản ok/error/timeout qua ctx.rebuildAdapter;
// production KHÔNG có nút giả lập. destroy() huỷ mọi cập nhật đang chờ.
//
// Restyle Stitch M23: hero trạng thái một cột (loading/success/unavailable/
// lỗi), checklist tự kiểm tra mạng chung trung thực cho lỗi mạng/timeout —
// KHÔNG latency/TLS/mã HTTP/máy chủ bảo trì khi API không cung cấp nguồn.
//
// Phân loại lỗi: CHỈ đọc thuộc tính `kind` của ApiError (không suy loại từ
// status 0, không dò câu thông báo). Năm loại:
//   - "timeout"          -> "Kết nối quá thời gian chờ" (AbortError từ timer client).
//   - "configuration"    -> "Chưa cấu hình địa chỉ máy chủ" (thiếu/sai địa chỉ backend).
//   - "network"          -> "Chưa kết nối được máy chủ" (fetch ném lỗi mạng).
//   - "invalid_response" -> "Không kiểm tra được kết nối" (JSON trả về không hợp lệ).
//   - "http" / không kind -> "Không kiểm tra được kết nối" (fallback lỗi chung an toàn:
//     ApiError cũ hoặc Error thường KHÔNG BAO GIỜ bị coi là timeout).
import { h, clear } from "../../app/dom.js";
import {
  createButton,
  createIcon,
  createStatusBadge,
  createErrorState,
  createSkeleton,
  createTopBar,
} from "../../components/index.js";
// ADR-1 (task 18-a): errorKind/messageOf/failureFor chuyển về shared —
// mapping lỗi GIỐNG HỆT cho mini app và web (nguồn duy nhất).
import {
  errorKind,
  failureFor,
  messageOf,
} from "../../../../packages/family_bridge_shared/src/connection-check.js";

const SCENARIOS = [
  { key: "ok", label: "Giả lập: thành công" },
  { key: "error", label: "Giả lập: lỗi" },
  { key: "timeout", label: "Giả lập: timeout" },
];

// Checklist 3 bước (frame M23) — lời khuyên mạng CHUNG, không chẩn đoán sai:
// dùng cho mọi trạng thái lỗi để không dính cụm từ "quá thời gian" vào các
// trạng thái không phải timeout (assertion SC3/SC10).
const NETWORK_STEPS = [
  "Kiểm tra sóng Wi-Fi hoặc dữ liệu di động trên điện thoại của bạn.",
  "Thử mở một trang tin hoặc cửa sổ chat khác trong Zalo để xem mạng có ổn định.",
  "Khi đường truyền đã ổn định, bấm Thử lại bên dưới để kiểm tra lại kết nối.",
];

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

function renderSteps() {
  return h("div", { class: "fbc-steps" },
    h("p", { class: "fbc-steps__title" }, "3 bước tự kiểm tra nhanh"),
    NETWORK_STEPS.map((text, index) =>
      h("div", { class: "fbc-steps__row" },
        h("span", { class: "fbc-steps__n", "aria-hidden": "true" }, String(index + 1)),
        h("span", { class: "fbc-steps__text" }, text),
      )),
  );
}

export const page = {
  id: "connection-check",
  title: "Kiểm tra kết nối máy chủ",
  requiresRole: false,
  showBottomNav: false,

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const state = readState(ctx.store);
    const homePath = state.role ? "/home" : "/welcome";

    const root = h("div", { class: "fb-page", dataset: { page: "connection-check" } });
    root.appendChild(
      createTopBar({
        title: "Kiểm tra kết nối máy chủ",
        showBack: true,
        onBack: () => ctx.navigate(homePath),
      }),
    );

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    let cancelled = false;
    let runId = 0;
    cleanupFn = () => {
      cancelled = true;
      runId += 1;
    };

    function renderLoading() {
      clear(body);
      body.appendChild(
        h("div", { class: "fbc-status-hero" },
          h("span", { class: "fbc-status-hero__icon", "aria-hidden": "true" },
            createIcon({ name: "timer", size: 28 })),
          createSkeleton({ variant: "line", count: 1 }),
        ),
      );
      body.appendChild(h("p", { role: "status" }, "Đang kiểm tra kết nối với máy chủ…"));
    }

    function renderSuccess() {
      clear(body);
      body.appendChild(
        h("div", { class: "fbc-status-hero" },
          h("span", {
            class: "fbc-status-hero__icon fbc-status-hero__icon--success",
            "aria-hidden": "true",
          }, createIcon({ name: "check_circle", size: 28, fill: true })),
          createStatusBadge({ tone: "success", label: "Đã kết nối tới máy chủ" }),
          h("p", { class: "fbc-status-hero__desc" },
            "Máy chủ đang hoạt động bình thường. Bạn có thể quay lại và tiếp tục sử dụng."),
          h("div", { class: "fbc-status-hero__actions" },
            createButton({
              label: "Về trang chủ",
              variant: "primary",
              onClick: () => ctx.navigate(homePath),
            }),
            createButton({
              label: "Kiểm tra lại",
              variant: "ghost",
              onClick: () => run(),
            }),
          ),
        ),
      );
    }

    function renderFailure({ title, description, showSteps = false }) {
      clear(body);
      body.appendChild(
        createErrorState({
          title,
          description,
          retryLabel: "Thử lại",
          onRetry: () => run(),
        }),
      );
      // Checklist chỉ mang tính gợi ý mạng chung — không suy ra nguyên nhân
      // phía máy chủ (không latency/mã lỗi/bảo trì khi API không nói).
      if (showSteps) body.appendChild(renderSteps());
    }

    function run() {
      const current = ++runId;
      renderLoading();

      Promise.resolve()
        .then(() => ctx.adapter.getBackendHealth(15000))
        .then((health) => {
          if (cancelled || current !== runId) return null;
          if (health !== "ok") {
            return { kind: "error", error: new Error("Không xác định được trạng thái máy chủ. Vui lòng thử lại.") };
          }
          return Promise.resolve()
            .then(() => ctx.adapter.getBackendReady(15000))
            .then((ready) => {
              if (cancelled || current !== runId) return null;
              if (ready === "ok") return { kind: "success" };
              // 'unavailable' là trạng thái hợp lệ của ready (503) — máy chủ
              // chạy nhưng chưa sẵn sàng phục vụ, hiển thị trung thực.
              return { kind: "unavailable" };
            });
        })
        .then((result) => {
          if (!result || cancelled || current !== runId) return;
          if (result.kind === "success") {
            renderSuccess();
          } else if (result.kind === "unavailable") {
            renderFailure({
              title: "Máy chủ chưa sẵn sàng",
              description: "Máy chủ đang chạy nhưng chưa sẵn sàng phục vụ. Vui lòng thử lại sau ít phút.",
              showSteps: true,
            });
          } else {
            renderFailure({
              title: "Không kiểm tra được kết nối",
              description: messageOf(result.error, "Không thể hoàn tất yêu cầu. Vui lòng thử lại sau."),
            });
          }
        })
        .catch((error) => {
          if (cancelled || current !== runId) return;
          const failure = failureFor(error);
          // Checklist mạng chung cho lỗi MẠNG/TIMEOUT thật (kind từ ApiError —
          // không dò message; lỗi khác vẫn chỉ hiện trạng thái lỗi thuần).
          const kind = errorKind(error);
          renderFailure({ ...failure, showSteps: kind === "network" || kind === "timeout" });
        });
    }

    // Bảng kịch bản demo — chỉ hiển thị khi demo mode bật rõ ràng.
    if (state.demoMode) {
      const demoPanel = h("div", { class: "fbc-demo-strip" },
        h("p", { class: "fbc-demo-strip__title" }, "Chế độ xem trước"),
        h("p", { class: "fbc-demo-strip__note" },
          "Bạn đang ở chế độ dữ liệu minh họa. Chọn kịch bản để thử các trạng thái của màn này."),
        h("div", { class: "fbc-demo-strip__actions" }),
      );
      const actions = demoPanel.querySelector(".fbc-demo-strip__actions");
      for (const scenario of SCENARIOS) {
        actions.appendChild(
          createButton({
            label: scenario.label,
            variant: "ghost",
            onClick: () => {
              if (typeof ctx.rebuildAdapter === "function") {
                ctx.rebuildAdapter(scenario.key);
              }
              run();
            },
          }),
        );
      }
      root.appendChild(demoPanel);
    }

    // Trợ giúp luôn truy cập được (frame M23) — link tĩnh tới #/help.
    root.appendChild(
      h("section", { class: "fbc-help-pointer" },
        h("span", { class: "fbc-help-pointer__icon", "aria-hidden": "true" },
          createIcon({ name: "support_agent", size: 20 })),
        h("span", { class: "fbc-help-pointer__text" },
          h("span", { class: "fbc-help-pointer__title" }, "Gặp khó khăn khác?"),
          h("span", { class: "fbc-help-pointer__hint" },
            "Trang Tìm trợ giúp luôn mở, không cần đăng nhập."),
        ),
        h("a", { class: "fb-btn fb-btn--ghost", href: "#/help" }, "Tìm trợ giúp"),
      ),
    );

    run();
    return root;
  },
};

/** Router gọi page.destroy khi rời trang — huỷ timeout/pending cập nhật. */
let cleanupFn = null;
function destroy() {
  if (typeof cleanupFn === "function") cleanupFn();
  cleanupFn = null;
}
page.destroy = destroy;
