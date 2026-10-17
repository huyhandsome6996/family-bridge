# F04 — Web ⇄ Zalo Mini App design parity (24 frame nguồn)

Feature: F04 / US-029 / US-033 — AI hỗ trợ diễn đạt. Nhánh
`tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033` (baseline 72930ae, working tree của
5 agent A1–A5, chưa commit — coordinator chịu trách nhiệm git).

Tài liệu này đáp ứng yêu cầu bắt buộc trong
`upload/f04-handoff/F04-HANDOFF/05-WEB-ZALO-DESIGN-PARITY.md` mục 4 + mục 6:
**đủ 24 dòng nguồn Zalo**, mỗi dòng có (1) use case/actor/state + disposition,
(2) counterpart web cụ thể theo file/hàm/class thật trong code, (3) backend
capability/endpoint/DTO/guard, (4) evidence với test case ID thật, (5) status
trung thực PASS/PARTIAL/MISSING. Không im lặng bỏ frame nào, không gán nhãn
out-of-scope cho màn F04 bắt buộc.

## 0. Cách đọc evidence (trung thực về môi trường)

- **"DOM test"** = test thật chạy bằng `node --test` (happy-dom) — lệnh:
  `cd web && npm test` → **208/208 PASS, 41 suites** (bao gồm
  `web/tests/f04-ai-parity.test.mjs` 21 test F04 chuyên biệt + các test
  compose/message trong `web/tests/web-screens.test.mjs`). Tên test dưới đây
  là tên `it(...)` nguyên văn trong source.
- **"design annotation (source-level)"** = assertion đọc source CSS/JS (pin
  cấu trúc/palette) vì happy-dom không tính layout thật; được ghi rõ trong
  chính tên test.
- **Screenshot: NOT_RUN cho toàn bộ 24 dòng** — môi trường sandbox không có
  trình duyệt chụp ảnh; KHÔNG dùng PNG Stitch gốc giả làm bằng chứng
  implementation (đúng điều khoản mục 6 handoff 05).
- Web gốc chỉ có 4 frame (`designs/web/stitch-original/`: web_f04_01_so_n_l_i_nh_n,
  web_f04_02_chu_n_b_d_ng_ai_consent, web_f04_04_xem_v_s_a_g_i,
  web_f04_05_p_d_ng_ch_a_g_i) — dùng làm design annotation cho hierarchy/palette;
  mọi state còn lại được suy ra từ brief + frame Zalo + contract như handoff
  yêu cầu, không tạo route/ảnh trùng vô nghĩa (nhiều state trong cùng route
  `#/compose` / `#/messages/:id`).

## 0.1 Skill thiết kế — đã đọc / áp dụng / loại bỏ

- Đã đọc: `.agents/skills/family-bridge-ui/SKILL.md`,
  `docs/engineering/ui-rules.md`, `docs/engineering/taste-skill-integration.md`
  (bảng giới hạn), handoff 03 §4 (sai khác phải sửa) + handoff 05 toàn bộ,
  text HTML của các frame Zalo đại diện (02/03/05/09/cg_02/cg_03–cg_06).
- Áp dụng: consent/preview/no-auto-send invariants; touch ≥44px; focus visible;
  Vietnamese labels; state loading/empty/error/disabled/success đầy đủ;
  palette bắt buộc handoff 6 màu (`#FFF4E8/#713D32/#C65B43/#E4AB56/#A84733/#FAF0E4`)
  normalize scope trong `[data-page="f06-compose"]` + `.fb-ai-assist`
  (`web/src/styles/shell.css`, `web/src/styles/components.css` — không đổi
  token toàn cục).
- Loại bỏ (theo taste-skill-integration + handoff 03 §4): hero/ảnh trang trí
  (compose không `<img>`, không `background-image` — pinned bởi test), font/
  dependency mới, animation nặng, dark mode, marketing pre-flight. Lý do: form
  nhạy cảm + chuẩn repo; các lớp loại bỏ được pin bởi test
  "responsive/palette smoke (source-level)".

