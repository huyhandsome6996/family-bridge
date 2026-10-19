# F04 — Web compose: inventory trạng thái (khung mini → state → component → API → status)

Feature: F04 / US-029 / US-033 — AI hỗ trợ diễn đạt. Nhánh
`tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033` (working tree, CHƯA commit).
Tác giả: **A4-V** (phiên xác minh N01 web, 2026-10-19).

Mục đích: inventory các TRẠNG THÁI của màn soạn thư web (`#/compose`,
`web/src/pages/compose/index.js` + `web/src/components/ai-assist.js`) đối chiếu
với **24 khung mini** nguồn tại
`upload/f04-docx-extract/f04-docx/designs/extracted/stitch_family_bridge_zalo_ai_composer/`
(16 khung học sinh `zalo_f04_01…14` + 8 khung người chăm sóc `zalo_f04_cg_01…06`;
web gốc chỉ có 4 khung trong `stitch_family_bridge_ai_composer/` — xem
`docs/features/f04/web-zalo-parity.md` mục 1 để có bảng 24 dòng frame đầy đủ).

Nguyên tắc ghi nhận (giống parity doc): **trung thực** — state nào chưa có thì
ghi THIẾU, không gán "đã đủ" nếu chỉ có test source-level, không tự tạo route
cho khung ngoài phạm vi F04.

Cách đọc cột status:

- **có sẵn** — đã có trước vòng fix N01, có test hoặc code pin (không đụng
  trong phiên này).
- **mới 19/10/2026** — bổ sung trong vòng fix N01 (phiên A4 trước + xác minh
  A4-V), có test thật xanh trong `web/tests/f04-preview-snapshot.test.mjs`
  (9/9 PASS) hoặc `f04-ai-parity.test.mjs`.
- **THIẾU** — chưa có; ghi rõ hệ quả và đề xuất.

---

## 1. Bảng inventory trạng thái web compose

