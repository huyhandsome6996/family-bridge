# F04 — Peer-review vòng 1: A3 review phần Web UI của A4 (parity interaction/role Zalo ⇄ Web)

- **Reviewer:** A3 (tác giả phần Zalo Mini App F04 — compose/message/family_bridge_mobile f04_ai)
- **Được review:** A4 — web compose/message + `components/ai-assist.js` + CSS + tests
- **Thời điểm:** 2026-10-16 ~19:20 UTC (rerun test độc lập 19:13 UTC)
- **Branch:** `tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033` (baseline `72930ae`, working tree, chưa commit)
- **Phạm vi:** parity interaction + role giữa web (A4) và Zalo Mini App (A3 — reference semantics);
  **KHÔNG sửa source**; chỉ chạy test/build và viết file này.
- **Phương pháp:** đọc `git diff origin/main -- web/` + toàn văn `ai-assist.js`/`compose/index.js`/
  `message/index.js`/CSS/2 file test; đối chiếu từng điểm với source Zalo của A3; rerun
  `npm test` + `npm run build`; grep kiểm chứng copy. Mức kiểm chứng: **DOM/source-level + test** —
  không có browser thật/chụp ảnh (nhất quán với cột Screenshot NOT_RUN của parity doc).

## 1. Bảng findings