## 1. Bảng 24 frame nguồn (bắt buộc)

| # | Frame Zalo nguồn (`designs/zalo-mini-app/stitch-original/…`) | Use case / actor / state + disposition | Counterpart web (file + hàm / class thật) | Backend capability / endpoint / DTO / guard | Evidence (test case ID thật) + loại | Screenshot | Status |
|---|---|---|---|---|---|---|---|
| 01 | `zalo_f04_01_kb_so_n_l_i_nh_n_b_n_ph_m_m` | HS soạn lời nhắn — biến thể keyboard-open; khả năng dùng mobile-web thật khi bàn phím mở (KHÔNG vẽ bàn phím giả). F04 bắt buộc | Route `#/compose` — `web/src/pages/compose/index.js` `renderCompose()`; textarea native `#fb-compose-body` (IME thật); grid `.fb-compose-grid` chỉ ≥1024px, <1024px 1 cột (`shell.css` `@media (min-width: 1024px)`); không chrome Zalo | Không cần endpoint mới (biến thể local-only); cùng bộ endpoint dòng 02; `maxlength 4000` khớp f06 | `f04-ai-parity.test.mjs` › "responsive/palette smoke (source-level): grid 2 cột chỉ >=1024px; palette F04 đủ 6 màu; touch 44px; không hero ảnh" (assertion pin "không fake keyboard") — DOM test source-level | NOT_RUN | PASS |
| 02 | `zalo_f04_01_so_n_l_i_nh_n` | HS soạn lời nhắn — trạng thái gốc: viết, đếm ký tự, lưu nháp riêng. F04 bắt buộc | `renderCompose()`: editor card + counter + `onSaveDraft()` → `createDraft`/`editDraft`; chip "Bản nháp riêng tư • Chưa gửi"; privacy row "Riêng tư theo thiết kế" (đã bỏ claim tuyệt đối) | `POST /api/v1/drafts` (create) + `POST /api/v1/drafts/{id}` (edit — C8 kind-optional, f06, revision máy chủ); `GET /api/v1/drafts` (pause + `server_time`); nháp author-only | `web-screens.test.mjs` › "demo: lưu nháp -> pause -> vòng đếm SVG + textarea niêm phong + preview vẫn chặn"; `f04-ai-parity.test.mjs` › "503/timeout khi refine -> panel lỗi trung thực, bản soạn nguyên, lưu nháp vẫn chạy" — DOM test | NOT_RUN | PASS |
| 03 | `zalo_f04_02_ch_n_n_i_dung_ai` | HS bấm dùng AI — dialog khai phạm: nói rõ dữ liệu gì gửi đi trước request AI đầu tiên. F04 bắt buộc | `web/src/components/ai-assist.js` `createAiAssist()` — CTA `.fb-compose__ai-btn` + chip "Riêng tư"; `openConsentSheet()` lead: "máy chủ Family Bridge sẽ gửi đoạn text đang soạn (kèm số thứ tự lần chỉnh sửa) tới dịch vụ Gemini của Google — BÊN XỬ LÝ KỸ THUẬT"; không auto-generate | `POST /api/v1/ai/refine` body `{original_text, purpose:"refine_expression", input_revision?}` + `X-Idempotency-Key` (shared `http-endpoints.js` `aiRefine`) | `web-screens.test.mjs` › "F04: consent gate -> 'Đồng ý và tạo gợi ý' -> aiRefine(key+inputRevision) -> suggested_text; 'Dùng gợi ý' -> aiAccept + chỉ điền textarea" (assert sheet nêu Gemini, cấm "riêng tư tuyệt đối"/"mã hóa") — DOM test | NOT_RUN | PASS |
| 04 | `zalo_f04_03_th_ng_b_o_ng_ai` | HS — sheet thông báo dùng AI: đồng ý / từ chối, rút lại được. F04 bắt buộc | `openConsentSheet()` (`.fb-ai-consent`, desktop `.fb-sheet--dialog` ≥1024px / mobile bottom sheet); `findActiveAiConsent()`; accept → `adapter.recordConsent({purpose, policyVersion, decision:"accepted"})`; decline "Tiếp tục viết tay" → `recordDeclineQuietly()`; 403 `consent_required` → mở lại sheet (không loop) | `GET/POST /api/v1/consents` `{purpose:"ai_processing", policy_version:"ai-v1"}`; guard server `has_active_consent()` (f01); version từ shared `policy.js` | `f04-ai-parity.test.mjs` › "chưa consent -> sheet disclosure; decline -> recordConsent(declined) + manual vẫn dùng được, không gọi refine"; "403 consent_required sau khi consent bị rút -> sheet mở lại; đồng ý -> recordConsent(accepted) rồi refine, không loop vô hạn"; "consent sai phiên bản policy (current=false) -> phải hỏi lại, không tự coi là đã đồng ý" — DOM test | NOT_RUN | PASS |
| 05 | `zalo_f04_04_ang_t_o_g_i` | HS — loading "Đang tạo gợi ý": không khóa gõ/lưu nháp/help, không gọi lặp, CÓ nút Hủy chờ. F04 bắt buộc | `createAiAssist()` `renderPanel("loading")` — `.fb-ai-assist__loading` + skeleton + nút **"Hủy chờ gợi ý"** (`.fb-compose__ai-cancel`) → `onCancelWait()`: hủy chờ cục bộ (`refineSeq`), response muộn bị bỏ qua, KHÔNG tự retry, không hủy máy chủ; CTA khóa trong lúc chờ + `refineWaiting` chặn gọi lặp | `POST /api/v1/ai/refine` pending; replay theo key ở server khi cần; một lượt = một key mới | `f04-ai-parity.test.mjs` › "loading có 'Hủy chờ gợi ý' (frame 04): hủy cục bộ -> response cũ bị bỏ qua, không tự retry, bấm lại là lượt mới (key mới)" (test thêm bởi A4-FINISH); "deferred response + user đổi text trước khi response về -> STALE…" (loading inline không chặn gõ) — DOM test | NOT_RUN | PASS (sau vá A4-FINISH; trước vá: PARTIAL — thiếu nút hủy chờ so với semantics Zalo A3) |
| 06 | `zalo_f04_05_xem_g_i` | HS — xem gợi ý: original riêng của author + suggestion của máy chủ, chưa gửi. F04 bắt buộc | `renderPanel("suggestion")` — `.fb-compose__ai-suggestion`; `.fb-compose__ai-suggest-text` = `suggested_text` qua `textContent` (SEC-12, cấm innerHTML); `.fb-ai-assist__original` "Bản gốc của bạn:" | DTO `AiSuggestion.view()` NGUYÊN: `suggestion_id, purpose, status, original_text, suggested_text, model_revision, prompt_revision, input_revision?, created_at, decided_at`; original/suggestion author-only | `f04-ai-parity.test.mjs` › "apply/discard không gọi confirmDraftSend/sendMessage; suggestion chứa HTML -> render textContent thuần" — DOM test | NOT_RUN | PASS |
| 07 | `zalo_f04_06_kb_s_a_v_p_d_ng_b_n_ph_m_m` | HS — sửa & áp dụng gợi ý, keyboard-open variant (sửa tiếp bằng bàn phím thật sau apply). F04 bắt buộc | Cùng editor `#fb-compose-body` — `onAccept()` điền `textarea.value` (không innerHTML) + dispatch input; `revision` tăng mỗi input event; mobile-web dùng bàn phím thật, không route mới | `input_revision` echo (nullable) trong DTO; revision client tăng đơn điệu theo event; f06 revision bump ở máy chủ khi lưu | `f04-ai-parity.test.mjs` › "inputRevision tăng theo TỪNG keystroke (input event) và gửi kèm refine (C4)"; responsive smoke (dòng 01) — DOM test | NOT_RUN | PASS |
| 08 | `zalo_f04_06_s_a_v_p_d_ng` | HS — áp dụng "Dùng gợi ý" / "Bỏ": quyết định một chiều, KHÔNG gửi, KHÔNG tạo Message. F04 bắt buộc | `onAccept()` → `adapter.aiAccept(id)` → điền + note "chưa lưu nháp và chưa gửi"; `onDiscard()` → `adapter.aiDiscard(id)` giữ nguyên text; busy guard double-click | `POST /api/v1/ai/suggestions/{id}/accept` / `…/discard` (author-only, một chiều); accept/discard không đụng drafts/messages | `web-screens.test.mjs` › "F04: consent gate … 'Dùng gợi ý' -> aiAccept + chỉ điền textarea"; "F04: 'Bỏ' -> aiDiscard, textarea giữ nguyên…"; `f04-ai-parity.test.mjs` C6 — DOM test | NOT_RUN | PASS |
| 09 | `zalo_f04_07_g_i_c` | HS — gợi ý lỗi thời (stale): sửa text sau khi tạo gợi ý → chặn áp dụng đè lên bản mới. F04 bắt buộc | Banner `.fb-ai-assist__stale` "Nội dung đã thay đổi kể từ khi tạo gợi ý"; "Dùng gợi ý" DISABLED; nút "Tạo gợi ý mới" (`runRefine()` lượt mới); `onAccept()` re-check `boundRev !== revision` TẠI THỜI ĐIỂM BẤM | `input_revision` echo server; ràng buộc revision là client-side guard — KHÔNG cần endpoint mới (local state) | `f04-ai-parity.test.mjs` › "deferred response + user đổi text trước khi response về -> STALE: banner + khoá 'Dùng gợi ý' + còn 'Tạo gợi ý mới' + manual giữ nguyên"; "response về OK rồi user sửa text TRƯỚC lúc bấm apply -> apply bị chặn (kiểm tra revision tại thời điểm bấm)" — DOM test | NOT_RUN | PASS |
| 10 | `zalo_f04_08_ai_l_i_kh_ng_b_t` | HS — AI tắt / lỗi (503, quota 429, timeout, status lỗi mạng): trung thực + manual path còn nguyên. F04 bắt buộc | `describeAiError()` → `.fb-ai-assist__error` (role=alert); `aiStatus()` off → CTA disabled + `offNote` nêu lý do; lỗi mạng → disabled + `unknownNote` (không giả off/on); lưu nháp/preview/help không bị chặn | `GET /api/v1/ai/status` `{ai_enabled}` (kill switch `FB_AI_ENABLED` fail-closed); 429/503/timeout map thông báo, không fallback giả | `f04-ai-parity.test.mjs` › "503/timeout khi refine -> panel lỗi trung thực, bản soạn nguyên, lưu nháp vẫn chạy"; "aiStatus lỗi mạng -> nút disabled + 'chưa kiểm tra được' (không giả AI off, không giả AI on)" — DOM test | NOT_RUN | PASS |
| 11 | `zalo_f04_09_ch_n_ng_i_nh_n` | HS — chọn người nhận: chỉ kết nối active, không tự gửi sau khi chọn. F04 bắt buộc | `openRecipientSheet()` (sheet "Chọn người nhận", lọc `status === "active"`) + `refreshRecipientUi()`; pill "Đổi" `.fb-compose__change-btn`; rỗng → dẫn `#/connect` | `GET /api/v1/connections` (active two-way); `recipient_id` gắn draft; quyền participant do backend chốt | `f04-ai-parity.test.mjs` › "chọn người nhận: sheet chỉ liệt kê kết nối active; chọn -> hiện đúng người, không tự gửi (frame 09)" — DOM test | NOT_RUN | PASS |
| 12 | `zalo_f04_10_xem_tr_c_v_x_c_nh_n` | HS — xem trước final + xác nhận gửi cuối cùng (nút nêu rõ người nhận). F04 bắt buộc | `onPreview()` → `adapter.previewDraft()` → `openConfirmSheet()` (`.fb-compose__preview-body`, "Gửi cho {tên}", "Giữ lại làm nháp"); sửa nội dung sau preview → `preview_stale` phải preview lại | `POST /api/v1/drafts/{id}/preview` (chỉ sau deadline; gắn revision/recipient/hash) → `POST /api/v1/drafts/{id}/confirm-send` tách bước | `f04-ai-parity.test.mjs` › "receipt 'sent': chỉ sau response thành công…" + "receipt 'sent' khi máy chủ xác nhận…" (cả hai đi qua preview → sheet → confirm) — DOM test | NOT_RUN | PASS |
| 13 | `zalo_f04_11_kho_ng_d_ng_5_ph_t` | HS — khoảng dừng bình tâm 300s do máy chủ quyết; hết giờ KHÔNG tự gửi. F04 bắt buộc | Pause card: `onTogglePause()` → `pauseDraft`/`cancelDraftPause`; `refreshPauseUi()` — ring SVG + badge tính từ `remaining_seconds`/deadline máy chủ, KHÔNG timer (DSA-10); preview disabled tới khi máy chủ mở; lỗi `cooldown_active` → báo remaining; textarea niêm phong khi paused | F06 pause 300 server-fixed (`deadline`, `remaining_seconds`, `can_preview`); preview trước deadline → 403 `cooldown_active` + `details.remaining_seconds` | `web-screens.test.mjs` › "demo: lưu nháp -> pause -> vòng đếm SVG + textarea niêm phong + preview vẫn chặn"; "không thêm setInterval vào compose (DSA-10) — bất biến QA giữ nguyên"; `f04-ai-parity.test.mjs` › "receipt 'sent': … máy chủ báo hết giờ -> preview mở" — DOM test | NOT_RUN | PASS |
| 14 | `zalo_f04_12_k_t_qu_g_i` | HS — kết quả gửi: sending / sent / unknown theo response thật, không tự retry. F04 bắt buộc | `openConfirmSheet()` confirmBtn → "Đang gửi…" (sending, chặn double-click); `renderSendReceipt()` — `.fb-compose__receipt--sent` "Máy chủ xác nhận lời nhắn đã được trao gửi" / `--unknown` "KẾT QUẢ CHƯA XÁC ĐỊNH" + "Kiểm tra trạng thái mới nhất"; sent → reset composer | `POST /api/v1/drafts/{id}/confirm-send` (+idempotency); lỗi/không response → không gửi lại bằng key mới: compose re-check qua nút "Kiểm tra trạng thái mới nhất" dispatch HashChangeEvent → reload trang (re-fetch `listDrafts` — không gọi lại confirm); `lookupOperation` (`GET /operations/{key}`) chỉ ở đường reply (message/index.js `onLookup`) | `f04-ai-parity.test.mjs` › "receipt 'sent': chỉ sau response thành công; receipt 'unknown' khi lỗi -> không tự retry, có nút kiểm tra"; "receipt 'sent' khi máy chủ xác nhận; reset về bản soạn mới" — DOM test | NOT_RUN | PASS |
| 15 | `zalo_f04_13_tr_l_i_c_ai` | HS/PH — trả lời thư với AI: cùng consent/review/revision như composer; gửi bằng tay qua xác nhận. F04 bắt buộc | Route `#/messages/:id` — `web/src/pages/message/index.js` `renderThread()`: khung "Phản hồi thư này" + `createAiAssist({copy: AI_COPY.reply})` trong `.fb-msg-ai`; gửi `sendMessage({kind:"text", replyTo, key})` qua nút "Gửi phản hồi" | `POST /api/v1/messages` `{kind:"text", recipient_id, body, reply_to}` + `X-Idempotency-Key`; AI contract giống dòng 03–10 (cùng component) | `f04-ai-parity.test.mjs` › "message reply dùng CÙNG khối assist + suggested_text (parity 2 chiều frame 13)"; `web-screens.test.mjs` › "F04 reply AI: consent cấp sẵn -> aiRefine(key+inputRevision) -> suggested_text; … không tự gửi" — DOM test | NOT_RUN | PASS |
| 16 | `zalo_f04_14_ng_i_nh_n_c_final` | Người nhận — đọc final: chỉ thấy lời nhắn cuối được gửi; KHÔNG thấy AI riêng tư của sender. F04 bắt buộc | `renderThread()`: bong bóng `.fb-msg-bubble--sent/--received` body qua `textContent`; không render suggestion/original của người gửi; note "Hệ thống không theo dõi việc xem thư"; `markMessageRead` CHỈ `direction==="received" && !read` | `GET /api/v1/messages/{id}` participant-only; `POST /api/v1/messages/{id}/read` recipient-only; không có read-receipt hai chiều | `web-screens.test.mjs` › "thread render body thật; bong bóng theo direction; markRead CHỈ received-unread"; "thư gửi đi (sent + đã đọc): KHÔNG gọi markMessageRead; bong bóng --sent" — DOM test | NOT_RUN | PASS |
| 17 | `zalo_f04_cg_01_kb_ng_i_ch_m_s_c_so_n_l_i_nh_n_b_n_ph_m_m` | Người chăm sóc soạn lời nhắn — keyboard variant (dùng mobile-web thật). F04 bắt buộc | Cùng route `#/compose`, vai từ `store.role === "caregiver"` → `isCaregiver` trong `renderCompose()`; `editorCopy` "Lời bạn muốn gửi"; responsive như dòng 01 | Như dòng 02 (cùng endpoints, cùng quyền theo session role) | `f04-ai-parity.test.mjs` › "caregiver: CÙNG component/classes, copy xưng hô khác ('Lời bạn muốn gửi')" + responsive smoke (dòng 01) — DOM test | NOT_RUN | PASS |
| 18 | `zalo_f04_cg_01_ng_i_ch_m_s_c_so_n_l_i_nh_n` | Người chăm sóc soạn lời nhắn — trạng thái gốc. F04 bắt buộc | `renderCompose()` nhánh `isCaregiver` (label + placeholder riêng), cùng editor/save/AI | Như dòng 02 | Cùng test caregiver ở dòng 17 — DOM test | NOT_RUN | PASS |
| 19 | `zalo_f04_cg_02_kb_ng_i_ch_m_s_c_s_a_v_p_d_ng_b_n_ph_m_m` | Người chăm sóc xem & áp dụng gợi ý — keyboard variant. F04 bắt buộc | Cùng `createAiAssist()` với `AI_COPY.caregiver` (truyền theo vai trong `renderCompose()`); apply/stale/loading/error như HS; keyboard = mobile-web thật | Như dòng 06–09 | `f04-ai-parity.test.mjs` › caregiver test mở gợi ý thật: "caregiver dùng được AI với cùng semantics" + dòng 05/09 tests — DOM test | NOT_RUN | PASS |
| 20 | `zalo_f04_cg_02_ng_i_ch_m_s_c_xem_g_i_th_u_c_m` | Người chăm sóc xem gợi ý chuyển hóa ngôn từ — trạng thái gốc. F04 bắt buộc | Như dòng 19 (không keyboard) — cùng component, cùng semantics | Như dòng 06–09 | Cùng test caregiver — DOM test. Ghi chú trung thực: `AI_COPY.caregiver` hiện role-neutral (giống student); khác biệt xưng hô nằm ở label editor — xem rủi ro §3.4 | NOT_RUN | PASS |
| 21 | `zalo_f04_cg_03_trung_t_m_ng_i_ch_m_s_c_ng_h_nh` | Hub "Góc người chăm sóc" (nhịp cảm xúc tuần, trạng thái kết nối) — KHÔNG thuộc 3 nhóm luồng F04. **LAYOUT REFERENCE ONLY** | Không có route tương đương trên web và KHÔNG tự tạo; chỉ mượn nhịp layout thẻ `.fb-scard` nếu sau này có hub thật | Không endpoint — cấm tự tạo service/API tư vấn (handoff 05 dòng 21) | design annotation (text HTML frame đã đọc; không code, không test) | NOT_RUN | LAYOUT-ONLY |
| 22 | `zalo_f04_cg_04_t_l_ch_t_v_n_t_m_l_1_1` | Tư vấn tâm lý 1-1 (đặt lịch chuyên gia, claim "Bảo mật tuyệt đối • Cuộc gọi mã hóa") — ngoài 3 nhóm luồng F04. **OUT OF SCOPE** | Không triển khai — claim riêng tư/mã hóa trong frame vi phạm truthfulness (handoff 03 §4 cấm); giữ reference nguyên vẹn trong ZIP | Không endpoint — cấm tự mở dịch vụ tư vấn/booking | design annotation (phân loại theo handoff 03/05) | NOT_RUN | OUT-OF-SCOPE |
| 23 | `zalo_f04_cg_05_t_l_ch_th_nh_c_ng_h_ng_d_n_chu_n_b` | Xác nhận đặt lịch tham vấn ("Mã lịch hẹn FB-2023-8892", chuyên gia) — dữ liệu mẫu không có contract. **OUT OF SCOPE** | Không triển khai — không có endpoint appointment; cấm bịa mã hẹn/lịch để giống ảnh | Không endpoint | design annotation | NOT_RUN | OUT-OF-SCOPE |
| 24 | `zalo_f04_cg_06_ph_ng_th_nghi_m_thi_t_b_tr_c_gi_g_i` | Thử nghiệm thiết bị trước buổi gọi — phụ thuộc dịch vụ tư vấn ở dòng 22–23. **OUT OF SCOPE** | Không triển khai | Không endpoint | design annotation | NOT_RUN | OUT-OF-SCOPE |

