# Peer review round 1 — A4 reviews A5 (chất lượng bằng chứng QA/tests + docs)

| | |
|---|---|
| Reviewer | A4 (Web/parity owner — vai trò được giao ở round 1: review phần QA/tests của A5) |
| Reviewed | A5(-FINISH) — `docs/features/f04/test.md` (ma trận T01–T20), `docs/features/f04/peer-review.md` (defect log D-01..D-06 + release gate), `tests/feature-lab/harness/tests/test_f04_e2e_a5.py` (28 test), `packages/family_bridge_shared/tests/test_f04_contract_a5.mjs` (13 test), kèm coverage UI F04 ở web/zalo làm đối chiếu |
| Commit-state | Working tree branch `tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033` (base `72930ae`, chưa commit — đúng quy định điều phối; 45 path modified/untracked) |
| Thời điểm review | 2026-10-16 ~19:20 UTC (sau A5-FINISH ~19:15 UTC) |
| Phạm vi | Review docs + test A5; được chạy lại test; KHÔNG sửa source; KHÔNG git commit/push |

---

## 1. Bảng findings

| ID | Khu vực / file:line | Hypothesis | Expected | Actual | Severity | Disposition đề xuất |
|---|---|---|---|---|---|---|
| R4A5-01 | `docs/features/f04/test.md` mục 0 (số liệu các lệnh) | Số test trong test.md có khớp chạy lại không? | Số ghi trong doc = số chạy thật | **9/11 lệnh được tôi chạy lại (rerun độc lập), 0 FAIL tuyệt đối.** 7/9 khớp CHÍNH XÁC (chi tiết mục 3). Lệch dương tính 2 dòng: #4 web `npm test` doc ghi **203 PASS**, chạy lại **204 PASS**; #7 substrate doc ghi **200 (197+3 SKIP)**, chạy lại **209 (206+3 SKIP)**. 3 SKIP của substrate khớp nguyên văn lý do (mysql race / live-Gemini opt-in / env-binding helper) | **P3** | Drift theo hướng AN TOÀN (doc không phóng đại PASS; mọi số thực ≥ số ghi). Giải thích hợp lý: A5 chạy chốt ~18:46–19:15 UTC trong khi A2-FINISH (mtime `test_f06.py` ~18:58:49) vẫn đang thêm test (vd `NoPauseC8ContractTests` 7 test đã được test.md liệt kê ở T12 nhưng có thể vào sau lần chạy substrate). Đề xuất A5: ghi timestamp/snapshot từng lần chạy (hoặc "số ≥ X tại thời điểm chốt") để lần sau không phải đoán; không chặn |
| R4A5-02 | `test.md` T07 — câu "F04-BE `RaceIntegrityTests` 2/4 winner-row simulation" | Mẫu số "/4" có thật không? | Class có 4 test hoặc giải thích rõ 4 là gì | `RaceIntegrityTests` (test_f04.py:400) chỉ có **đúng 2** test methods (`test_integrity_error_race_returns_winner_without_second_row`:415, `test_integrity_error_with_different_payload_conflicts`:445). Cả 2 đều thật và PASS. "/4" không có nguồn rõ trong file (nếu cộng 2 test idempotency-revision trong `RefineTests` :367/:377 thì thành 4 — nhưng chữ hiện tại dễ đọc sai là "2 trong 4 test của class") | **P3** | Nit câu chữ: A5 sửa thành "RaceIntegrityTests 2/2 + 2 test replay/conflict trong RefineTests" hoặc bỏ mẫu số. Không ảnh hưởng kết luận |
| R4A5-03 | UI coverage — T04/T12 sub-clause "edit final sau AI apply → preview đúng final" | Có test client nào pin "apply AI → sửa text → preview/confirm dùng bản ĐÃ SỬA"? | Ít nhất 1 test UI (web hoặc zalo) assert payload preview chứa text sau edit | KHÔNG có. Tìm thấy: server-side `test_only_explicit_confirm_send_delivers` (E2E-A5 — preview gửi MANUAL_TEXT, không phải bản AI) PASS; web-screens compose có test pause/preview gate nhưng KHÔNG có AI trong vòng; web C6 chỉ assert "apply chỉ điền textarea"; zalo (b) tương tự. Khoảng hở: client-level regression "sửa sau apply → preview lại theo bản sửa" không được pin | **P3** | Bổ sung ở vòng sau (owner A4 + A5 ghi nhận): 1 test ở web hoặc zalo — apply gợi ý → sửa textarea → bấm preview → assert `previewCalls[0].body === text-đã-sửa`. Server đã đảm bảo final-only nên rủi ro thấp; đây là kiếm lưới parity |
| R4A5-04 | UI coverage — liên quan D-04 (consent revoke giữa refine-201 và apply) | UI có test pin hành vi "revoke sau refine, trước bấm Dùng gợi ý" không? | Có test (kể cả để pin hành vi "được apply" như một quyết định có chủ đích) hoặc ghi rõ NOT_RUN | KHÔNG có test nào ở web/zalo cho cửa sổ này; UI chỉ xử lý 403 `consent_required` ở lượt refine SAU (mở lại sheet). peer-review.md D-04 đã tự ghi SUSPECTED (trung thực), nhưng trạng thái "chưa có test pin hành vi" chưa nằm ở mục 3 test.md | **P3** | Phase-2: nhóm A3/A4/coordinator chốt hành vi (apply-allowed vì suggestion sinh hợp lệ trước revoke vs chặn-by-verify-at-apply) rồi thêm 1 test pin để chống regress. Dữ liệu vẫn an toàn nhờ finalize recheck server (đã có test BE/A5) |
| R4A5-05 | Bằng chứng build — test.md #9/#10 | A4 có xác nhận lại được `npm run build` web + zalo verify không? | Rerun đủ 11/11 | Reviewer này KHÔNG rerun 2 lệnh build (#9 web build, #10 zalo build+verify) — chỉ rerun 9/11 lệnh test/kiểm. Ghi rõ ở đây để tránh hiểu nhầm là đã xác nhận toàn bộ | **P3** (minh bạch phía reviewer) | Ai rerun tiếp chỉ cần chạy 2 lệnh build còn lại; phần còn lại của bằng chứng đã đủ |

