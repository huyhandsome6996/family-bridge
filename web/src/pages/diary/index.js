// F08 — Nhật ký riêng và nhật ký song hành (US-016 & US-031).
// Riêng tư mặc định (SEC-03/04): "Chỉ mình bạn"; không bao giờ chia sẻ toàn bộ.
// Chia sẻ từng trang theo phiên bản (expected_revision); sửa trang tạo phiên
// bản mới và tự ẩn bản chia sẻ cũ cho đến khi tác giả chủ động chia sẻ lại.
// Phản hồi song hành gắn với trang được chia sẻ; kiểm tra quyền trực tiếp ở mỗi lần đọc.
import { h, clear } from "../../app/dom.js";
import { hasLiveSession } from "../../core/session.js";
import {
  createButton,
  createDialog,
  createEmptyState,
  createErrorState,
  createDemoBanner,
  createSheet,
  createStatusBadge,
  createTextarea,
  createTopBar,
  createSkeleton,
} from "../../components/index.js";

let cleanupFn = null;

function formatTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    }).format(d);
  } catch {
    return String(iso);
  }
}

export const page = {
  id: "diary",
  title: "Nhật ký",
  requiresRole: true,
  requiresAuth: true,
  showBottomNav: true,
  chrome: "app",

  render(ctx) {
    if (typeof cleanupFn === "function") cleanupFn();

    const root = h("div", { class: "fb-page fb-page--web", dataset: { page: "diary" } });
    root.appendChild(createTopBar({ title: "Nhật ký" }));

    const body = h("div", { class: "fb-page__body" });
    root.appendChild(body);

    const openDialogs = new Set();
    const lc = {
      cancelled: false,
      generation: 0,
      register(handle) { openDialogs.add(handle); },
      unregister(handle) { openDialogs.delete(handle); },
    };

    cleanupFn = () => {
      lc.cancelled = true;
      lc.generation += 1;
      const dialogs = Array.from(openDialogs);
      openDialogs.clear();
      for (const d of dialogs) {
        try { d.close(); } catch { /* noop */ }
      }
    };

    const demo = Boolean(ctx.store.getState().demoMode);
    if (demo) {
      body.appendChild(createDemoBanner({ onExit: () => ctx.exitDemo && ctx.exitDemo() }));
    }

    if (!demo && !hasLiveSession()) {
      body.appendChild(
        createEmptyState({
          title: "Cần đăng nhập để mở nhật ký",
          description:
            "Nhật ký riêng và nhật ký song hành là nội dung cá nhân của bạn. Mỗi trang chỉ được chia sẻ với người đồng hành khi bạn chọn chia sẻ trang đó.",
          action: { label: "Đăng nhập", onClick: () => ctx.navigate("/login") },
        }),
      );
      return root;
    }

    const initialTab = ctx.params?.get("tab") === "shared" ? "shared" : "own";

    const state = {
      demo,
      activeTab: initialTab,
      editing: null,
      prompts: [],
      promptsLoaded: false,
      pages: [],
      nextCursor: null,
      searchQuery: "",
      pagesLoading: false,
      sharedPages: [],
      myReplies: [],
      _lc: lc,
    };

    renderMainLayout(body, ctx, state);
    return root;
  },

  destroy() {
    if (typeof cleanupFn === "function") {
      cleanupFn();
      cleanupFn = null;
    }
  },
};

function renderMainLayout(body, ctx, state) {
  clear(body);
  if (state.demo) {
    body.appendChild(createDemoBanner({ onExit: () => ctx.exitDemo && ctx.exitDemo() }));
  }

  // Header & Kicker
  const header = h("header", { class: "fb-sec" });
  header.appendChild(
    h("div", { class: "fb-sec__row" },
      h("span", { class: "fb-journey__kicker" }, "Không gian suy ngẫm cá nhân — Mặc định chỉ mình bạn"),
    ),
  );
  header.appendChild(h("h1", { class: "fb-sec__greeting" }, "Nhật ký riêng & Nhật ký song hành"));
  header.appendChild(
    h("p", { class: "fb-sec__sub" },
      "Bạn có thể viết tại đây hoặc viết vào sổ tay giấy của riêng mình — ứng dụng không bao giờ yêu cầu chụp hay tải trang viết tay lên.",
    ),
  );
  body.appendChild(header);

  // Tabs container
  const tablist = h("div", { class: "fb-card fb-card--row", role: "tablist", style: "display:flex;gap:8px;margin-bottom:16px;" });

  const tabOwn = h("button", {
    type: "button",
    role: "tab",
    class: `fb-btn ${state.activeTab === "own" ? "fb-btn--primary" : "fb-btn--ghost"}`,
    "aria-selected": state.activeTab === "own" ? "true" : "false",
    onclick: () => {
      if (state.activeTab === "own") return;
      state.activeTab = "own";
      renderMainLayout(body, ctx, state);
    },
  }, "Nhật ký riêng của mình");

  const tabShared = h("button", {
    type: "button",
    role: "tab",
    class: `fb-btn ${state.activeTab === "shared" ? "fb-btn--primary" : "fb-btn--ghost"}`,
    "aria-selected": state.activeTab === "shared" ? "true" : "false",
    onclick: () => {
      if (state.activeTab === "shared") return;
      state.activeTab = "shared";
      renderMainLayout(body, ctx, state);
    },
  }, "Được chia sẻ & Song hành");

  tablist.appendChild(tabOwn);
  tablist.appendChild(tabShared);
  body.appendChild(tablist);

  // Tab content container
  const tabContent = h("div", { class: "fb-diary-tab-content" });
  body.appendChild(tabContent);

  if (state.activeTab === "own") {
    renderOwnTab(tabContent, ctx, state);
  } else {
    renderSharedTab(tabContent, ctx, state);
  }
}