## 2. Tổng hợp

| Nhóm | Số dòng | Dòng |
|---|---|---|
| Counterpart web F04 bắt buộc (có code + test) | **20** | 01–20 |
| Layout-only (tham khảo layout, không tạo service) | **1** | 21 |
| Out-of-scope (tư vấn/booking ngoài F04, giữ reference) | **3** | 22, 23, 24 |
| Tổng | **24** | — |

Trạng thái trước vá A4-FINISH: **19 PASS / 1 PARTIAL (dòng 05 — loading thiếu
nút "Hủy chờ gợi ý") / 0 MISSING**. Sau vá (thêm nút hủy chờ + test):
**20 PASS / 0 PARTIAL / 0 MISSING**. Không có dòng bị gán PASS rỗng: mọi dòng
PASS đều trỏ tới test case thật đang xanh.

Kiểm chứng chất lượng đã chạy (A4-FINISH):

- `grep refined_text web/` (trừ node_modules/dist) = **0 hit**.
- Copy cấm ("riêng tư tuyệt đối" / "mã hóa" / "chưa lưu lên máy chủ") trong
  `web/src` = chỉ còn **comment** ghi chú điều cấm (`ai-assist.js`,
  `components.css`, `signal/index.js`) — không có copy hiển thị cho người dùng.
