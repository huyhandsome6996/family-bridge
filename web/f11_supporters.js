/**
 * ============================================================================
 * Family Bridge - Tính năng F11: Điểm tựa dự phòng (US-022 & US-035)
 * ============================================================================
 *
 * RÀNG BUỘC CỐT LÕI (BẮT BUỘC TUÂN THỦ):
 * 1. BẢO MẬT & CÔ LẬP DỮ LIỆU:
 *    - DTO gửi tin CHỈ chứa duy nhất trường `body` ({ body }).
 *    - Tuyệt đối không gửi kèm quoted_letter, journal_page, draft_id.
 *    - Form không có input đính kèm tệp/ảnh.
 * 2. LÀM SẠCH DOM (DOM CLEANSING):
 *    - Danh sách điểm tựa CHỈ render các hàng có `status === "active"` và `can_contact === true`.
 *    - Không render disabled/hidden placeholder cho pending/declined/revoked/expired.
 * 3. MINH BẠCH & KHÔNG TỰ ĐỘNG GỬI (TIMEOUT & DISCLAIMER):
 *    - Disclaimer tĩnh: "Người hỗ trợ đã đồng ý tiếp nhận, không cam kết trực 24 giờ hay hỗ trợ ngay mọi lúc."
 *    - Sau khi gửi tin: hiển thị gợi ý ("Chọn điểm tựa khác", "Mở F13").
 *    - Tuyệt đối KHÔNG có timer tự động gửi hoặc auto-forward.
 * 4. CÔ LẬP QA MOCK TOOLBAR:
 *    - Môi trường mặc định KHÔNG render toolbar và KHÔNG ghi đè window.fetch.
 *    - Chỉ kích hoạt khi URL chứa ?qa=1 hoặc ?demo=1.
 * ============================================================================
 */

export const RELATION_LABELS = {
  teacher: "Thầy cô",
  counselor: "Cán bộ tham vấn",
  family: "Người thân",
};

export const DEFAULT_BACKEND_BASE = "https://family-bridge-backend.onrender.com";

export function getSupportersApiBase() {
  if (typeof window !== "undefined" && window.__SUPPORTERS_API_BASE__) {
    return window.__SUPPORTERS_API_BASE__;
  }
  const base =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
    (typeof window !== "undefined" && window.__FB_API_BASE__) ||
    DEFAULT_BACKEND_BASE;
  return `${base.replace(/\/+$/, "")}/api/v1/supporters`;
}

export function getAuthHeaders() {
  const token =
    (typeof window !== "undefined" &&
      (window.__FB_SESSION_TOKEN__ ||
        (window.__FB_SESSION__ && window.__FB_SESSION__.token))) ||
    "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function showStatus(type, message) {
  const successEl = document.getElementById("status-alert-success");
  const errorEl = document.getElementById("status-alert-error");
  const successText = document.getElementById("status-success-text");
  const errorText = document.getElementById("status-error-text");

  if (successEl) successEl.style.display = "none";
  if (errorEl) errorEl.style.display = "none";

  if (type === "success" && successEl && successText) {
    successText.textContent = message;
    successEl.style.display = "flex";
  } else if (type === "error" && errorEl && errorText) {
    errorText.textContent = message;
    errorEl.style.display = "flex";
  }
}

function clearStatus() {
  const successEl = document.getElementById("status-alert-success");
  const errorEl = document.getElementById("status-alert-error");
  if (successEl) successEl.style.display = "none";
  if (errorEl) errorEl.style.display = "none";
}

let activeContactRoleId = null;
let activeContactRoleName = "";