/* =========================================================================
   TAB 1: Nhật ký riêng của mình
   ========================================================================= */

function renderOwnTab(container, ctx, state) {
  clear(container);

  const editorSection = h("section", { class: "fb-scard fb-editor-section", style: "margin-bottom:20px;" });
  const listSection = h("section", { class: "fb-scard" });

  container.appendChild(editorSection);
  container.appendChild(listSection);

  const refreshList = () => loadOwnPages(listSection, ctx, state, { reset: true });
  const refreshEditor = () => renderEditor(editorSection, ctx, state, refreshList);

  state._refreshEditor = refreshEditor;

  refreshEditor();
  loadOwnPages(listSection, ctx, state, { reset: true });
}

function renderEditor(container, ctx, state, onSaved) {
  clear(container);

  const isEditing = Boolean(state.editing);
  const editingPage = state.editing;

  const titleText = isEditing
    ? `Đang sửa trang (phiên bản hiện tại: #${editingPage.revision}) — Lưu sẽ tạo phiên bản mới và tự ẩn bản chia sẻ cũ cho đến khi bạn chia sẻ lại`
    : "Đang viết trang mới — Chỉ mình bạn thấy";

  const cardHeader = h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;" },
    h("h2", { class: "fb-card__title", style: "font-size:16px;margin:0;" }, titleText),
  );

  if (isEditing) {
    const cancelBtn = createButton({
      label: "Hủy sửa / Viết trang mới",
      variant: "ghost",
      onClick: () => {
        state.editing = null;
        renderEditor(container, ctx, state, onSaved);
      },
    });
    cardHeader.appendChild(cancelBtn);
  }
  container.appendChild(cardHeader);

  // Prompt dropdown
  const promptSelect = h("select", { class: "fb-input", "aria-label": "Chủ đề gợi ý", style: "margin-bottom:12px;" });
  promptSelect.appendChild(h("option", { value: "" }, "— Viết tự do (không chọn chủ đề) —"));

  function populatePrompts(prompts) {
    for (const p of prompts) {
      const opt = h("option", { value: p.topic_code }, p.prompt_text || p.topic_code);
      if (isEditing && editingPage.topic_code === p.topic_code) {
        opt.selected = true;
      }
      promptSelect.appendChild(opt);
    }
  }

  if (state.promptsLoaded) {
    populatePrompts(state.prompts);
  } else {
    ctx.adapter.listJournalPrompts()
      .then((res) => {
        if (state._lc.cancelled) return;
        state.prompts = Array.isArray(res?.results) ? res.results : [];
        state.promptsLoaded = true;
        populatePrompts(state.prompts);
      })
      .catch(() => { /* silent fail-open to free-write */ });
  }

  container.appendChild(promptSelect);

  // Title input
  const titleInput = h("input", {
    type: "text",
    class: "fb-input",
    maxlength: "120",
    placeholder: "Tiêu đề trang nhật ký (tùy chọn)…",
    "aria-label": "Tiêu đề trang nhật ký",
    style: "margin-bottom:12px;",
  });
  if (isEditing && editingPage.title) {
    titleInput.value = editingPage.title;
  }
  container.appendChild(titleInput);

  // Content textarea
  const contentArea = createTextarea({
    maxlength: 8000,
    rows: 6,
    placeholder: "Viết những suy nghĩ, cảm xúc hay mong muốn của bạn… (1–8000 ký tự)",
    "aria-label": "Nội dung nhật ký",
  });
  const contentInput = contentArea.input || contentArea;
  if (isEditing && editingPage.content) {
    contentInput.value = editingPage.content;
  }
  container.appendChild(contentArea);

  // Live status feedback
  const feedback = h("p", {
    class: "fb-sec__sub",
    role: "status",
    "aria-live": "polite",
    style: "margin-top:8px;min-height:20px;",
  });
  container.appendChild(feedback);

  // Conflict action wrap
  const conflictWrap = h("div", { style: "display:none;margin-top:8px;margin-bottom:8px;" });
  const reloadLatestBtn = createButton({
    label: "Tải lại bản mới nhất từ máy chủ",
    variant: "ghost",
    onClick: () => {
      if (!state.editing) return;
      feedback.textContent = "Đang tải bản mới nhất từ máy chủ…";
      ctx.adapter.getJournalPage(state.editing.page_id)
        .then((fresh) => {
          if (state._lc.cancelled) return;
          state.editing = fresh;
          titleInput.value = fresh.title || "";
          if (contentArea.input) {
            contentArea.input.value = fresh.content || "";
          } else {
            contentArea.value = fresh.content || "";
          }
          conflictWrap.style.display = "none";
          feedback.textContent = `Bản mới nhất (phiên bản #${fresh.revision}) đã được nạp vào khung soạn thảo.`;
        })
        .catch(() => {
          feedback.textContent = "Không thể tải bản mới nhất. Vui lòng thử lại.";
        });
    },
  });
  conflictWrap.appendChild(reloadLatestBtn);
  container.appendChild(conflictWrap);

  // Action buttons
  const actionsWrap = h("div", { style: "display:flex;gap:12px;margin-top:12px;" });
  const submitBtn = createButton({
    label: isEditing ? "Lưu phiên bản mới" : "Lưu trang riêng",
    variant: "cta",
    onClick: async () => {
      const content = (contentArea.input ? contentArea.input.value : contentArea.value || "").trim();
      if (!content) {
        feedback.textContent = "Vui lòng nhập nội dung trang nhật ký trước khi lưu.";
        (contentArea.input || contentArea).focus();
        return;
      }
      const title = titleInput.value.trim();
      const topicCode = promptSelect.value;

      submitBtn.disabled = true;
      feedback.textContent = "Đang gửi yêu cầu ghi nhận lên máy chủ…";

      try {
        if (isEditing) {
          const updated = await ctx.adapter.editJournalPage(editingPage.page_id, {
            title,
            content,
            expectedRevision: editingPage.revision,
          });
          if (state._lc.cancelled) return;
          feedback.textContent = `Trang riêng đã được ghi nhận (phiên bản #${updated.revision}).`;
          state.editing = null;
          renderEditor(container, ctx, state, onSaved);
          if (typeof onSaved === "function") onSaved();
        } else {
          const created = await ctx.adapter.createJournalPage({
            topicCode,
            title,
            content,
          });
          if (state._lc.cancelled) return;
          feedback.textContent = `Máy chủ đã ghi nhận trang nhật ký riêng (phiên bản #${created.revision}).`;
          titleInput.value = "";
          contentArea.value = "";
          promptSelect.value = "";
          if (typeof onSaved === "function") onSaved();
        }
      } catch (err) {
        if (state._lc.cancelled) return;
        submitBtn.disabled = false;
        if (err?.status === 409 || err?.code === "revision_conflict") {
          feedback.textContent = "Trang này đã được chỉnh sửa từ nơi khác. Nội dung bạn đang gõ vẫn được giữ nguyên.";
          conflictWrap.style.display = "block";
        } else if (err?.kind === "timeout") {
          feedback.textContent = "Yêu cầu quá thời gian chờ. Nội dung đang gõ được giữ nguyên, vui lòng thử lại.";
        } else {
          feedback.textContent = err?.message || "Chưa thể ghi nhận trang nhật ký. Vui lòng kiểm tra lại.";
        }
      }
    },
  });

  actionsWrap.appendChild(submitBtn);
  container.appendChild(actionsWrap);
}

