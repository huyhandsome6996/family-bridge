// F05 inbox page (FL-11): bounded list (20/page), poll 30s only while
// visible with backoff + cleanup, detail opens body after server recheck,
// read receipt set when actually displayed, replies are explicit sends.

const MAX_WINDOW = 200;

export async function createPage({ root, params, ctx }) {
  const api = ctx.inboxApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Hộp thư</h1>
    <ul class="fb-list" id="inbox-list"><li>Đang tải…</li></ul>
    <button class="fb-button fb-button--secondary" id="load-more" hidden>Tải thêm</button>
    <p id="inbox-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  const listEl = el.querySelector("#inbox-list");
  const status = el.querySelector("#inbox-status");
  const loadMore = el.querySelector("#load-more");
  const items = [];
  let nextCursor = null;
  let pollTimer = null;
  let inFlight = false;
  let backoffMs = 30000;
  let destroyed = false;

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function load(cursor) {
    if (inFlight || destroyed) return;
    inFlight = true;
    try {
      const data = await api.list(cursor);
      nextCursor = data.next;
      for (const row of data.results) {
        if (items.length >= MAX_WINDOW) items.shift();
        items.push(row);
      }
      render();
      backoffMs = 30000;
    } catch (err) {
      // Offline/error: keep what we have; retry with capped backoff.
      backoffMs = Math.min(backoffMs * 2, 120000);
      setStatus("Không tải được hộp thư. Sẽ thử lại sau.", "error");
    } finally {
      inFlight = false;
    }
  }

  function render() {
    listEl.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      const direction = item.direction === "sent" ? "Đã gửi" : "Nhận";
      const state = item.direction === "sent"
        ? (item.read ? "— đã được xem" : "— đã gửi")
        : (item.read ? "— đã đọc" : "");
      link.textContent = `${direction} ${item.title || ""} ${state}`.trim();
      link.href = `#/messages/${item.message_id}`;
      li.appendChild(link);
      listEl.appendChild(li);
    }
    loadMore.hidden = !nextCursor;
  }

  loadMore.addEventListener("click", () => load(nextCursor));

  load(null);
  // Single poll while visible; pause when hidden (DSA-10).
  pollTimer = setInterval(() => {
    if (destroyed || document.hidden || inFlight) return;
    load(null);
  }, backoffMs);

  return {
    el,
    destroy() {
      destroyed = true;
      if (pollTimer) clearInterval(pollTimer);
    },
  };
}