export async function loadSupporters() {
  const listEl = document.getElementById("sup-list");
  const noSupporterEl = document.getElementById("sup-no-supporter");
  if (!listEl) return;

  clearStatus();
  listEl.innerHTML = '<div class="empty-state">Đang tải danh sách điểm tựa...</div>';

  try {
    const res = await fetch(`${getSupportersApiBase()}/roles`, {
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    });

    if (!res.ok) {
      throw new Error(`Mã lỗi máy chủ: ${res.status}`);
    }

    const data = await res.json();
    const rows = Array.isArray(data) ? data : (data.results || []);

    // Filter chỉ active và can_contact
    const activeRows = rows.filter((r) => r.status === "active" && r.can_contact);

    listEl.innerHTML = "";
    if (activeRows.length === 0) {
      if (noSupporterEl) noSupporterEl.style.display = "block";
      return;
    }

    if (noSupporterEl) noSupporterEl.style.display = "none";

    activeRows.forEach((role) => {
      const card = document.createElement("div");
      card.className = "supporter-card";
      card.dataset.roleId = role.role_id || role.id;

      const name = role.supporter_name || role.name || "Người đồng hành";
      const relation = RELATION_LABELS[role.relationship_kind] || role.relationship_kind;

      card.innerHTML = `
        <div class="supporter-card__header">
          <span class="supporter-card__name">${name}</span>
          <span class="supporter-card__role">${relation}</span>
        </div>
        <div class="supporter-card__actions">
          <button type="button" class="btn-primary btn-contact" style="font-size:12.5px; padding:6px 14px;">
            Nhắn điểm tựa này
          </button>
          <button type="button" class="btn-danger-outline btn-revoke">
            Dừng đồng hành
          </button>
        </div>
      `;

      card.querySelector(".btn-contact").addEventListener("click", () => {
        openContactSection(role.role_id || role.id, name);
      });

      card.querySelector(".btn-revoke").addEventListener("click", () => {
        revokeSupporter(role.role_id || role.id);
      });

      listEl.appendChild(card);
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty-state" style="color:var(--fb-error);">Không thể tải danh sách điểm tựa. Vui lòng thử lại.</div>';
    showStatus("error", `Lỗi tải điểm tựa: ${err.message}`);
  }
}

export function openContactSection(roleId, name) {
  activeContactRoleId = roleId;
  activeContactRoleName = name;

  const section = document.getElementById("sup-contact-section");
  const targetLabel = document.getElementById("sup-contact-target");
  const bodyTextarea = document.getElementById("sup-body");

  if (targetLabel) targetLabel.textContent = `Người nhận: ${name}`;
  if (bodyTextarea) {
    bodyTextarea.value = "";
    bodyTextarea.focus();
  }
  if (section) section.style.display = "flex";

  const suggestSection = document.getElementById("sup-suggest-section");
  if (suggestSection) suggestSection.style.display = "none";

  clearStatus();
}

export function closeContactSection() {
  activeContactRoleId = null;
  const section = document.getElementById("sup-contact-section");
  if (section) section.style.display = "none";
}

export async function sendContactMessage() {
  const bodyTextarea = document.getElementById("sup-body");
  const text = (bodyTextarea?.value || "").trim();

  if (!text) {
    showStatus("error", "Vui lòng nhập nội dung lời nhắn.");
    return;
  }

  if (text.length > 4000) {
    showStatus("error", "Lời nhắn vượt quá giới hạn 4.000 ký tự.");
    return;
  }

  if (!activeContactRoleId) {
    showStatus("error", "Chưa chọn người nhận.");
    return;
  }

  clearStatus();
  const sendBtn = document.getElementById("sup-contact-send");
  if (sendBtn) sendBtn.disabled = true;

  try {
    // DTO tối thiểu: CHỈ chứa body
    const payload = { body: text };
    const idempotencyKey =
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `web-sup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const res = await fetch(`${getSupportersApiBase()}/roles/${activeContactRoleId}/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Mã lỗi máy chủ: ${res.status}`);
    }

    showStatus("success", "Gửi lời nhắn thành công. Điểm tựa sẽ xem khi có thể.");
    closeContactSection();

    // Hiển thị phần gợi ý sau khi gửi
    const suggestSection = document.getElementById("sup-suggest-section");
    if (suggestSection) suggestSection.style.display = "flex";
  } catch (err) {
    showStatus("error", `Không thể gửi lời nhắn: ${err.message}`);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

export async function revokeSupporter(roleId) {
  if (!confirm("Bạn có chắc chắn muốn dừng vai trò điểm tựa này?")) return;

  try {
    const res = await fetch(`${getSupportersApiBase()}/roles/${roleId}/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    });

    if (!res.ok) {
      throw new Error(`Mã lỗi máy chủ: ${res.status}`);
    }

    showStatus("success", "Đã dừng vai trò điểm tựa thành công.");
    loadSupporters();
  } catch (err) {
    showStatus("error", `Lỗi dừng vai trò: ${err.message}`);
  }
}

