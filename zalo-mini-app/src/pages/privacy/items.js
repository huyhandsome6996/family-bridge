// Thin F15 entry to existing F08 owner/share APIs. No new permissions,
// default sharing, synthetic accounts or client-selected actor identifiers.
import { h } from "../../app/dom.js";
import { createButton, createCard, createTopBar } from "../../components/index.js";
import { createAppApi } from "./api.mjs";
let cancelCurrent = () => {};
export const page = {
  id: "f15-items", title: "Chia sẻ từng mục", requiresRole: true, showBottomNav: false,
  render(ctx) {
    let cancelled = false, busy = false;
    cancelCurrent = () => { cancelled = true; };
    const api = ctx.privacyApi || createAppApi();
    const root = h("div", { class: "fb-page", dataset: { page: "f15-items" } });
    root.appendChild(createTopBar({ title: "Chia sẻ từng mục", showBack: true, onBack: () => ctx.navigate("/privacy") }));
    const body = h("div", { class: "fb-page__body" }); root.appendChild(body);
    const notice = h("p", { role: "status", "aria-live": "polite" });
    body.appendChild(h("p", {}, "Ghi chép mới là riêng tư. Bạn chọn đúng một trang, xem nội dung và chọn người nhận trước khi chia sẻ. Kết nối không mở toàn bộ nhật ký."));
    body.appendChild(notice);
    const own = h("div"), received = h("div");
    const content = h("textarea", { id: "fb-private-note", class: "fb-textarea", maxlength: 4000, rows: 5, "aria-label": "Ghi chép riêng của bạn" });
    const save = createButton({ label: "Lưu ghi chép riêng", variant: "primary", onClick: () => write(async () => {
      const text = content.value.trim(); if (!text) throw new Error("Hãy nhập nội dung trước khi lưu.");
      await api.post("/api/v1/journal/pages", { body: { content: text, title: "", topic_code: "" } });
      if (cancelled) return;
      content.value = ""; notice.textContent = "Đã lưu riêng. Chưa chia sẻ cho ai.";
      await load();
    }) });
    body.appendChild(createCard({ title: "Ghi chép riêng", children: h("div", { class: "fb-item-editor" },
      h("label", { for: "fb-private-note", class: "fb-field__label" }, "Điều bạn muốn ghi lại"),
      content, h("p", { class: "fb-field__hint" }, "Chỉ mình bạn · tối đa 4.000 ký tự"), save) }));
    body.appendChild(createButton({ label: "Tải lại các mục", variant: "ghost", onClick: () => load() }));
    body.appendChild(createCard({ title: "Các trang của tôi", children: own }));
    body.appendChild(createCard({ title: "Được chia sẻ với tôi", children: received }));
    body.appendChild(createButton({ label: "Thu hồi, hủy kết nối & yêu cầu xoá", variant: "ghost", onClick: () => ctx.navigate("/privacy") }));
    body.appendChild(createButton({ label: "Tìm trợ giúp", variant: "ghost", onClick: () => ctx.navigate("/help") }));
    function showError(error, mutation = false) {
      if (cancelled) return;
      own.replaceChildren(); received.replaceChildren();
      notice.textContent = mutation && ["timeout", "network", "stale_session"].includes(error.kind)
        ? "Chưa xác định kết quả. Tải lại để kiểm tra trước khi thử lại; ứng dụng không tự gửi lại."
        : error.status === 401 ? "Phiên hết hạn. Hãy đăng nhập lại."
        : error.status === 404 ? "Mục hoặc quyền chia sẻ không còn hiệu lực."
        : error.status === 409 ? "Nội dung hoặc quyền đã thay đổi. Tải lại và kiểm tra trước khi chia sẻ."
        : error.message && !error.kind ? error.message : "Không tải hoặc lưu được. Bạn có thể thử tải lại.";
    }
    async function write(action) {
      if (busy || cancelled) return; busy = true; save.disabled = true;
      try { await action(); } catch (e) { showError(e, true); }
      finally { busy = false; if (!cancelled) save.disabled = false; }
    }
    let loadId = 0;
    async function load() {
      const current = ++loadId;
      try {
        const [pages, connections, shares] = await Promise.all([
          api.get("/api/v1/journal/pages?page_size=20"), api.get("/api/v1/connections?limit=20"), api.get("/api/v1/journal/shared")]);
        if (cancelled || current !== loadId) return;
        own.replaceChildren(); received.replaceChildren();
        for (const row of pages.results || []) {
          const selector = h("select", { class: "fb-input", "aria-label": "Chọn người nhận trang này" }, h("option", { value: "" }, "Chọn người nhận"));
          for (const connection of connections.results || []) selector.appendChild(h("option", { value: connection.other_party_id }, connection.counterpart?.display_name || "Người đồng hành (chưa đặt tên)"));
          const preview = h("p", { class: "fb-item-content" }, row.content);
          const share = createButton({ label: "Xem và xác nhận chia sẻ trang này", variant: "primary", onClick: () => write(async () => {
            const recipient = selector.value; if (!recipient) throw new Error("Hãy chọn người nhận cụ thể.");
            const fresh = await api.get(`/api/v1/journal/pages/${encodeURIComponent(row.page_id)}`);
            if (cancelled) return;
            if (fresh.revision !== row.revision) { await load(); throw new Error("Trang đã thay đổi. Đọc lại nội dung mới trước khi chia sẻ."); }
            const label = selector.selectedOptions[0]?.textContent || "người đã chọn";
            if (!window.confirm(`Chia sẻ riêng trang này với ${label} (tên tự khai báo)?\n\n${fresh.content}`)) return;
            await api.post(`/api/v1/journal/pages/${encodeURIComponent(row.page_id)}/share`, { body: { recipient_id: recipient, expected_revision: fresh.revision } });
            if (!cancelled) notice.textContent = "Đã chia sẻ đúng trang. Những trang khác vẫn riêng tư.";
          }) });
          own.appendChild(createCard({ title: row.title || "Trang riêng", children: h("div", { class: "fb-item-editor" }, preview, selector, share) }));
        }
        if (!(pages.results || []).length) own.appendChild(h("p", {}, "Chưa có trang riêng."));
        if (pages.next) own.appendChild(h("p", {}, "Đang hiển thị 20 trang gần nhất. Các trang khác vẫn được giữ."));
        for (const row of shares.results || []) received.appendChild(createButton({ label: "Mở trang được chia sẻ", variant: "ghost", onClick: async () => {
          try { const result = await api.get(`/api/v1/journal/shared/${encodeURIComponent(row.share_id)}`); if (!cancelled) received.replaceChildren(h("p", {}, result.content || result.page?.content || "Không có nội dung.")); }
          catch (e) { showError(e); }
        } }));
        if (!(shares.results || []).length) received.appendChild(h("p", {}, "Chưa có trang đang được chia sẻ với bạn."));
      } catch (e) { if (current === loadId) showError(e); }
    }
    load(); return root;
  },
  destroy() { cancelCurrent(); },
};