## 2. Các điểm kiểm tra đạt CLEAR (có bằng chứng — expected/actual khớp)

| # | Điểm kiểm (theo nhiệm vụ) | Kết luận + bằng chứng |
|---|---|---|
| a | Ma trận đủ 20 dòng + lệnh thật | **CLEAR.** Đếm đúng **20/20** dòng `**T01**`..`**T20**`. Các lệnh đều copy-paste chạy được thật (không pseudo-command): rerun độc lập cho 9/11 lệnh, số liệu ở mục 3 |
| b | Assertion thật, không test rỗng | **CLEAR.** T02: `A5FakeAiProvider.calls` là counter THẬT (list append trong `refine()`), 4/6 test consent assert `self.assertEqual(self.provider.calls, [])` + 403 `consent_required`; T11: `_counters()` đếm `Message`/`Draft`/`sender_calls` TRƯỚC/SAU rồi `assertEqual(after, before)` — và docstring của test tự khai báo trung thực "f05 không có bảng outbox/operation riêng — operation là lookup trên Message theo idempotency_key" (tôi verify: f05 không có model Outbox/Operation, `OperationStatusView` đúng là lookup theo `idempotency_key`); T08: class là `TransactionTestCase`, probe ghi snapshot `connection.in_atomic_block` LÚC provider chạy rồi `assertIs(..., False)` — đo đạc hợp lệ (không phải TestCase tự bọc atomic); T09: 404 cho đủ 4 vai trò (recipient/stranger/staff/admin) + mass-assign `author/author_id/status` → 400 + `test_message_detail_carries_final_body_only` assert 6 field cấm không có trong DTO thư |
| c | Trạng thái trung thực | **CLEAR.** (1) 3 SKIP trong substrate rerun có reason NGUYÊN VĂN khớp docs: `NOT_RUN on SQLite: race concurrency cần MySQL…`, `Live Gemini smoke is opt-in (RUN_GEMINI_LIVE_TESTS=1…)`, `backend config.settings not importable in this harness run`; guard opt-in có thật tại test_gemini_transport.py:287-290. (2) T14/T15 BLOCKED nhất quán — không một test nào giả Render/cross-client thật. (3) T20 NOT_RUN "key chưa rotate" khớp guard opt-in. (4) Tra cứu **12 tên** class/method trong test.md đều tồn tại thật (vượt yêu cầu 6): `test_provider_gets_only_the_chosen_sentence` (test_f04.py:97), `test_request_body_is_minimal_and_json` (test_gemini_transport.py), `PauseTimingTests.test_pause_records_server_deadline_300` (test_f06.py:141), `NoPauseC8ContractTests.test_paused_t299_confirm_blocked_cooldown` + `test_paused_t301_confirm_ok_after_expiry_no_auto_send` (test_f06.py:236/252), `test_cors_accepts_only_configured_origins` (test_cors.py:8), `F04A5ConcurrentKeyTests`, `test_f04_registers_ai_deletion_hook`, `NoSendProofTests.test_refine_and_accept_create_zero_messages` (test_f04.py:478), `AuthorPrivacyTests` (:189), `ProviderWiringTests`/`KillSwitchRuntimeTests`/`GeminiThroughApiTests`/`LiveGeminiSmokeTests`. **Không phát hiện dòng nào gán PASS cho test không tồn tại** |
| d | peer-review.md có căn cứ + release gate nhất quán | **CLEAR.** D-01: `CORS_ALLOW_HEADERS = ... + ["x-idempotency-key"]` đúng tại `backend/config/settings.py:192`; grep toàn test CORS chỉ có 1 test origin (test_cors.py:8), KHÔNG test preflight `X-Idempotency-Key` → gap có thật. D-05: `evaluateAiConsent` duplicated đúng 2 vị trí `zalo-mini-app/src/pages/compose/index.js:591` + `message/index.js:468` (web đã gộp `components/ai-assist.js`). D-06: `record_consent` (f01 identity.py ~:209) là `ConsentRecord.objects.create` thuần — append row mỗi POST, GET latest-wins → mô tả chính xác. Release gate "local PASS, production BLOCKED": khớp bằng chứng — toàn bộ rerun của tôi 0 FAIL (local), 5 mục BLOCKED (T07-mysql, T14/T15-Render, T16-device, T17-CORS-test+Render, T20-live-key) đều là thứ tôi xác nhận KHÔNG có trong env/test. Nhận định "không chặn merge nhánh" hợp lý với bằng chứng hiện có |
| e | UI coverage 4 ca handoff (góc nhìn parity-web owner) | **CLEAR cho 4 ca đòi hỏi** (trừ 2 gap P3 đã nêu R4A5-03/04). Web `f04-ai-parity.test.mjs` **17/17** (5 describe): C4 stale (deferred→banner+khóa apply; sửa-trước-apply chặn tại thời điểm bấm; keystroke revision), C3 consent (decline→recordConsent(declined)+manual dùng được; 403 rút→sheet mở lại không loop; policy current=false hỏi lại), C5 error (503/timeout→lỗi trung thực+lưu nháp vẫn chạy; aiStatus lỗi mạng→disabled không giả on/off), C6 apply-không-send (assert `adapter.sendMessage` override **throw nếu bị gọi** + `behavior.confirmCalls` undefined + XSS render textContent + unmount-safe) — assertion thật, không test rỗng. Zalo `f04-ai-refine.test.mjs` **14/14**: (b) apply không send, (c1)/(c2)/(f) stale, (d1) decline, (e)/(e2) error manual fallback, (a)+(b)/(c)/(d) reply parity. Cả 4 ca handoff có mặt ở CẢ HAI client |