| ID | Vị trí (file:line) | Hypothesis | Expected (reference = Zalo của A3) | Actual (web của A4) | Severity | Disposition |
|---|---|---|---|---|---|---|
| R3A4-01 | `web/src/components/ai-assist.js:520-544` (`onAccept`) ⇄ `zalo-mini-app/src/pages/compose/index.js:818-854` + `zalo-mini-app/src/pages/message/index.js:704-734` | Nếu user gõ tiếp trong lúc `aiAccept` đang bay, web có điền đè gợi ý lên nội dung mới hơn không? | Chặn điền đè: capture `revisionAtClick` TẠI LÚC BẤM, sau khi `aiAccept` resolve re-check `revision !== revisionAtClick` → chuyển stale + KHÔNG điền (Zalo làm guard này ở CẢ HAI file compose + message) | Web chỉ re-check revision TẠI LÚC BẤM; sau `await aiAccept` điền thẳng `textarea.value = suggested_text` + dispatch input, không xem revision đã đổi trong roundtrip → nội dung user vừa gõ bị ghi đè mất. Kèm nit: trong lúc accept đang bay nút "Dùng gợi ý" không bị disabled (busy-guard chỉ nuốt click lặp âm thầm), khác Zalo (khóa nút qua re-render) | **Medium** | **CHANGES-REQUESTED** — vá nhỏ đối chiếu Zalo (capture `revisionAtClick` + re-check sau await, giữ thẻ ở trạng thái stale) + thêm 1 test "gõ trong lúc accept đang bay → không điền đè" (lưu ý: Zalo cũng CHƯA có test cho ca này — nên thêm cả 2 phía) |
| R3A4-02 | `web/src/components/ai-assist.js:232-234` + `271-318` ⇄ `zalo-mini-app/src/pages/compose/index.js:390-394` | Sửa text khi thẻ gợi ý đang mở → banner stale + khóa "Dùng gợi ý" có hiện NGAY không? | Zalo re-render thẻ gợi ý tại MỖI input event khi `ai.suggestion` còn → banner + disabled tức thì khi user gõ | Web listener input chỉ `revision += 1`, không re-render panel → banner/khóa chỉ xuất hiện khi user bấm "Dùng gợi ý" (bị chặn đúng, nhưng tín hiệu UI chậm hơn Zalo). Dữ liệu vẫn an toàn nhờ re-check tại lúc bấm (R3A4-01 là lỗ hổng còn lại của chính cơ chế này) | Low | Khuyến nghị fix chung với R3A4-01 (trong `onInput`, nếu `current` tồn tại → re-render panel theo revision mới) hoặc nếu chấp nhận thì sửa parity doc dòng 09 để nói rõ "DISABLED áp lúc render/lúc bấm, không phải tức thì khi gõ" |
| R3A4-03 | `docs/features/f04/web-zalo-parity.md` dòng 70 (row 14, cột backend) ⇄ `web/src/pages/compose/index.js:547-551` + `web/src/pages/message/index.js:364-380` | Đường "Kiểm tra trạng thái mới nhất" có đúng là tra cứu operation? | Doc ghi "lỗi/không response → tra cứu operation (`lookupOperation`)" | Ở compose, nút này dispatch `HashChangeEvent` → reload trang (re-fetch `listDrafts`) — vẫn trung thực, không tự retry; `lookupOperation` chỉ được dùng ở đường reply (message). Doc gộp hai đường thành một | Nit | A4 chỉnh 1 dòng doc (phân biệt: compose re-check bằng reload/listDrafts; reply tra cứu `/operations/{key}`). Không chặn |
| R3A4-04 | `web/src/components/ai-assist.js:42-114` (`AI_COPY.caregiver`) | Copy AI variant theo vai (xưng hô) có thật ở web không? | — | `AI_COPY.caregiver` trùng từng chữ `AI_COPY.student` (không khác xưng hô trong khối AI); khác biệt vai chỉ nằm ở label/placeholder editor (`compose/index.js:218-226`, "Lời bạn muốn gửi" ⇄ "Lời con muốn gửi"). Điều này ĐÃ được parity doc công khai (row 20 + risk §3.3). So với Zalo: compose/message của A3 KHÔNG có variant vai nào trong khối AI (grep `caregiver` trong 2 file Zalo = 0 hit) → web là superset, không phải lệch parity | Info | Giữ nguyên; khi sửa copy một phía phải đối chiếu phía kia (không có shared copy source — đúng rủi ro §3.3 đã ghi) |
| R3A4-05 | `web/src/components/ai-assist.js:357-367, 402-411, 414-439` ⇄ `zalo-mini-app/src/pages/compose/index.js:625-666, 760-767` | Decline/accept parity có cùng semantics không? | Zalo: decline chỉ đóng sheet (KHÔNG ghi máy chủ); mỗi lần click sau re-query `listConsents` | Web: decline ghi `decision:"declined"` best-effort (`recordDeclineQuietly` — superset, khớp ledger C3) + cache `declined` trong phiên → lần click sau mở lại sheet TRỰC TIẾP không re-query. Cả hai đều không loop 403 (web còn có `fromConsent` chặn vòng 2 lần gọi) | Info | Chấp nhận — web ≥ Zalo về sổ cái đồng ý; nếu A1 đổi shape consents thì đối chiếu cả hai phía (risk §3.4) |
| R3A4-06 | Apply-time consent recheck (cả 2 client) | Revoke sau refine-201 nhưng trước lúc bấm apply thì sao? | Câu hỏi mở 4.2 của A5 (chưa có return-word từ A2/A3/A4) | Web = Zalo: chỉ mở lại sheet khi refine/apply gặp 403 `consent_required`; không recheck chủ động trước apply. Suggestion đã sinh hợp lệ trước revoke vẫn được điền | Info | Trùng **D-04** trong `docs/features/f04/peer-review.md` — không phải lệch parity web↔zalo (hai phía giống nhau); chờ A2 trả lời mục 4.2 |

## 2. Các điểm kiểm tra ĐẠUT (PASS) — đối chiếu 1:1 với semantics Zalo