- `innerHTML` trong `compose/`, `message/`, `ai-assist.js` = chỉ comment cấm
  (SEC-12); mọi text AI/máy chủ render qua `textContent` (h()).
- Media query mobile: `shell.css` `@media (max-width: 767px)` (+319px/479px);
  grid 2 cột chỉ trong `@media (min-width: 1024px)` — pinned bởi test.
- Biến thể caregiver: `editorCopy` xưng hô khác theo vai + `AI_COPY.caregiver`
  truyền vào cùng component — pinned bởi test.
- `cd web && npm test` → **208/208 PASS, 41 suites** (trước vòng review-fix
  F04-FIX-WEB: 204/204 — thêm 4 test: R3A4-01 accept-inflight, R2A3-01 web
  preview-không-bắt-buộc-pause ×2, R4A5-03 preview-dùng-bản-đã-sửa;
  trước vá A4-FINISH: 203/203).
- `cd web && npm run build` → **PASS** (`vite build` ✓ built).

## 3. Rủi ro còn lại cho peer-review (A5 + A3 phản biện interaction)

1. **IME tiếng Việt ⇄ inputRevision**: revision tăng theo từng `input` event
   (kể cả IME composition) — trung thực về "nội dung thật sự đổi", nhưng với
   bộ gõ Telex/VNI một từ có thể sinh nhiều event; nếu user gõ trong lúc
   response đang bay thì gợi ý dễ rơi vào stale (an toàn nhưng có thể gây khó
   chịu). Đã có test cả hai hướng; cần smoke trên keyboard thật mobile.