function loadOwnPages(container, ctx, state, { reset = false } = {}) {
  clear(container);

  const header = h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;" },
    h("h2", { class: "fb-card__title", style: "font-size:16px;margin:0;" }, "Danh sách trang nhật ký của bạn"),
  );
  container.appendChild(header);

  // Search bar
  const searchWrap = h("div", { style: "display:flex;gap:8px;margin-bottom:16px;" });
  const searchInput = h("input", {
    type: "search",
    class: "fb-input",
    maxlength: "100",
    placeholder: "Tìm trong nhật ký của bạn…",
    "aria-label": "Tìm trong nhật ký",
    value: state.searchQuery || "",
    onkeydown: (e) => {
      if (e.key === "Enter") {
        state.searchQuery = searchInput.value.trim();
        fetchPages();
      }
    },
  });
  const searchBtn = createButton({
    label: "Tìm",
    variant: "ghost",
    onClick: () => {
      state.searchQuery = searchInput.value.trim();
      fetchPages();
    },
  });
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(searchBtn);

  if (state.searchQuery) {
    const clearBtn = createButton({
      label: "Xóa lọc",
      variant: "ghost",
      onClick: () => {
        state.searchQuery = "";
        searchInput.value = "";
        fetchPages();
      },
    });
    searchWrap.appendChild(clearBtn);
  }

  container.appendChild(searchWrap);

  const listBody = h("div", { class: "fb-diary-list" });
  container.appendChild(listBody);

  const loadMoreWrap = h("div", { style: "margin-top:16px;display:none;" });
  container.appendChild(loadMoreWrap);

  function fetchPages(cursor = null) {
    if (!cursor) {
      clear(listBody);
      listBody.appendChild(createSkeleton({ variant: "card", count: 2 }));
    }
    state.pagesLoading = true;

    ctx.adapter.listJournalPages({
      cursor,
      limit: 20,
      search: state.searchQuery || null,
    })
      .then((res) => {
        if (state._lc.cancelled) return;
        state.pagesLoading = false;
        const rows = Array.isArray(res?.results) ? res.results : [];
        if (!cursor) {
          state.pages = rows;
          clear(listBody);
        } else {
          state.pages = [...state.pages, ...rows];
        }
        state.nextCursor = res?.nextCursor || null;

        renderRows(listBody, state.pages, ctx, state, () => fetchPages());

        if (state.nextCursor) {
          loadMoreWrap.style.display = "block";
          clear(loadMoreWrap);
          const loadMoreBtn = createButton({
            label: "Tải thêm",
            variant: "ghost",
            onClick: () => {
              loadMoreBtn.disabled = true;
              fetchPages(state.nextCursor);
            },
          });
          loadMoreWrap.appendChild(loadMoreBtn);
        } else {
          loadMoreWrap.style.display = "none";
        }
      })
      .catch((err) => {
        if (state._lc.cancelled) return;
        state.pagesLoading = false;
        clear(listBody);
        listBody.appendChild(
          createErrorState({
            message: "Chưa thể tải danh sách trang nhật ký. Vui lòng thử lại.",
            onRetry: () => fetchPages(),
          }),
        );
      });
  }

  fetchPages();
}