| # | Trạng thái | Web component / route (file + hàm thật) | API / backend | Frame mini liên quan | Status |
|---|---|---|---|---|---|
| S01 | Chưa đăng nhập (production) | `compose/index.js` `page.render` → `createEmptyState` "Cần đăng nhập để soạn thư" + nút → `#/login` | Không gọi API (guard `hasLiveSession()` local) | — (ngụ ý của frame 01/02) | có sẵn |
| S02 | Loading lúc vào trang | skeleton `createSkeleton({variant:"line"})` + `role="status"` "Đang tải bản soạn…" (`render`, trước `Promise.all`) | `GET /connections` + `GET /drafts` (qua `listConnections`/`listDrafts`) | 01/02 (trước khi vào trạng thái gốc) | có sẵn |
| S03 | Lỗi tải trang | `renderLoadError()` → `createErrorState` "Không tải được màn soạn thư" + "Thử lại" (dispatch `hashchange`) | `listConnections`/`listDrafts` fail → catch | — | có sẵn |
| S04 | Soạn — bản trống (chưa có nội dung) | `renderCompose()` editor `#fb-compose-body` + counter; guard bấm Lưu nháp/Xem trước → statusNote "Lời nhắn chưa có nội dung…" | không gọi | 01, 02, 17, 18 | có sẵn |
| S05 | Đang đồng bộ bản sửa lên máy chủ (R01) | `onPreview()` — statusNote "Đang đồng bộ nội dung mới lên máy chủ…" trước `editDraft` khi body lệch `syncedBody` | `POST /drafts/{id}` (edit, revision máy chủ) | 07 (sửa & áp dụng trước khi gửi) | có sẵn |
| S06 | **Preview-locked — bản xem trước đang bay** | `onPreview()` → `lockComposeForPreview()`: `textarea.disabled`, `recipientChangeBtn.disabled`, `previewBtn.disabled` + `title`/`aria-busy` + statusNote `PREVIEW_BUSY_NOTE`; CSS `.fb-compose__textarea:disabled` / `.fb-compose__change-btn:disabled` (components.css, mới) | `POST /drafts/{id}/preview` đang chờ | 12 (xem trước & xác nhận — phần đang chờ) | **mới 19/10/2026 (N01)** |
| S07 | Double-click preview → chỉ 1 phiên | token `state.previewSeq` tăng ở đầu mỗi lần bấm + nút bị khóa khi bay → request/sheet không nhân bản | `previewDraft` gọi đúng 1 lần | 12 | **mới 19/10/2026 (N01, test case 6)** |
| S08 | **Invalidate khi snapshot lệch** (body/recipient/revision đổi khi bay) | sau mỗi `await` so lại `previewSeq`; sau `previewDraft` so lại `currentBodyText/snapshot.body`, `state.recipientId`, `state.revision` lệch → **KHÔNG mở sheet** + statusNote `PREVIEW_INVALIDATE_NOTE` + `unlockComposeForPreview()` | `previewDraft` đã trả nhưng bị bỏ qua (client-side guard) | 12 | **mới 19/10/2026 (N01, test case 2/2b/3)** |
| S09 | Máy chủ từ chối `preview_stale` (kèm reason) | `describeError()` — reason `recipient_changed_after_preview` → "Người nhận đã thay đổi sau khi xem trước…", còn lại → "Bản xem trước đã cũ…"; kèm mở khóa | `POST /drafts/{id}/confirm-send` → 409 `preview_stale` (backend f06) | 12, 14 | có sẵn; **mở rộng copy reason 19/10/2026** |
| S10 | Cooldown active (`cooldown_active`) | `onPreview()` catch → statusNote remaining từ `details.remaining_seconds` + `refreshPauseUi()`; preview nút khóa tới khi máy chủ mở | 403 `cooldown_active` + `details.remaining_seconds` (pause 300s máy chủ chốt) | 13 | có sẵn |
| S11 | Paused — niêm phong (w12) | `refreshPauseUi()`: `textarea--sealed` + `sealedNote` + ring SVG stroke theo `remaining_seconds` máy chủ (KHÔNG timer — DSA-10) | state `pause` từ `GET /drafts`; `pauseDraft`/`cancelDraftPause` | 13 | có sẵn |
| S12 | Hết giờ — máy chủ mở preview | `refreshPauseUi()`: `serverAllowsPreview` (row `can_preview` hoặc `remaining === 0`) → mở nút "Xem trước nội dung" | `pause.can_preview` / `remaining_seconds=0` | 13 | có sẵn |
| S13 | Sheet xác nhận — hiển thị **bản máy chủ bind** | `openConfirmSheet(ctx, state, ui, preview, snapshot)`: `serverBoundBody = preview.body ?? snapshot.body`; **KHÔNG đọc live textarea** (bỏ `String(ui.textarea.value||"")` cũ dòng 836); nếu server normalize text (khác snapshot, không bump revision) thì nhận bản máy chủ làm chuẩn (textarea + syncedBody) | response preview mới kèm `body` (backend A2 `make_preview`; mock shared đã parity) | 12 | **mới 19/10/2026 (N01)** |
| S14 | Sending — đang gửi | confirmBtn → "Đang gửi…" + disabled (chặn double-click) | `POST /drafts/{id}/confirm-send` | 14 | có sẵn |
| S15 | **Re-verify trước Gửi trong sheet** | onClick "Gửi cho {tên}" so lại `currentBodyText(ui) !== displayedSnapshot` hoặc `state.recipientId !== snapshot.recipientId` → lỗi trung thực **TRONG sheet** (`role="alert"`) + KHÔNG gọi confirm | không gọi khi lệch | 12 | **mới 19/10/2026 (N01, test case 4/4b)** |
| S16 | Kết quả gửi — sent | `renderSendReceipt(ui.mainCol, {outcome:"sent"})` + reset composer (textarea rỗng, state mới) | confirm-send thành công | 14 | có sẵn |
| S17 | Kết quả gửi — unknown (không tự retry) | `renderSendReceipt({outcome:"unknown"})` + sheet error "KẾT QUẢ CHƯA XÁC ĐỊNH… không gửi lại ngay" + "Kiểm tra trạng thái mới nhất" | confirm-send lỗi/mất response; không tạo key gửi lại | 14 | có sẵn |
| S18 | **Sync editDraft lỗi → dừng flow** | `run().catch` trong `onPreview`: phiên cũ bỏ qua (previewSeq), `unlockComposeForPreview()`, `describeError` — KHÔNG gọi `previewDraft`, không mở sheet | `editDraft` 4xx/5xx/timeout | 07, 12 | **mới 19/10/2026 (N01 — hành vi dừng + mở khóa pin bằng test case 7)** |
| S19 | Chọn người nhận (+ rỗng) | `openRecipientSheet()` — sheet "Chọn người nhận", chỉ kết nối `active`; rỗng → dẫn `#/connect`; pill "Đổi" `.fb-compose__change-btn` | `GET /connections` (active two-way) | 11 | có sẵn |
| S20 | AI consent gate | `components/ai-assist.js` `createAiAssist()` → `openConsentSheet()`: disclosure Gemini + `recordConsent({purpose:"ai_processing"})`; decline → ghi nhận im + manual path; 403 `consent_required` → mở lại sheet (không loop) | `GET/POST /consents`; guard `has_active_consent()` (f01) | 03, 04 | có sẵn |
| S21 | AI loading + hủy chờ | `renderPanel("loading")` skeleton + nút "Hủy chờ gợi ý" (`refineSeq` — response muộn bỏ qua, không tự retry); không khóa gõ/lưu nháp | `POST /ai/refine` (idempotency key) | 05 | có sẵn (được vá ở phiên A4-FINISH trước vòng N01) |
| S22 | AI gợi ý hiển thị + chấp nhận/bỏ | `renderPanel("suggestion")` — `suggested_text` qua `textContent` (SEC-12); "Dùng gợi ý" → `aiAccept` chỉ điền textarea; "Bỏ" → `aiDiscard` | `POST /ai/suggestions/{id}/accept|discard` | 06, 08 | có sẵn |
| S23 | AI gợi ý lỗi thời (stale) | banner `.fb-ai-assist__stale` + khóa "Dùng gợi ý" + "Tạo gợi ý mới"; re-check `boundRev !== revision` tại thời điểm bấm | local revision guard (input_revision echo) | 09 | có sẵn |
| S24 | AI tắt / lỗi | `describeAiError()` → panel lỗi `role=alert`; `aiStatus()` off → CTA disabled + lý do; lỗi mạng → "chưa kiểm tra được" (fail-closed, không giả on/off); manual path nguyên | `GET /ai/status` (`FB_AI_ENABLED` kill switch); 429/503/timeout map | 10 | có sẵn |
| S25 | Biến thể người chăm sóc | cùng route/component, `editorCopy` + `AI_COPY.caregiver` theo `store.role` | cùng bộ API | 17–20 | có sẵn |
| S26 | Keyboard-open / mobile-web | textarea native (IME thật), không vẽ bàn phím giả; grid 2 cột chỉ ≥1024px (`shell.css`) | không cần endpoint | 01, 07, 17, 19 | có sẵn (responsive smoke source-level) |