2. **Hủy chờ tạo key mới**: "Hủy chờ gợi ý" là hủy cục bộ (giống Mini App A3)
   — server có thể hoàn thành provider call của lượt cũ trong khi client đã
   mở lượt mới (key mới). Nếu sau này có quota/lượt theo user, phải đếm theo
   `suggestion_id` ở server, không theo key client.
3. **Caregiver copy drift giữa 2 client**: web giữ `AI_COPY.caregiver`
   role-neutral (xưng hô khác nằm ở label editor) trong khi Zalo A3 dùng copy
   riêng trong 2 file; nếu sửa copy một phía phải đối chiếu phía kia
   (không có shared copy source).
4. **Consent shape GET /consents**: `findActiveAiConsent()` (web) và
   `evaluateAiConsent()` (Zalo, nhân bản ở 2 file) đọc
   `decision/withdrawn/current/policy_version`; nếu A1 bổ sung canonical
   "current policy" thì cả hai phía phải đối chiếu lại (hiện khớp
   `policy.js` `ai-v1`).
5. **Screenshot implementation: NOT_RUN** — nghiệm thu visual phải chờ môi
   trường chụp ảnh; hiện chỉ có DOM/source-level test + build.

## 4. Yêu cầu cho A1/coordinator (không tự sửa ngoài ownership)