function renderRows(container, pages, ctx, state, onRefresh) {
  clear(container);

  if (!pages.length) {
    container.appendChild(
      createEmptyState({
        title: "Chưa có trang nhật ký nào",
        description: state.searchQuery
          ? "Không tìm thấy trang nhật ký nào khớp với từ khóa tìm kiếm."
          : "Hãy viết và lưu trang nhật ký đầu tiên ở khung soạn thảo phía trên.",
      }),
    );
    return;
  }

  for (const item of pages) {
    const card = h("div", { class: "fb-card", style: "margin-bottom:12px;padding:16px;" });

    // Header line
    const headerRow = h("div", { style: "display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;" });
    const titleEl = h("h3", { style: "font-size:16px;font-weight:600;margin:0;" });
    titleEl.textContent = item.title || "(Không tiêu đề)";

    const badge = createStatusBadge({
      label: `Phiên bản #${item.revision}`,
      tone: "neutral",
    });

    headerRow.appendChild(titleEl);
    headerRow.appendChild(badge);
    card.appendChild(headerRow);

    // Meta line
    const metaRow = h("p", { class: "fb-sec__sub", style: "margin:0 0 8px 0;font-size:12px;" });
    const promptObj = state.prompts.find((p) => p.topic_code === item.topic_code);
    const promptLabel = promptObj ? `Chủ đề: ${promptObj.prompt_text}` : (item.topic_code ? `Chủ đề: ${item.topic_code}` : "Viết tự do");
    metaRow.textContent = `${promptLabel} • Cập nhật: ${formatTime(item.updated_at)}`;
    card.appendChild(metaRow);

    // Content preview
    const contentEl = h("p", { style: "margin:0 0 12px 0;white-space:pre-wrap;color:var(--fb-color-text-body, inherit);" });
    contentEl.textContent = item.content || "";
    card.appendChild(contentEl);

    // Action buttons row
    const btnRow = h("div", { style: "display:flex;flex-wrap:wrap;gap:8px;" });

    const editBtn = createButton({
      label: "Mở & Sửa",
      variant: "ghost",
      onClick: () => {
        state.editing = item;
        if (typeof window.scrollTo === "function") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        if (typeof state._refreshEditor === "function") {
          state._refreshEditor();
        } else {
          const editorCard = container.closest?.(".fb-diary-tab-content")?.querySelector(".fb-scard")
            || document.querySelector(".fb-diary-tab-content .fb-scard");
          if (editorCard) {
            renderEditor(editorCard, ctx, state, onRefresh);
          }
        }
      },
    });

    const shareBtn = createButton({
      label: "Chia sẻ / Quản lý quyền",
      variant: "primary",
      onClick: () => {
        openShareSheet(ctx, state, item);
      },
    });

    const repliesBtn = createButton({
      label: "Phản hồi song hành",
      variant: "ghost",
      onClick: () => {
        openPageRepliesSheet(ctx, state, item);
      },
    });

    const deleteBtn = createButton({
      label: "Xóa trang",
      variant: "danger",
      onClick: () => {
        const dialog = createDialog({
          title: "Xác nhận xóa trang nhật ký",
          message:
            "Xóa trang này sẽ xóa hoàn toàn nội dung và gỡ bỏ toàn bộ quyền chia sẻ cũng như các phản hồi song hành gắn với trang. Thao tác này không thể hoàn tác.",
          actions: [
            { label: "Hủy", variant: "ghost" },
            {
              label: "Xóa trang",
              variant: "danger",
              onClick: () => {
                ctx.adapter.deleteJournalPage(item.page_id)
                  .then(() => {
                    if (state._lc.cancelled) return;
                    if (state.editing?.page_id === item.page_id) {
                      state.editing = null;
                      const editorCard = document.querySelector(".fb-diary-tab-content .fb-scard");
                      if (editorCard) renderEditor(editorCard, ctx, state, onRefresh);
                    }
                    onRefresh();
                  })
                  .catch(() => {
                    alert("Không thể xóa trang nhật ký. Vui lòng thử lại.");
                  });
              },
            },
          ],
        });
        state._lc.register(dialog);
      },
    });

    btnRow.appendChild(editBtn);
    btnRow.appendChild(shareBtn);
    btnRow.appendChild(repliesBtn);
    btnRow.appendChild(deleteBtn);
    card.appendChild(btnRow);

    container.appendChild(card);
  }
}

/* =========================================================================
   SHEETS: Chia sẻ & Quản lý quyền; Phản hồi song hành
   ========================================================================= */

