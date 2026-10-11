// Cấu hình runtime của Mini App. KHÔNG đặt secret vào VITE_* (SEC-19):
// mọi biến VITE_* đều được nhúng vào bundle công khai.
//
// Lưu ý khả dụng kiểm thử: dùng optional chaining trên import.meta.env để
// module import được cả trong node:test thuần (Vite thay giá trị khi build;
// ngoài Vite import.meta.env là undefined và các hàm trả giá trị an toàn).

// Base URL backend: build production đọc từ biến môi trường Vite.
// Không cấu hình -> trả về chuỗi rỗng; adapter phải báo lỗi cấu hình,
// tuyệt đối không tự chuyển sang mock (không fake-success).
export function getApiBaseUrl() {
  const raw = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";
  return raw.replace(/\/$/, "");
}

export const isProductionBuild = Boolean(import.meta.env && import.meta.env.PROD);

/**
 * Demo mode chỉ bật khi được yêu cầu RÕ RÀNG qua query `?demo=1`.
 * Không có bất kỳ cơ chế fallback tự động nào từ API/auth lỗi sang demo.
 * Chế độ demo luôn hiển thị nhãn "Dữ liệu minh họa" trên mọi màn hình.
 */
export function isDemoModeRequested() {
  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("demo");
    return flag === "1" || flag === "true";
  } catch {
    return false;
  }
}

/**
 * Phát hiện môi trường Zalo thật bằng quan sát bên ngoài (UA/hostname),
 * không dùng biến nội bộ của SDK (zmp-sdk 2.53.0 không export isMp).
 * Tham khảo: báo cáo nghiên cứu chính sách Task 2-a, mục 6.4.
 */
export function isZaloHost() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const inZaloApp = /zalo/i.test(ua);
  const inMpWeb = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname);
  return inZaloApp && !inMpWeb;
}