- **packages/family_bridge_shared/: KHÔNG yêu cầu thay đổi** — contract v1
  (`suggested_text`, `input_revision` echo, `consent_required`,
  `aiStatus/aiRefine/aiAccept/aiDiscard`, consents, drafts preview/confirm)
  đã đủ cho toàn bộ 20 counterpart; mock + http-endpoints của A1 khớp UI.
- Nếu coordinator nới ownership zalo-mini-app: gộp AI logic nhân bản
  compose↔message của A3 thành 1 component (web đã làm mẫu với
  `web/src/components/ai-assist.js`) để giảm drift risk.
- Live Gemini smoke (GEMINI_API_KEY) vẫn BLOCKED/NOT_RUN — thuộc A2/coordinator,
  không phải điều kiện nghiệm thu parity UI.

## 5. Phân công ghi nhận

- Tác giả: **A4** (phiên trước — implement web compose/message/ai-assist/CSS/tests)
  + **A4-FINISH** (phiên này — file parity này, vá "Hủy chờ gợi ý" frame 04 +
  test, kiểm chứng chất lượng, chạy test/build).
- Phản biện interaction: **A3** *(placeholder — chờ A3 xác nhận mapping
  frame→component khớp semantics Zalo đã ghi worklog)*.
- Review contract: **A1 / A2** *(placeholder — chờ xác nhận cột backend khớp
  contract freeze v1 và backend đã land)*.
- Verify test: **A5** *(placeholder — chờ rerun độc lập `cd web && npm test`
  và đối chiếu 24 dòng)*.