function openShareSheet(ctx, state, pageItem) {
  const content = h("div", { class: "fb-share-sheet-content" });

  const preview = {
    pageId: pageItem.page_id,
    title: pageItem.title || "(Không tiêu đề)",
    content: pageItem.content || "",
    revision: pageItem.revision,
  };

  // Section 1: Preview
  content.appendChild(h("h3", { style: "font-size:15px;margin:0 0 6px 0;" }, "1) Xem trước nội dung sẽ chia sẻ"));
  content.appendChild(
    h("p", { class: "fb-sec__sub", style: "margin:0 0 8px 0;" },
      "Người nhận sẽ đọc đúng nội dung và phiên bản này. Khi bạn sửa trang, phiên bản mới sẽ tự động ẩn cho đến khi bạn chia sẻ lại.",
    ),
  );

  const previewBox = h("div", { class: "fb-card", style: "padding:12px;margin-bottom:12px;background:var(--fb-color-surface-variant, #f8f9fa);" });
  const previewTitle = h("strong", {});
  previewTitle.textContent = preview.title;
  const previewRev = h("span", { class: "fb-sec__sub", style: "margin-left:8px;" }, `Phiên bản: #${preview.revision}`);
  const previewText = h("p", { style: "margin:8px 0 0 0;white-space:pre-wrap;" });
  previewText.textContent = preview.content;

  previewBox.appendChild(previewTitle);
  previewBox.appendChild(previewRev);
  previewBox.appendChild(previewText);
  content.appendChild(previewBox);

  // Section 2: Choose recipient
  content.appendChild(h("h3", { style: "font-size:15px;margin:16px 0 6px 0;" }, "2) Chọn người nhận đang kết nối"));
  const recipientWrap = h("div", { style: "margin-bottom:12px;" });
  content.appendChild(recipientWrap);

  const recipientSelect = h("select", { class: "fb-input", "aria-label": "Chọn người nhận", style: "margin-bottom:8px;" });
  recipientWrap.appendChild(recipientSelect);

  const shareFeedback = h("p", {
    class: "fb-sec__sub",
    role: "alert",
    "aria-live": "assertive",
    style: "min-height:20px;margin-bottom:8px;",
  });
  content.appendChild(shareFeedback);

  // Stale refresh button (hidden until 409)
  const staleWrap = h("div", { style: "display:none;margin-bottom:8px;" });
  const staleBtn = createButton({
    label: "Tải lại bản mới từ máy chủ",
    variant: "ghost",
    onClick: () => {
      ctx.adapter.getJournalPage(preview.pageId)
        .then((fresh) => {
          if (state._lc.cancelled) return;
          preview.revision = fresh.revision;
          preview.title = fresh.title || "(Không tiêu đề)";
          preview.content = fresh.content || "";
          previewTitle.textContent = preview.title;
          previewRev.textContent = `Phiên bản: #${preview.revision}`;
          previewText.textContent = preview.content;
          staleWrap.style.display = "none";
          shareConfirmBtn.disabled = false;
          shareFeedback.textContent = "Bản xem trước đã được cập nhật bản mới nhất.";
        })
        .catch(() => {
          shareFeedback.textContent = "Không thể cập nhật bản mới nhất. Vui lòng thử lại.";
        });
    },
  });
  staleWrap.appendChild(staleBtn);
  content.appendChild(staleWrap);

  const shareConfirmBtn = createButton({
    label: "Xác nhận chia sẻ trang này",
    variant: "cta",
    onClick: async () => {
      const recipientId = recipientSelect.value;
      if (!recipientId) {
        shareFeedback.textContent = "Vui lòng chọn người nhận đang kết nối.";
        return;
      }
      shareConfirmBtn.disabled = true;
      shareFeedback.textContent = "Đang gửi yêu cầu chia sẻ lên máy chủ…";

      try {
        await ctx.adapter.shareJournalPage(preview.pageId, {
          recipientId,
          expectedRevision: preview.revision,
        });
        if (state._lc.cancelled) return;
        shareConfirmBtn.disabled = false;
        shareFeedback.textContent = "Máy chủ đã ghi nhận quyền chia sẻ trang này.";
        loadGrants();
      } catch (err) {
        if (state._lc.cancelled) return;
        shareConfirmBtn.disabled = false;
        if (err?.details?.reason === "reshare_after_revoke_requires_edit") {
          shareFeedback.textContent = "Bạn đã thu hồi quyền xem ở phiên bản này. Để chia sẻ lại, hãy sửa và lưu trang thành phiên bản mới trước khi chia sẻ.";
        } else if (err?.status === 409 || err?.code === "stale_revision") {
          shareFeedback.textContent = "Bản xem trước đã cũ so với phiên bản trên máy chủ. Vui lòng tải lại bản mới.";
          staleWrap.style.display = "block";
          shareConfirmBtn.disabled = true;
        } else {
          shareFeedback.textContent = err?.message || "Chưa thể chia sẻ trang này. Vui lòng thử lại.";
        }
      }
    },
  });
  content.appendChild(shareConfirmBtn);

  // Section 3: Active Grants
  content.appendChild(h("h3", { style: "font-size:15px;margin:20px 0 6px 0;" }, "3) Danh sách người đang nhận trang này"));
  const grantsWrap = h("div", { style: "margin-top:8px;" });
  content.appendChild(grantsWrap);

  const sheet = createSheet({
    title: "Chia sẻ trang nhật ký",
    content,
    onClose: () => {
      state._lc.unregister(sheet);
    },
  });
  state._lc.register(sheet);

  // Load connections for selector
  ctx.adapter.listConnections({ limit: 50 })
    .then((res) => {
      if (state._lc.cancelled) return;
      const conns = Array.isArray(res?.results) ? res.results : [];
      clear(recipientSelect);
      if (!conns.length) {
        recipientSelect.style.display = "none";
        shareConfirmBtn.style.display = "none";
        const emptyConn = h("div", {},
          h("p", { class: "fb-sec__sub" }, "Chưa có kết nối nào đang hoạt động. Bạn cần kết nối với người đồng hành trước khi chia sẻ trang nhật ký."),
        );
        const goToConnBtn = createButton({
          label: "Đến trang Kết nối",
          variant: "primary",
          onClick: () => {
            sheet.close();
            ctx.navigate("/connect");
          },
        });
        emptyConn.appendChild(goToConnBtn);
        recipientWrap.appendChild(emptyConn);
      } else {
        recipientSelect.appendChild(h("option", { value: "" }, "— Chọn người nhận —"));
        for (const [idx, c] of conns.entries()) {
          const id = c.other_party_id || c.counterpart?.user_id || c.connection_id;
          const name = c.counterpart?.display_name || c.other_party_name || `Người dùng ${String(id).slice(0, 8)}`;
          const opt = h("option", { value: id }, name);
          if (conns.length === 1 && idx === 0) {
            opt.selected = true;
          }
          recipientSelect.appendChild(opt);
        }
        if (conns.length === 1) {
          const singleId = conns[0].other_party_id || conns[0].counterpart?.user_id || conns[0].connection_id;
          recipientSelect.value = singleId;
        }
      }
    })
    .catch(() => {
      recipientSelect.style.display = "none";
      shareConfirmBtn.style.display = "none";
      recipientWrap.textContent = "Không tải được danh sách kết nối. Vui lòng thử lại.";
    });

  // Load grants
  function loadGrants() {
    clear(grantsWrap);
    grantsWrap.appendChild(createSkeleton({ variant: "line", count: 2 }));
    ctx.adapter.listJournalPageShares(preview.pageId)
      .then((res) => {
        if (state._lc.cancelled) return;
        clear(grantsWrap);
        const shares = Array.isArray(res?.results) ? res.results : [];
        if (!shares.length) {
          grantsWrap.appendChild(h("p", { class: "fb-sec__sub" }, "Trang này hiện chưa chia sẻ với ai."));
          return;
        }
        for (const grant of shares) {
          const itemDiv = h("div", {
            class: "fb-card",
            style: "padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;",
          });
          const info = h("div", {});
          info.appendChild(h("p", { style: "margin:0;font-size:14px;font-weight:500;" }, `Người nhận: ${String(grant.recipient_id).slice(0, 8)}…`));
          info.appendChild(h("p", { class: "fb-sec__sub", style: "margin:2px 0 0 0;font-size:12px;" }, `Phiên bản: #${grant.approved_revision} • Chia sẻ lúc: ${formatTime(grant.shared_at)}`));

          const revokeBtn = createButton({
            label: "Thu hồi quyền xem",
            variant: "danger",
            onClick: () => {
              const dialog = createDialog({
                title: "Thu hồi quyền xem trang nhật ký",
                message: "Người nhận sẽ mất quyền xem trang này ngay lập tức ở lần mở tiếp theo. Bạn có chắc chắn muốn thu hồi?",
                actions: [
                  { label: "Hủy", variant: "ghost" },
                  {
                    label: "Thu hồi quyền xem",
                    variant: "danger",
                    onClick: () => {
                      ctx.adapter.revokeJournalShare(grant.share_id)
                        .then(() => {
                          if (state._lc.cancelled) return;
                          shareFeedback.textContent = "Quyền xem trang này đã được thu hồi.";
                          loadGrants();
                        })
                        .catch(() => {
                          shareFeedback.textContent = "Không thể thu hồi quyền xem. Vui lòng thử lại.";
                        });
                    },
                  },
                ],
              });
              state._lc.register(dialog);
            },
          });

          itemDiv.appendChild(info);
          itemDiv.appendChild(revokeBtn);
          grantsWrap.appendChild(itemDiv);
        }
      })
      .catch(() => {
        clear(grantsWrap);
        grantsWrap.appendChild(h("p", { class: "fb-sec__sub" }, "Không tải được danh sách người nhận."));
      });
  }

  loadGrants();
}

