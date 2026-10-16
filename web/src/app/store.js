// State của phiên làm việc — IN-MEMORY ONLY (web độc lập, ADR-3 + ADR-5).
// Port từ zalo-mini-app/src/app/store.js với KHÁC BIỆT CÓ CHỦ ĐÍCH: bỏ
// sessionStorage (mini lưu { role } vào sessionStorage "fb.ui.session.v1").
// Web: role persist trong RAM của tab — reload = mất role = về trạng thái
// chưa đăng nhập (SEC-10: không persist gì phía web origin).
//
// Quy tắc riêng tư (SEC-10, đề bài VII): KHÔNG lưu nhật ký/tâm trạng/AI vào
// bất kỳ storage nào. State ở đây chỉ chứa lựa chọn vai trò xem trước và
// cờ demo — không chứa dữ liệu riêng tư, không tạo auth session.
// API giữ nguyên mini: initStore / setRole / setMockScenario / getState /
// resetState (pages port không phải đổi gì).

const state = {
  /** 'student' | 'caregiver' | null — lựa chọn vai trò mức XEM TRƯỚC, không phải auth session. */
  role: null,
  /** Bật chỉ khi URL có ?demo=1 — không fallback tự động. */
  demoMode: false,
  /** Scenario mock cho màn kiểm tra kết nối: 'ok' | 'error' | 'timeout' | null. */
  mockScenario: null,
};

export function initStore({ demoMode = false } = {}) {
  state.role = null; // in-memory only: reload (mới import lại module) = reset
  state.demoMode = Boolean(demoMode);
  return getState();
}

export function setRole(role) {
  state.role = role === "student" || role === "caregiver" ? role : null;
  return getState();
}

export function setMockScenario(scenario) {
  state.mockScenario = ["ok", "error", "timeout", null].includes(scenario) ? scenario : null;
  return getState();
}

export function getState() {
  return { role: state.role, demoMode: state.demoMode, mockScenario: state.mockScenario };
}

/** Dọn state khi đổi vai trò/đăng xuất (FL-01: đổi actor dọn cache trước load). */
export function resetState() {
  state.role = null;
  state.mockScenario = null;
}