export function initSupportersPage() {
  // Nút gửi lời nhắn
  const sendBtn = document.getElementById("sup-contact-send");
  if (sendBtn) sendBtn.addEventListener("click", sendContactMessage);

  // Nút hủy nhắn
  const cancelBtn = document.getElementById("sup-contact-cancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeContactSection);

  // Nút toggle mời
  const toggleInviteBtn = document.getElementById("btn-toggle-invite");
  const inviteSection = document.getElementById("sup-invite-section");
  if (toggleInviteBtn && inviteSection) {
    toggleInviteBtn.addEventListener("click", () => {
      inviteSection.style.display = inviteSection.style.display === "none" ? "flex" : "none";
    });
  }

  const cancelInviteBtn = document.getElementById("sup-invite-cancel");
  if (cancelInviteBtn && inviteSection) {
    cancelInviteBtn.addEventListener("click", () => {
      inviteSection.style.display = "none";
    });
  }

  // Nút gợi ý "Chọn điểm tựa khác"
  const suggestAnotherBtn = document.getElementById("sup-suggest-another");
  if (suggestAnotherBtn) {
    suggestAnotherBtn.addEventListener("click", () => {
      const suggestSection = document.getElementById("sup-suggest-section");
      if (suggestSection) suggestSection.style.display = "none";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Tải danh sách điểm tựa
  loadSupporters();

  // Khởi tạo QA toolbar nếu có cờ ?qa=1 hoặc ?demo=1
  initQaToolbar();
}

/**
 * Khởi tạo QA Mock Toolbar (chỉ khi có tham số ?qa=1 hoặc ?demo=1).
 */
export function initQaToolbar() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const isQa = params.get("qa") === "1" || params.get("demo") === "1";
  if (!isQa) return;

  const container = document.getElementById("qa-f11-toolbar-container");
  if (!container) return;

  const toolbar = document.createElement("div");
  toolbar.id = "qa-f11-toolbar";
  toolbar.innerHTML = `
    <strong>[QA / Demo Toolbar F11]</strong>
    <button type="button" id="qa-btn-mock-active">Mock 2 Điểm tựa Active</button>
    <button type="button" id="qa-btn-mock-empty">Mock Danh sách Rỗng</button>
    <button type="button" id="qa-btn-mock-expired">Mock Hết hạn (DOM cleansing)</button>
  `;
  container.appendChild(toolbar);

  // Dữ liệu mock
  const mockRoles = [
    {
      role_id: "role-001",
      supporter_name: "Cô Mai (Tư vấn học đường)",
      relationship_kind: "teacher",
      status: "active",
      can_contact: true,
    },
    {
      role_id: "role-002",
      supporter_name: "Thầy Tuấn (Giáo viên chủ nhiệm)",
      relationship_kind: "teacher",
      status: "active",
      can_contact: true,
    },
  ];

  // Ghi đè fetch cho môi trường mock QA
  window.fetch = async (url, options = {}) => {
    const urlStr = String(url);

    if (urlStr.includes("/api/v1/supporters/roles") && (!options.method || options.method === "GET")) {
      return new Response(JSON.stringify(mockRoles), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.includes("/contact") && options.method === "POST") {
      const payload = JSON.parse(options.body || "{}");
      if (!payload.body) {
        return new Response(JSON.stringify({ error: "body_required" }), { status: 400 });
      }
      return new Response(JSON.stringify({ success: true, message_id: "msg-mock-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.includes("/revoke") && options.method === "POST") {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  };

  document.getElementById("qa-btn-mock-active")?.addEventListener("click", () => {
    mockRoles.length = 0;
    mockRoles.push(
      { role_id: "r1", supporter_name: "Cô Mai (Tư vấn)", relationship_kind: "teacher", status: "active", can_contact: true },
      { role_id: "r2", supporter_name: "Bác Nam (Người thân)", relationship_kind: "family", status: "active", can_contact: true }
    );
    loadSupporters();
  });

  document.getElementById("qa-btn-mock-empty")?.addEventListener("click", () => {
    mockRoles.length = 0;
    loadSupporters();
  });

  document.getElementById("qa-btn-mock-expired")?.addEventListener("click", () => {
    mockRoles.length = 0;
    mockRoles.push(
      { role_id: "r-exp", supporter_name: "Hết hạn", relationship_kind: "teacher", status: "expired", can_contact: false },
      { role_id: "r-rev", supporter_name: "Đã dừng", relationship_kind: "teacher", status: "revoked", can_contact: false }
    );
    loadSupporters();
  });

  loadSupporters();
}

if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", initSupportersPage);
}