function openPageRepliesSheet(ctx, state, pageItem) {
  const content = h("div", { class: "fb-replies-sheet-content" });

  content.appendChild(
    h("p", { class: "fb-sec__sub", style: "margin:0 0 12px 0;" },
      `Các phản hồi song hành mà người đồng hành đã gửi cho trang "${pageItem.title || "(Không tiêu đề)"}":`,
    ),
  );

  const listDiv = h("div", {});
  listDiv.appendChild(createSkeleton({ variant: "card", count: 1 }));
  content.appendChild(listDiv);

  const sheet = createSheet({
    title: "Phản hồi song hành nhận được",
    content,
    onClose: () => {
      state._lc.unregister(sheet);
    },
  });
  state._lc.register(sheet);

  ctx.adapter.listJournalPageReplies(pageItem.page_id)
    .then((res) => {
      if (state._lc.cancelled) return;
      clear(listDiv);
      const replies = Array.isArray(res?.results) ? res.results : [];
      if (!replies.length) {
        listDiv.appendChild(
          createEmptyState({
            title: "Chưa có phản hồi song hành nào",
            description: "Khi người đồng hành đọc trang này và gửi phản hồi song hành, nội dung sẽ hiện tại đây.",
          }),
        );
        return;
      }
      for (const r of replies) {
        const item = h("div", { class: "fb-card", style: "padding:12px;margin-bottom:8px;" });
        const timeP = h("p", { class: "fb-sec__sub", style: "margin:0 0 6px 0;font-size:12px;" }, `Gửi lúc: ${formatTime(r.updated_at || r.created_at)}`);
        const bodyP = h("p", { style: "margin:0;white-space:pre-wrap;" });
        bodyP.textContent = r.body || "";
        item.appendChild(timeP);
        item.appendChild(bodyP);
        listDiv.appendChild(item);
      }
    })
    .catch(() => {
      clear(listDiv);
      listDiv.appendChild(h("p", { class: "fb-sec__sub" }, "Không tải được danh sách phản hồi song hành."));
    });
}

