// F01 onboarding/welcome page (FL-01).
// Shows privacy intro, requires explicit per-purpose consent, offers the
// always-available help link (WF-07: help is never gated by consent/AI/pause).

const CONSENT_ITEMS = [
  { purpose: "service", label: "Điều khoản sử dụng Family Bridge", required: true },
  { purpose: "ai_processing", label: "Dùng AI gợi ý diễn đạt (tùy chọn, không bắt buộc)", required: false },
  { purpose: "research", label: "Tham gia nghiên cứu (tùy chọn, có thể rút bất cứ lúc nào)", required: false },
];

export async function createPage({ root, params, ctx }) {
  const { api, sessionStore, sdk, helpHref } = ctx;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Chào mừng đến Family Bridge</h1>
    <p>Ứng dụng giúp con và phụ huynh mở lời, lắng nghe và kết nối — riêng tư
       mặc định, mọi chia sẻ đều do bạn chọn từng nội dung.</p>
    <section class="fb-card" aria-labelledby="consent-title">
      <h2 id="consent-title">Quyền riêng tư của bạn</h2>
      <p>Nhật ký, tâm trạng và bản thảo của bạn là riêng tư. Không ai được đọc
         nếu bạn chưa chia sẻ, kể cả người thân hay quản trị.</p>
      <ul id="consent-list"></ul>
    </section>
    <p><a href="${helpHref || "#/help"}">Tìm trợ giúp ngay (luôn mở)</a></p>
    <button class="fb-button fb-button--primary" id="continue-btn" disabled>
      Tiếp tục
    </button>
    <p id="fb-onboarding-status" class="fb-status" role="status" aria-live="polite"></p>
  `;

  const list = el.querySelector("#consent-list");
  const continueBtn = el.querySelector("#continue-btn");
  const statusEl = el.querySelector("#fb-onboarding-status");
  const decisions = new Map();

  for (const item of CONSENT_ITEMS) {
    const li = document.createElement("li");
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", item.label);
    checkbox.addEventListener("change", () => {
      decisions.set(item.purpose, checkbox.checked);
      // Never preselect; required item must be accepted to continue, but
      // help and app tools that don't need it stay available.
      continueBtn.disabled = item.required && !checkbox.checked;
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" " + item.label));
    li.appendChild(label);
    list.appendChild(li);
  }

  async function finish() {
    continueBtn.disabled = true;
    statusEl.className = "fb-status fb-status--info";
    statusEl.textContent = "Đang lưu lựa chọn…";
    try {
      for (const [purpose, accepted] of decisions.entries()) {
        if (purpose === "service" || accepted || purpose === "research") {
          await ctx.api.recordConsent(purpose, ctx.policyVersion || "service-v1",
            accepted ? "accepted" : "declined");
        }
      }
      statusEl.className = "fb-status fb-status--success";
      statusEl.textContent = "Đã lưu lựa chọn của bạn.";
    } catch (err) {
      continueBtn.disabled = false;
      statusEl.className = "fb-status fb-status--error";
      statusEl.textContent = "Không lưu được. Bạn vẫn xem được nội dung công khai và trợ giúp.";
    }
  }
  continueBtn.addEventListener("click", finish);

  return { el, destroy() { /* listeners live inside el; GC with el */ } };
}
