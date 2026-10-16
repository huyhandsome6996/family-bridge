// Connection-check — chạy kiểm tra một lần khi mở màn: getBackendHealth()
// rồi getBackendReady() qua ctx.adapter (không import trực tiếp src/core).
// Trạng thái: loading -> success | unavailable | error. Demo mode
// (bật rõ ràng) cho phép chọn kịch bản ok/error/timeout qua ctx.rebuildAdapter;
// production KHÔNG có nút giả lập. destroy() huỷ mọi cập nhật đang chờ.
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
  createStatusBadge,
  createErrorState,
  createSkeleton,
  createTopBar,
} from "../../components/index.js";

const SCENARIOS = [
  { key: "ok", label: "Giả lập: thành công" },
  { key: "error", label: "Giả lập: lỗi" },
  { key: "timeout", label: "Giả lập: timeout" },
];

function readState(store) {
  if (store && typeof store.getState === "function") return store.getState();
  return store || {};
}

function errorKind(error) {
  // Fallback an toàn: lỗi không có `kind` (ApiError cũ, Error thường) là
  // "unknown" — rơi vào nhánh lỗi chung, KHÔNG BAO GIỜ nhánh timeout.
  return error && typeof error.kind === "string" ? error.kind : "unknown";
}

function messageOf(error, fallback) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/** Chọn nội dung ErrorState theo `kind` của lỗi — không suy loại từ status/message. */
function failureFor(error) {
  switch (errorKind(error)) {
    case "timeout":
      return {
        title: "Kết nối quá thời gian chờ",
        description: "Máy chủ không phản hồi trong thời gian cho phép. Vui lòng thử lại.",
      };
    case "configuration":
      // Màn kiểm tra kỹ thuật: được phép nêu tên biến cấu hình.
      return {
        title: "Chưa cấu hình địa chỉ máy chủ",
        description: messageOf(
          error,
          "Ứng dụng chưa biết địa chỉ máy chủ. Cần cấu hình địa chỉ backend khi build trước khi kiểm tra kết nối.",
        ),
      };
    case "network":
      return {
        title: "Chưa kết nối được máy chủ",
        description: messageOf(error, "Không tiếp cận được máy chủ. Kiểm tra mạng rồi thử lại."),
      };
    case "invalid_response":
      return {
        title: "Không kiểm tra được kết nối",
        description: messageOf(error, "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại sau."),
      };
    default:
      // "http", "unknown" (ApiError cũ không kind, Error thường) — lỗi chung.
      return {
        title: "Không kiểm tra được kết nối",
        description: messageOf(error, "Không thể hoàn tất yêu cầu. Vui lòng thử lại sau."),
      };
  }
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
      body.appendChild(createSkeleton({ variant: "card", count: 1 }));
      body.appendChild(h("p", { role: "status" }, "Đang kiểm tra kết nối với máy chủ…"));
    }

    function renderSuccess() {
      clear(body);
      body.appendChild(h("h2", { class: "fb-page__heading" }, "Kết quả kiểm tra"));
      body.appendChild(createStatusBadge({ tone: "success", label: "Đã kết nối tới máy chủ" }));
      body.appendChild(
        h("p", {}, "Máy chủ đang hoạt động bình thường. Bạn có thể quay lại và tiếp tục sử dụng."),
      );
      body.appendChild(
        createButton({
          label: "Về trang chủ",
          variant: "ghost",
          onClick: () => ctx.navigate(homePath),
        }),
      );
    }

    function renderFailure({ title, description }) {
      clear(body);
      body.appendChild(
        createErrorState({
          title,
          description,
          retryLabel: "Thử lại",
          onRetry: () => run(),
        }),
      );
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
          renderFailure(failureFor(error));
        });
    }

    // Bảng kịch bản demo — chỉ hiển thị khi demo mode bật rõ ràng.
    if (state.demoMode) {
      const demoPanel = h("div", { class: "fb-conncheck__demo" },
        h("p", { class: "fb-page__note" },
          "Bạn đang ở chế độ xem trước. Chọn kịch bản để thử các trạng thái của màn này:",
        ),
      );
      for (const scenario of SCENARIOS) {
        demoPanel.appendChild(
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