| # | Điểm (task review 3a–3e) | Bằng chứng |
|---|---|---|
| 1 | `suggested_text` duy nhất — grep `refined_text` toàn `web/` = **0 hit** | Đúng như parity doc §2 ghi; component chỉ đọc `dto.suggested_text` (`ai-assist.js:287,534`) |
| 2 | `inputRevision` bắt đầu 1, tăng MỖI input event (kể cả IME), gửi kèm refine | `ai-assist.js:197,232-234,481-483`; test `f04-ai-parity.test.mjs:262-286` (3 events → revision 4) — khớp Zalo (`compose:277-279,390-392`) |
| 3 | Stale: banner + disable apply + re-check TẠI LÚC BẤM + còn "Tạo gợi ý mới" | `ai-assist.js:271-318,520-528`; 2 test `:196-234,236-260` — khớp Zalo frame 07 (trừ cửa sổ in-flight ở R3A4-01 và tín hiệu tức thì ở R3A4-02) |
| 4 | Hủy chờ (frame 04): nút "Hủy chờ gợi ý", hủy cục bộ, response muộn bị bỏ qua, không tự retry, bấm lại = lượt mới (key mới), loading không chặn gõ/lưu nháp/help | `ai-assist.js:244-261,456-465,467-518`; test `:439-498` (assert cả key mới ≠ key cũ); loading inline trong panel phải, textarea không bao giờ disabled — khớp Zalo `compose:538-552,610-614` |
| 5 | Consent sheet: disclosure nêu rõ Gemini + "BÊN XỬ LÝ KỸ THUẬT" + policy `ai-v1`; decline → manual còn nguyên; accept → `recordConsent(accepted)` rồi refine; 403 `consent_required` → sheet mở lại KHÔNG loop; sai policy version (current=false / lệch version) → hỏi lại | `ai-assist.js:329-439,504-515`; test `:290-335,337-369,371-394` (helper `findActiveAiConsent` test 6 ca shape); khớp `policy.js` `ai-v1` — khớp Zalo `evaluateAiConsent` |
| 6 | Error/off trung thực: 503→"tạm không khả dụng", 429→busy, timeout→timeout, ≥500→unavailable; `aiStatus` off → disabled + lý do; lỗi mạng → disabled + "Chưa kiểm tra được" (không giả off/on); manual path luôn còn | `ai-assist.js:563-581,595-604` (shape `ApiError{status,kind,code}` khớp `packages/.../api/client.mjs:13-24`); test `:398-437` — khớp Zalo off-state `compose:508-537` |
| 7 | Không auto-generate; double-click/inflight guard (busyGuard theo key + `refineWaiting` + `sending.busy` + confirmBtn disabled khi sending) | `ai-assist.js:175-184,218,442-454`; `compose:755-791`; `message:320-362` |
| 8 | Unmount an toàn: `destroyHooks` ở cả compose lẫn message, response sau unmount bị bỏ qua, sheet consent đóng sạch | `compose:129-137,483-485`; `message:104-111,423`; test `:534-553` |
| 9 | Reply (frame 13) dùng ĐÚNG cùng component: `createAiAssist({copy: AI_COPY.reply})` → cùng revision/consent/stale/states; gửi bằng tay `sendMessage({kind:"text", replyTo, key})` key tạo tại nút bấm; không tự gửi sau apply | `message/index.js:302-303,414-424`; test parity `f04-ai-parity:671-704` + `web-screens` "F04 reply AI…" — khớp Zalo message (cùng guard/echo/stale, khác nhau chỉ ở chỗ Zalo nhân bản logic) |
| 10 | Caregiver: cùng component/classes, label "Lời bạn muốn gửi", chạy được refine đầy đủ | `compose:213-226,474-485`; test `:557-575` |
| 11 | Responsive: `.fb-compose-grid` 2 cột CHỈ trong `@media (min-width:1024px)` (`shell.css:1223-1234`), mobile 1 cột; `.fb-ai-assist__row` `flex-wrap`; không fake-keyboard/iframe/hero `<img>`/background-image; palette 6 màu handoff scope trong `[data-page="f06-compose"]` + `.fb-ai-assist` (không đổi token toàn cục) | CSS + test source-level `:639-669`; khớp claim row 01 parity doc |
| 12 | A11y: touch ≥44px — CTA AI (`components.css:2200-2206`), "Hủy chờ" (`:2250-2254`), base `.fb-btn` 44px, receipt-retry 44px; focus visible nhờ rule toàn cục `:focus-visible` (`base.css:96-99`); `role="alert"`/`role="status"`; mọi text AI/máy chủ qua `textContent` (SEC-12 — `h()` trong `app/dom.js`, `innerHTML` chỉ xuất hiện trong comment cấm) | Đã verify bằng source + charcode |
| 13 | Copy: **0** "riêng tư tuyệt đối"/"mã hóa"/quota/lượt/read-receipt trong copy hiển thị (chỉ còn comment điều cấm ở `ai-assist.js:16,25`, `components.css:2302`, `signal/index.js`); tiếng Việt có dấu; message trang ghi rõ "không theo dõi việc xem thư" | Scan tự động + đọc tay |
| 14 | Spot-check 5 dòng `web-zalo-parity.md` (01, 04, 05, 10, 12) — mọi tên hàm/class/test được trích đều TỒN TẠI thật: `renderCompose`, `.fb-compose-grid`, `openConsentSheet`/`findActiveAiConsent`/`recordDeclineQuietly`/`.fb-ai-consent`/`.fb-sheet--dialog`, `renderPanel("loading")`/`.fb-compose__ai-cancel`/`onCancelWait`, `describeAiError`/`.fb-ai-assist__error`, `renderSendReceipt`/`openConfirmSheet` + các test ID `it(...)` nguyên văn đều có trong 2 file test | **Không phát hiện dòng nào gán component/test bịa** (khác nhiều parity doc khác từng bị phàn nàn) |

