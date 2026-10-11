// B16 admin console page: tabs appear ONLY for capabilities the server
// confirms; safety-invariant settings render read-only; everything is
// server-enforced regardless of what the UI shows.

export async function createPage({ root, params, ctx }) {
  const api = ctx.adminApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Quản trị</h1>
    <p id="ad-cap" class="fb-status">Đang kiểm tra quyền…</p>
    <div id="ad-tabs" class="fb-chips" role="tablist"></div>
    <section id="ad-panel" hidden></section>
    <p id="ad-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#ad-status");
  const tabs = el.querySelector("#ad-tabs");
  const panel = el.querySelector("#ad-panel");

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function addTab(label, handler) {
    const chip = document.createElement("button");
    chip.className = "fb-chip";
    chip.textContent = label;
    chip.setAttribute("role", "tab");
    chip.addEventListener("click", handler);
    tabs.appendChild(chip);
  }

  function showPanel(title, build) {
    panel.hidden = false;
    panel.textContent = "";
    const heading = document.createElement("h2");
    heading.textContent = title;
    panel.appendChild(heading);
    build(panel);
  }

  function renderContentPanel() {
    showPanel("Nội dung", async (box) => {
      const list = document.createElement("ul");
      list.className = "fb-list";
      box.appendChild(list);
      try {
        const data = await api.listContent();
        for (const row of data.results || []) {
          const li = document.createElement("li");
          li.textContent =
            `${row.title} — ${row.status} (bản ${row.revision})`;
          if (row.status === "draft") {
            const publish = document.createElement("button");
            publish.className = "fb-button fb-button--secondary";
            publish.textContent = "Xuất bản";
            publish.addEventListener("click", async () => {
              try {
                await api.publish(row.content_id, row.revision);
                setStatus("Đã xuất bản (bản phát hành bất biến).", "success");
                renderContentPanel();
              } catch (err) {
                setStatus("Xuất bản chưa thành công.", "error");
              }
            });
            li.appendChild(publish);
          }
          if (row.status === "published") {
            const retire = document.createElement("button");
            retire.className = "fb-button fb-button--secondary";
            retire.textContent = "Ngừng dùng";
            retire.addEventListener("click", async () => {
              try {
                await api.retire(row.content_id, row.revision,
                  "Ngừng theo quyết định quản trị");
                setStatus("Đã ngừng dùng.", "success");
                renderContentPanel();
              } catch (err) {
                setStatus("Ngừng dùng chưa thành công.", "error");
              }
            });
            li.appendChild(retire);
          }
          list.appendChild(li);
        }
      } catch (err) {
        setStatus("Không tải được nội dung.", "error");
      }
    });
  }

  function renderSettingsPanel() {
    showPanel("Cấu hình", async (box) => {
      const list = document.createElement("ul");
      list.className = "fb-list";
      box.appendChild(list);
      try {
        const data = await api.settings();
        for (const row of data.results || []) {
          const li = document.createElement("li");
          li.textContent = `${row.key} = ${JSON.stringify(row.value)}` +
            (row.immutable ? " (bất biến — đọc thôi)" : "");
          list.appendChild(li);
        }
      } catch (err) {
        setStatus("Không tải được cấu hình.", "error");
      }
    });
  }

  function renderAuditPanel() {
    showPanel("Nhật ký quản trị", async (box) => {
      const list = document.createElement("ul");
      list.className = "fb-list";
      box.appendChild(list);
      try {
        const data = await api.audit();
        for (const row of data.results || []) {
          const li = document.createElement("li");
          li.textContent =
            `${row.created_at.slice(0, 16)} — ${row.action} — ${row.outcome}`;
          list.appendChild(li);
        }
      } catch (err) {
        setStatus("Không tải được nhật ký.", "error");
      }
    });
  }

  try {
    const caps = await api.myCaps();
    const names = new Set((caps.results || [])
      .filter((row) => !row.revoked).map((row) => row.capability));
    if (!names.size) {
      el.querySelector("#ad-cap").textContent =
        "Tài khoản này không có quyền quản trị.";
      return { destroy() { el.remove(); } };
    }
    el.querySelector("#ad-cap").textContent =
      `Quyền: ${[...names].join(", ")}`;
    if (names.has("content.manage")) {
      addTab("Nội dung", renderContentPanel);
    }
    if (names.has("settings.manage")) {
      addTab("Cấu hình", renderSettingsPanel);
    }
    if (names.has("audit.read")) {
      addTab("Nhật ký", renderAuditPanel);
    }
    if (!tabs.children.length) {
      setStatus("Không có khu quản trị nào khả dụng cho quyền của bạn.",
        "info");
    }
  } catch (err) {
    // 404 = no admin surface for this account (server-side decision)
    el.querySelector("#ad-cap").textContent =
      "Tài khoản này không có quyền quản trị.";
  }

  return {
    destroy() { el.remove(); },
  };
}