## 2. Trạng thái THIẾU / chưa kiểm chứng (trung thực)

| # | Khoảng trống | Chi tiết | Hệ quả | Đề xuất |
|---|---|---|---|---|
| G1 | **Không tự re-sync nháp sau invalidate** | Khi S08 invalidate (lệch snapshot), trang chỉ mở khóa + báo "bấm Xem trước nội dung lại"; KHÔNG chủ động `listDrafts`/reload để kéo revision/body mới nhất về `state` | Nếu lệch do tab/máy chủ khác (không phải thao tác cục bộ), `state.revision` có thể cũ cho tới lần lưu/preview kế tiếp; `editDraft` kế tiếp sẽ bị máy chủ từ chối revision conflict → user thấy lỗi trung thực, không mất dữ liệu | Chấp nhận được cho P1 này (an toàn, không gửi sai bản); nếu muốn mượt hơn: sau invalidate gọi 1 lần `listDrafts` để refresh `state` — cần test riêng, KHÔNG làm trong vòng fix N01 |
| G2 | **Screenshot/visual QA cho mọi state** | Môi trường sandbox không có trình duyệt chụp ảnh — toàn bộ state trên chỉ có bằng chứng DOM test (`node --test` happy-dom) + source-level; KHÔNG có PNG state thật | Nghiệm thu visual (khung 12/13/14 đặc biệt) chưa làm | Cần môi trường có browser (Playwright) chạy bộ chụp theo bảng trên |

Khung mini **không có** trạng thái web tương ứng (không bịa): frame 21
(caregiver hub — LAYOUT-ONLY), frame 22–24 (tư vấn/booking — OUT-OF-SCOPE theo
handoff 05; xem parity doc mục 1 dòng 21–24).

## 3. Tổng kết

- 26 trạng thái đã có (S01–S26), trong đó **6 trạng thái + 1 mở rộng copy là
  mới/được bổ sung 19/10/2026** bởi fix N01: S06, S07, S08, S13, S15, S18
  (+ S09 mở rộng reason). Mọi trạng thái mới đều có test thật xanh trong
  `web/tests/f04-preview-snapshot.test.mjs` (9/9) — xác minh lại A4-V:
  `npm test` 222/222 PASS, `npm run build` PASS (evidence:
  `f04-fix-evidence/a4/green-verified.log`).
- 2 khoảng trống ghi nhận trung thực: G1 (re-sync sau invalidate — chưa làm,
  có chủ ý), G2 (screenshot — NOT_RUN do môi trường).