## 3. Kiểm chứng độc lập đã chạy (A3, không qua tay A4)

| Lệnh | Kết quả |
|---|---|
| `cd web && npm test` | **204/204 PASS, 40 suites, 0 FAIL, 0 SKIP** (2026-10-16 ~19:13 UTC — khớp con số parity doc) |
| `cd web && npm run build` | **PASS** (`vite build` ✓ built in 291ms; chunk `ai-assist` tách riêng 15.13 kB) |
| grep `refined_text` `web/` (trừ node_modules/dist) | 0 hit |
| grep copy cấm trong `web/src` | chỉ comment điều cấm, không có copy hiển thị |

## 4. Kết luận

### **CHANGES-REQUESTED** (phạm vi hẹp — 1 finding Medium)

- **Bắt buộc trước khi gọi parity xong (R3A4-01):** `onAccept` trong `web/src/components/ai-assist.js`
  cần guard `revisionAtClick` sau khi `aiAccept` resolve — đối chiếu nguyên mẫu
  `zalo-mini-app/src/pages/compose/index.js:826-839` (Zalo đã đúng, web thiếu). Không guard này thì
  invariant cốt lõi của C4 ("gợi ý cũ không bao giờ ghi đè nội dung mới hơn") bị thủng trong cửa sổ
  roundtrip: user gõ trong lúc máy chủ ghi nhận accept sẽ mất chữ vừa gõ. Fix ~5 dòng + 1 test
  (Zalo cũng chưa có test cho ca này — khuyến nghị thêm cả hai phía để chặn drift).
- **Khuyến nghị làm cùng lúc (R3A4-02):** re-render panel stale ngay tại input event khi còn thẻ
  gợi ý (Zalo làm, web chưa) — hoặc ghi rõ trong parity doc dòng 09.
- **Nit/Info (R3A4-03..06):** không chặn — 1 dòng doc row 14; ghi nhận caregiver copy role-neutral
  (đã công khai trong doc), decline-recording là superset của Zalo, D-04 thuộc câu hỏi 4.2 cho A2.

Mọi điểm khác của checklist parity (C2/C4-stale/C5-hủy chờ/C3-consent/error-trung thực/
no-auto-send/double-click/unmount/reply/caregiver/responsive/a11y/copy) đều **PASS với bằng chứng
test thật**; parity doc trung thực (spot-check 5 dòng khớp code/test; số test 204/204 tái lập được).
Sau khi vá R3A4-01 (+R3A4-02 nếu nhận), reviewer khuyến nghị chuyển verdict sang APPROVE và A5
rerun `npm test` một lần nữa để chốt.

## 5. Ghi chú trung thực

- Review này là source/DOM-level + rerun test — **không có screenshot browser thật** (không thể
  trong sandbox; nhất quán với parity doc mục 0). IME/mobile thật vẫn cần smoke thủ công (risk §3.1).
- Không sửa bất kỳ file source nào của A4/A3 trong phiên review này; chỉ tạo file peer-review này.
- Đối chiếu "Zalo = reference" dựa trên working tree hiện tại của A3 trên cùng branch
  (`git diff origin/main -- zalo-mini-app/`), không phải bản đã release.