/* =========================================================================
   TAB 2: Được chia sẻ & Song hành
   ========================================================================= */

function renderSharedTab(container, ctx, state) {
  clear(container);

  const sharedListSection = h("section", { class: "fb-scard", style: "margin-bottom:20px;" });
  const myRepliesSection = h("section", { class: "fb-scard" });

  container.appendChild(sharedListSection);
  container.appendChild(myRepliesSection);

  loadSharedPages(sharedListSection, ctx, state, () => {
    loadMyReplies(myRepliesSection, ctx, state);
  });
  loadMyReplies(myRepliesSection, ctx, state);
}

function loadSharedPages(container, ctx, state, onRepliesChanged) {
  clear(container);

  const header = h("div", { style: "margin-bottom:12px;" },
    h("h2", { class: "fb-card__title", style: "font-size:16px;margin:0 0 4px 0;" }, "Các trang người đồng hành đang chia sẻ với bạn"),
    h("p", { class: "fb-sec__sub", style: "margin:0;" }, "Mỗi trang được người viết chọn chia sẻ riêng; kiểm tra quyền trực tiếp tại mỗi lần đọc."),
  );
  container.appendChild(header);

  const listDiv = h("div", {});
  listDiv.appendChild(createSkeleton({ variant: "card", count: 2 }));
  container.appendChild(listDiv);

  ctx.adapter.listSharedJournalPages()
    .then((res) => {
      if (state._lc.cancelled) return;
      clear(listDiv);
      const rows = Array.isArray(res?.results) ? res.results : [];
      state.sharedPages = rows;

      if (!rows.length) {
        listDiv.appendChild(
          createEmptyState({
            title: "Chưa có trang nào được chia sẻ",
            description:
              "Chưa có trang nhật ký nào đang được chia sẻ với bạn. Khi người đồng hành chủ động chọn chia sẻ một trang, trang đó sẽ hiện tại đây.",
          }),
        );
        return;
      }

      for (const item of rows) {
        const card = h("div", { class: "fb-card", style: "padding:16px;margin-bottom:12px;" });
        const hRow = h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;" });
        const titleEl = h("h3", { style: "font-size:16px;font-weight:600;margin:0;" });
        titleEl.textContent = item.title || "(Không tiêu đề)";
        const badge = createStatusBadge({
          label: `Phiên bản được duyệt: #${item.approved_revision}`,
          tone: "neutral",
        });
        hRow.appendChild(titleEl);
        hRow.appendChild(badge);
        card.appendChild(hRow);

        const metaP = h("p", { class: "fb-sec__sub", style: "margin:0 0 12px 0;font-size:12px;" },
          `Chia sẻ lúc: ${formatTime(item.shared_at)}`,
        );
        card.appendChild(metaP);

        const openBtn = createButton({
          label: "Mở đọc & Phản hồi song hành",
          variant: "primary",
          onClick: () => {
            openSharedReaderSheet(ctx, state, item, onRepliesChanged);
          },
        });
        card.appendChild(openBtn);
        listDiv.appendChild(card);
      }
    })
    .catch(() => {
      if (state._lc.cancelled) return;
      clear(listDiv);
      listDiv.appendChild(
        createErrorState({
          message: "Chưa thể tải danh sách trang được chia sẻ. Vui lòng thử lại.",
          onRetry: () => loadSharedPages(container, ctx, state, onRepliesChanged),
        }),
      );
    });
}