## 3. Số test spot-check — chạy lại độc lập 2026-10-16 ~19:07–19:20 UTC (so với test.md)

| Lệnh (test.md #) | Doc ghi | Rerun của A4 | Khớp? |
|---|---|---|---|
| #1 shared contract A5 | 13 PASS / 0 FAIL | 13 PASS / 0 FAIL / 0 skip | ✅ |
| #2 shared toàn bộ | 50 PASS / 0 FAIL / 0 SKIP | 50 PASS / 0 FAIL / 0 skip | ✅ |
| #3 mobile f04 | 5 PASS / 0 FAIL | 5 PASS / 0 FAIL | ✅ |
| #4 web `npm test` | 203 PASS / 0 FAIL | **204 PASS** / 0 FAIL (riêng f04-ai-parity 17 + web-screens 78: khớp doc) | ⚠️ +1 (R4A5-01) |
| #5 zalo `npm test` | 311 PASS / 0 FAIL | 311 PASS / 0 FAIL | ✅ |
| #6 harness E2E A5 | 28 test: 27 PASS, 1 SKIP | 28 test: 27 PASS, 1 SKIP (`F04A5ConcurrentKeyTests.test_concurrent_same_key_single_provider_effect`, reason = MySQL) | ✅ |
| #7 harness substrate | 200: 197 PASS, 3 SKIP | **209**: 206 PASS, 3 SKIP (đúng 3 ca + reason nguyên văn như mục 2 test.md) | ⚠️ +9 (R4A5-01) |
| #8 backend full SQLite | 50: 48 PASS, 2 SKIP | 50: 48 PASS, 2 SKIP | ✅ |
| #11 import boundaries | CLEAN | CLEAN, exit 0 | ✅ |
| #9/#10 build web/zalo | PASS | KHÔNG rerun (R4A5-05) | — |

Tổng: **0 FAIL trên toàn bộ 9 lệnh rerun** (≈723 test chạy lại). Không phải sửa assertion nào của A5.

## 4. Kết luận

**APPROVE-WITH-NITS.**

- Hai file test của A5 (`test_f04_e2e_a5.py`, `test_f04_contract_a5.mjs`) assert đúng hợp đồng freeze v1, assertion thật (counter/probe/đếm before-after), không test rỗng, không nới lỏng contract; docs trung thực ở mức đáng tin: mọi SKIP/NOT_RUN/BLOCKED đều tra cứu ra guard/reason có thật, không phát hiện PASS bịa.
- 4 nit P3 (R4A5-01..04) không đổi kết luận: 2 là drift số liệu dương tính + câu chữ, 2 là gap UI-test nên bổ sung vòng sau (R4A5-03 ưu tiên cho A4; R4A5-04 chốt hành vi phase-2).
- Việc còn mở cho A5: ghi timestamp/snapshot cho từng lần chạy bằng chứng (R4A5-01), sửa mẫu số "2/4" (R4A5-02).