function openSharedReaderSheet(ctx, state, item, onRepliesChanged) {
  const content = h("div", { class: "fb-reader-sheet-content" });

  const loadingP = h("p", { role: "status" }, "Đang kiểm tra quyền và tải nội dung trang…");
  content.appendChild(loadingP);

  const sheet = createSheet({
    title: "Đọc trang nhật ký được chia sẻ",
    content,
    onClose: () => {
      state._lc.unregister(sheet);
    },
  });
  state._lc.register(sheet);

  ctx.adapter.getSharedJournalPage(item.share_id)
    .then((data) => {
      if (state._lc.cancelled) return;
      clear(content);

      const pageData = data?.page || (data?.content !== undefined ? data : null);
      if (!data || !pageData) {
        content.appendChild(
          h("p", { class: "fb-sec__sub" }, "Trang này không còn xem được (người viết đã thu hồi, đã chỉnh sửa sang bản mới hoặc kết nối đã thay đổi)."),
        );
        return;
      }

      const pTitle = h("h3", { style: "font-size:18px;font-weight:600;margin:0 0 6px 0;" });
      pTitle.textContent = pageData.title || "(Không tiêu đề)";
      content.appendChild(pTitle);

      const pMeta = h("p", { class: "fb-sec__sub", style: "margin:0 0 12px 0;font-size:12px;" },
        `Phiên bản: #${pageData.revision || data.approved_revision || 1} • Chia sẻ lúc: ${formatTime(data.shared_at)}`,
      );
      content.appendChild(pMeta);

      const pBody = h("div", {
        class: "fb-card",
        style: "padding:14px;margin-bottom:16px;white-space:pre-wrap;background:var(--fb-color-surface-variant, #f8f9fa);",
      });
      pBody.textContent = pageData.content || "";
      content.appendChild(pBody);

      // Section: Song hành reflection
      content.appendChild(h("h4", { style: "font-size:15px;margin:16px 0 6px 0;" }, "Phản hồi song hành của bạn"));
      content.appendChild(
        h("p", { class: "fb-sec__sub", style: "margin:0 0 8px 0;" },
          "Phản hồi của bạn chỉ gắn với trang này và người viết sẽ đọc được trong trang của họ.",
        ),
      );

      const replyArea = createTextarea({
        maxlength: 4000,
        rows: 4,
        placeholder: "Viết cảm nhận, sự thấu hiểu hoặc lời chia sẻ của bạn… (tối đa 4000 ký tự)",
        "aria-label": "Phản hồi song hành",
      });
      content.appendChild(replyArea);

      const replyFeedback = h("p", {
        class: "fb-sec__sub",
        role: "alert",
        "aria-live": "polite",
        style: "min-height:20px;margin-top:8px;",
      });
      content.appendChild(replyFeedback);

      const replySubmitBtn = createButton({
        label: "Gửi / Cập nhật phản hồi song hành",
        variant: "cta",
        onClick: async () => {
          const text = (replyArea.input ? replyArea.input.value : replyArea.value || "").trim();
          if (!text) {
            replyFeedback.textContent = "Vui lòng nhập nội dung phản hồi trước khi gửi.";
            (replyArea.input || replyArea).focus();
            return;
          }
          replySubmitBtn.disabled = true;
          replyFeedback.textContent = "Đang gửi phản hồi song hành lên máy chủ…";

          try {
            await ctx.adapter.replySharedJournalPage(item.share_id, { body: text });
            if (state._lc.cancelled) return;
            replySubmitBtn.disabled = false;
            replyFeedback.textContent = "Máy chủ đã ghi nhận phản hồi song hành của bạn.";
            if (typeof onRepliesChanged === "function") onRepliesChanged();
          } catch (err) {
            if (state._lc.cancelled) return;
            replySubmitBtn.disabled = false;
            if (err?.status === 404) {
              replyFeedback.textContent = "Trang này không còn xem được (người viết đã thu hồi, đã chỉnh sửa sang bản mới hoặc kết nối đã thay đổi).";
            } else {
              replyFeedback.textContent = err?.message || "Chưa thể gửi phản hồi song hành. Vui lòng thử lại.";
            }
          }
        },
      });
      content.appendChild(replySubmitBtn);
    })
    .catch((err) => {
      if (state._lc.cancelled) return;
      clear(content);
      const isNotFound = err?.status === 404 || err?.details?.reason === "share_not_found";
      content.appendChild(
        h("p", { class: "fb-sec__sub" },
          isNotFound
            ? "Trang này không còn xem được (người viết đã thu hồi, đã chỉnh sửa sang bản mới hoặc kết nối đã thay đổi)."
            : "Chưa thể đọc trang được chia sẻ. Vui lòng thử lại.",
        ),
      );
    });
}

function loadMyReplies(container, ctx, state) {
  clear(container);

  const header = h("div", { style: "margin-bottom:12px;" },
    h("h2", { class: "fb-card__title", style: "font-size:16px;margin:0 0 4px 0;" }, "Phản hồi song hành bạn đã viết"),
    h("p", { class: "fb-sec__sub", style: "margin:0;" }, "Danh sách các phản hồi bạn đã gửi cho các trang nhật ký được chia sẻ."),
  );
  container.appendChild(header);

  const listDiv = h("div", {});
  listDiv.appendChild(createSkeleton({ variant: "card", count: 1 }));
  container.appendChild(listDiv);

  ctx.adapter.listMyJournalReplies()
    .then((res) => {
      if (state._lc.cancelled) return;
      clear(listDiv);
      const rows = Array.isArray(res?.results) ? res.results : [];
      state.myReplies = rows;

      if (!rows.length) {
        listDiv.appendChild(
          createEmptyState({
            title: "Chưa có phản hồi nào",
            description: "Bạn chưa viết phản hồi song hành nào cho các trang được chia sẻ.",
          }),
        );
        return;
      }

      for (const r of rows) {
        const card = h("div", { class: "fb-card", style: "padding:12px;margin-bottom:8px;" });
        const timeP = h("p", { class: "fb-sec__sub", style: "margin:0 0 6px 0;font-size:12px;" },
          `Cập nhật: ${formatTime(r.updated_at || r.created_at)}`,
        );
        const bodyP = h("p", { style: "margin:0;white-space:pre-wrap;" });
        bodyP.textContent = r.body || "";
        card.appendChild(timeP);
        card.appendChild(bodyP);
        listDiv.appendChild(card);
      }
    })
    .catch(() => {
      if (state._lc.cancelled) return;
      clear(listDiv);
      listDiv.appendChild(h("p", { class: "fb-sec__sub" }, "Không tải được danh sách phản hồi của bạn."));
    });
}
