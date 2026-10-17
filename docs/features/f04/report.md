# Report — F04 AI hỗ trợ diễn đạt (B04)

- Feature ID / nhánh / US: F04 / feat/f04-ai-expression / US-029, US-033
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **AiExpressService**: refine (idempotent theo author+key; replay KHÔNG
  gọi provider lần 2; same key khác text → 409), decide (accept/discard
  author-only, một chiều), list/get author-only, status trung thực.
- **Payload tối thiểu cho provider**: chỉ (text, purpose) — test assert
  chính xác tập tham số; không bao giờ gửi lịch sử/nhật ký/dữ liệu người khác.
- **Provider registry allowlist**: provider đăng ký tường minh qua port;
  không URL/key nhập tùy ý; keys thuộc provider impl (B18) ở env/secret.
  Chưa wire = AI off → 503 module_unavailable (US-033 manual flow an toàn).
- **Failure mapping trung thực**: outage/timeout/quota → 503 reason riêng
  (fb_provider_reason convention); output malformed/oversized → 503
  provider_output_invalid; provider fail → 0 row tạo (không suggestion rác).
- **Output là text không tin cậy**: bound ≤ 4000, lưu như data, render
  textContent client-side; prompt-injection test chứng minh không tool/
  action/leak; KHÔNG có đường send nào trong f04 — gửi cuối luôn qua
  preview-recipient-confirm (F05 messages), send DTO chỉ có final body.
- **Author privacy**: original + suggestion là dữ liệu riêng của tác giả;
  caregiver/staff/System Administrator đều 404; không log câu; metadata
  provider_id/model_revision/prompt_revision versioned cho audit.
- **Mobile refine.js**: notice minh bạch trước khi gọi; suggest → editable
  textarea; accept → onAcceptText handing off; discard giữ draft; AI lỗi →
  manual notice, composer không bị chặn.
- Harness: carry-forward chuẩn + throttle scope `ai_refine` 30/hour.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f04_ai
node --test packages/family_bridge_mobile/f04_ai/tests/f04.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f04_ai python manage.py test harness labgrants family_bridge_features.f04_ai
```

Kết quả: f04 18/18 backend PASS; suite rộng 46/46 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Suggestion lookup: UNIQUE (author, idempotency_key) + index (author,
  created_at, id); list giới hạn 20 mới nhất (bounded); text bounds 4000.
- Provider call nằm NGOÀI transaction (refine transaction chỉ bọc DB
  write sau khi provider trả); timeout 15s do service truyền vào port.

## Security/privacy

- SEC-01/05: purpose allowlist; bounds; unknown fields reject; 401/404 đúng.
- SEC-04: author-only mọi endpoint; admin/stranger 404 (test riêng).
- SEC-22: không log câu; metadata revision tối thiểu; error details không
  chứa original/suggested (sanitize guard của core).
- US-033: AI off/lỗi/quota → manual flow luôn hoạt động; help không bị chặn.
- KHÔNG tuyên bố "an toàn tuyệt đối" — chất lượng output phụ thuộc prompt/
  model được duyệt (US-008) và phải review thêm; ở đây chỉ chứng minh hợp
  đồng xử lý dữ liệu + fail-safe.

## Kết quả

- PASS: 18 backend f04 + 46/46 harness suite + 3 mobile (SQLite local).
- NOT_RUN: quota race MySQL (không DB); provider HTTP thật (cần key + US-008).
- BLOCKED: none trong phạm vi module; provider thật + kill switch runtime
  thuộc B18 (registry allowlist + env).

## Còn lại / Input cần

- B18: wire provider thật vào registry allowlist (provider id/model/
  prompt revision theo hồ sơ US-008); kill switch runtime đọc từ product
  settings (B16); nối refine page vào composer dùng chung F06 (pause) —
  hiện onAcceptText chỉ handoff text, chưa ghép màn.
- US-008: Thầy/đơn vị duyệt cách AI giúp diễn đạt trước khi bật production.

---

# A1 — Integration & contract verification (F04-A1)

- Agent: A1 (Kiến trúc, hợp đồng và tích hợp) — khởi tạo cùng batch với
  A2/A3/A4/A5 (bằng chứng overlap: worklog entry F04-A1 ghi timestamp
  start/end riêng; 5 agent cùng được triệu hồi trong 1 message của điều phối).
- Baseline làm việc: branch `tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033`
  = origin/main `72930ae` (ff, 0 commit riêng). Lưu ý: các section phía trên
  mô tả baseline CŨ `cc6ade2` và đã lỗi thời tại `72930ae` (ví dụ claim
  "provider call nằm NGOÀI transaction" — audit F04-04 xác nhận NGƯỢC LẠI
  trên `72930ae`: `express.py refine` bọc `@transaction.atomic` quanh
  provider call; A2 đã sửa lại trong working tree).

## 1. Bảng đối chiếu contract freeze v1 ↔ code thật

Trạng thái đọc tại thời điểm A1 chạy (backend đang được A2 sửa song song —
các mục "backend đã có fix trong working tree A2 (chưa commit)" được verify
trực tiếp trên file đang mở, không phải trên commit).

| Điều khoản | Code/shared tại 72930ae | Kết luận | Ai xử lý |
|---|---|---|---|
| C1 `GET /api/v1/ai/status` → `{ai_enabled}` | `f04_ai/api.py AiStatusView` — shape giữ nguyên; shared `aiStatus()` fallback `{ai_enabled:false}` | ✅ KHỚP | — |
| C1 `POST /api/v1/ai/refine` + header bắt buộc | backend: thiếu header → 400 `required_for_refine`; shared: thiếu key → ApiError `configuration` TRƯỚC fetch | ✅ KHỚP (đã có test regression) | — |
| C1 `GET /api/v1/ai/suggestions[/{id}]` | backend có route; shared adapter CỐ Ý không expose (không UI consumer; recovery là replay cùng key) | ⚠️ GHI CHÚ — nếu A3/A4 cần list/detail thì thêm method vào `contract.js` + tăng count 69 có kiểm soát | A1+A3/A4 |
| C1 accept/discard | backend author-only, một chiều; shared `aiAccept/aiDiscard` body `{}` | ✅ KHỚP | — |
| C2 body `{original_text, purpose, input_revision?}` | **baseline 72930ae: `reject_unknown_fields(allowed={original_text,purpose})` → gửi input_revision bị 400.** A2 đã thêm `input_revision` vào allowed + `validate_input_revision` trong working tree | ✅ đã sửa (A2, working tree) | A2 |
| C2 legacy payload thiếu input_revision | shared `aiRefine` chỉ gửi `input_revision` khi caller truyền int dương 1..2147483647; test chứng minh legacy body không có field này | ✅ KHỚP (A1) | — |
| C3 201 = `AiSuggestion.view()` + echo `input_revision`; field `suggested_text` duy nhất | model `view()` trả `suggested_text`; A2 thêm echo `input_revision` (migration `0002_aisuggestion_input_revision`). **Shared http-endpoints trả DTO NGUYÊN VẸN (pass-through, không rename) — có test deepEqual**; mock-adapter đổi `refined_text`→`suggested_text` + đủ field view() | ✅ (A1 shared; A2 backend) | A1 ✅ / A2 |
| C4 consent gate server-side TRƯỚC provider | **72930ae: refine KHÔNG check consent (F04-03).** A2 working tree: `_require_consent` → `has_active_consent(user, ai_processing)` trước `_call_provider`, 403 `consent_required`, provider_calls=0 | ✅ đã sửa (A2) | A2 |
| C4 consents endpoints | shared `listConsents/recordConsent` mapping `{purpose, policy_version, decision}` — test regression thêm | ✅ KHỚP (A1) | — |
| C5 env/kill-switch/fail-closed | 72930ae: registry `_ai_provider=None`, 0 wiring (F04-06). A2 working tree: `services/gemini.py` (REST stdlib, host allowlist), `wiring.py` opt-in qua `FB_AI_ENABLED`, `apps.py` | ✅ đang làm (A2) | A2 |
| C6 refine tách phase + hash có input_revision | **72930ae: provider trong `@transaction.atomic` (F04-04) + `context_revision=None` (F04-05).** A2 working tree: phase 1 validate+consent+replay → phase 2 provider NGOÀI atomic → phase 3 finalize ngắn bắt `IntegrityError` re-read; `send_payload_hash(..., context_revision=input_revision)` (core đã hỗ trợ sẵn tham số này) | ✅ đã sửa (A2) | A2 |
| C7 UI đọc `suggested_text`, stale guard, consent sheet | UI 4 file đọc `refined_text` tại web/zalo compose:561,598 message:474,507 (F04-02) — read-only cho A1 | 🔴 A3/A4 sửa (A3 đã sửa 2 file zalo trong working tree; A4 đang sửa web) | A3/A4 |
| C8 edit kind-optional | **72930ae: `DraftDetailView.post` `_content_fields(require_all=True)` rồi mới `pop("kind")` — require_all KHÔNG được dùng trong hàm → edit thiếu kind fail `input_invalid`.** A2 working tree: `require_all=False` cho edit, chỉ validate field có mặt. Shared `editDraft` KHÔNG BAO GIỜ gửi kind — test regression chặn drift | ✅ shared ✅ (A1) / backend A2 | A1 ✅ / A2 |
| C8 pause300 không ép chờ khi chưa chọn | **72930ae: `_deadline_guard` chặn preview + confirm khi `status != paused` (`pause_not_started`)** — mâu thuẫn C8. Mock shared đã sửa theo C8 (không pause → preview/send hợp lệ ngay; đã pause → `cooldown_active` tới deadline); backend fix thuộc A2 (bắt buộc, UI web hiện đang ăn theo behavior cũ) | ✅ mock (A1) / 🔴 backend A2 | A2 |
| C8 đã chọn pause → không auto-send t=300 | backend không có timer auto-send (confirm-send là action cuối); mock thêm gate deadline ở confirm | ✅ KHỚP | — |
| C9 F05 final-only | `sendMessage` DTO chỉ kind/recipient/body/title/reply_to; Message detail không có original/suggestion (list metadata không body). Mock `sendMessage` echo tương ứng | ✅ KHỚP (bằng chứng count trước/sau refine thuộc A5) | A5 |
| Pagination mapping | F05/F07 backend dùng `page_size` + envelope `next`; shared trước đây gửi `limit` (bị máy chủ bỏ im lặng) → **A1 đã sửa `listMessages` + `listMoodEntries` sang `page_size`**; F01 dùng `limit`+`next_cursor` (giữ nguyên); F06 không pagination, envelope `server_time`+`pause_seconds` được map đúng | ✅ đã sửa (A1) | A1 |
| CORS preflight | **72930ae: chỉ `CORS_ALLOW_CREDENTIALS=False` + origins — KHÔNG có `CORS_ALLOW_HEADERS`; default django-cors-headers KHÔNG chứa `x-idempotency-key` → mọi POST idempotent (refine/send/cards/signals) fail preflight trên browser/WebView.** A2 đã thêm `CORS_ALLOW_HEADERS = default + ["x-idempotency-key"]` trong working tree (verified: `default_headers` không có key này) | ✅ đã sửa (A2) | A2 |

## 2. File A1 đã sửa + tóm tắt diff

| File | Thay đổi |
|---|---|
| `packages/family_bridge_shared/src/adapter/http-endpoints.js` | (1) `aiRefine` nhận `{text, purpose, key, inputRevision, timeoutMs}` → body `{original_text, purpose, input_revision?}`; validate int dương 1..2147483647 chặn trước fetch (400 `input_invalid`); vẫn trả DTO NGUYÊN VẸN (pass-through). (2) `listMessages`/`listMoodEntries`: param trang `limit`→`page_size` (F05/F07). (3) Doc-comment hợp đồng cho `editDraft` (không gửi kind — C8). |
| `packages/family_bridge_shared/src/adapter/mock-adapter.js` | (1) `aiRefine` mock: `refined_text`→`suggested_text` (F04-02), echo `input_revision`, đủ field `AiSuggestion.view()` (status `suggested`, model/prompt_revision, created_at, decided_at), replay theo key (cùng key+payload → cùng suggestion; khác payload → 409 `duplicate_key_payload_mismatch`), validate inputRevision giống endpoint. (2) `previewDraft`/`confirmDraftSend` theo C8: không chọn pause → preview/send hợp lệ ngay; đã chọn pause → 409 `cooldown_active` tới deadline máy chủ. Helper `remainingPauseSeconds` dùng chung. |
| `packages/family_bridge_shared/tests/f04-contract.test.mjs` (MỚI) | 16 regression test: C2 legacy/revision/bounds, C1 header bắt buộc, C3 DTO pass-through deepEqual + `refined_text === undefined`, C8 editDraft không kind + mock edit/preview/confirm, C4 consents mapping, pagination `page_size`/`next`/`server_time`, mock replay C6. |
| `docs/features/f04/scope.md` | Luồng 2 client 8 bước, boundary F04/F05/F06/F15, ngoài scope (tư vấn 1-1/booking F12/phòng thiết bị; chẩn đoán/trị liệu; auto-send; provider phía client). |
| `docs/features/f04/manifest.json` | branch đúng `tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033`, baseline `72930ae`, endpoints chi tiết C1–C6, contract list thêm `input_revision` + consent gate + env Gemini, shared adapter + regression tests, status `in_progress` trung thực theo lớp (không claim implemented tổng thể). |
| `docs/features/f04/report.md` | APPEND section này. |
| `/home/z/my-project/worklog.md` | APPEND entry F04-A1 (timestamp start/end — bằng chứng overlap batch). |

## 3. Gap matrix F05/F06/F15/CORS (trạng thái lúc A1 chạy)

| Gap | Bằng chứng trên 72930ae | Đề xuất | Trạng thái |
|---|---|---|---|
| F06 edit yêu cầu kind | `f06_drafts/api.py:116` `require_all=True` (tham số chết — không dùng trong `_content_fields`) rồi `pop(kind):117` | backend: `require_all=False` cho edit, validate theo field có mặt; shared đã chặn bằng test | A2 ĐÃ SỬA trong working tree (api.py:132) |
| F06 sender registry chưa wire production | `register_sender` chỉ được gọi trong `f06_drafts/tests/test_f06.py:31,33`; grep toàn repo không có wire trong `backend/config` hay AppConfig → production confirm-send cho kind text/emotion_card sẽ 503 `sender_not_wired` | Wire trong `F06Config.ready()` (pattern như F16 apps.py): kind `text` → F05 MessageTransport port, kind `emotion_card` → F03 CardSendService; không tự insert Message ngoài F05 | A2 |
| F04 chưa đăng ký F15 deletion hook | `apply_user_deletion` của F04 không tồn tại ở 72930ae; F15 `register_deletion_hook` allowlist có category `"ai"` sẵn; F16 là ví dụ pattern (`apps.py ready()` + ImportError-tolerant) | A2 tạo `f04_ai/services/deletion.py` + đăng ký category `"ai"` trong `F04Config.ready()`; xóa scoped user, idempotent, không hồi sinh | A2 ĐÃ CÓ (working tree: deletion.py + apps.py) |
| F05 sender port F06 dùng | F05 `MessageTransport`/operations của f05_inbox đã có; F06 cần gọi đúng port, không fake message_id | Wire qua port, test tạo→preview→confirm → Message thật | A2 |
| CORS preflight thiếu X-Idempotency-Key | `django-cors-headers` default_headers = accept/authorization/content-type/user-agent/x-csrftoken/x-requested-with; settings 72930ae không override | `CORS_ALLOW_HEADERS = list(corsheaders_default_headers) + ["x-idempotency-key"]` | A2 ĐÃ SỬA trong working tree (settings.py:192) |
| `registry.py` (core) entry F04 lỗi thời | branch `feat/f04-ai-expression`, status `planned`, deletion_hook `pending` | Cập nhật entry F04 (branch/status) khi A2 land — thuộc family_bridge_core, A1 không tự sửa để tránh đụng chéo | Coordinator/A2 |

## 4. Kết quả test (A1 scope)

| Suite | Lệnh | Kết quả |
|---|---|---|
| Shared (bao gồm 16 test mới) | `node --test packages/family_bridge_shared/tests/*.test.mjs` | **50/50 PASS** (trước: 34/34) |
| Import boundaries | `node scripts/check_import_boundaries.mjs` | CLEAN (exit 0) |
| Web (không sửa file web) | `cd web && npm test` | 187/187 PASS |
| Zalo Mini App (không sửa file zalo) | `cd zalo-mini-app && npm test` | 297/297 PASS |
| Mobile F04 | `node --test packages/family_bridge_mobile/f04_ai/tests/f04.test.mjs` | 3/3 PASS |
| Harness F04+deps (tham chứng) | `tests/feature-lab` + `FB_FEATURES=f01_identity,f04_ai,f05_inbox,f06_drafts,f15_privacy` | đang trong quá trình A2 sửa song song: lần chạy 1 = 117 tests (7F/5E), lần chạy 2 = 131 tests (2E — race IntegrityError tests của A2 đang đỏ) → không phải số liệu nghiệm thu, A2/A5 sẽ chốt |

Purity shared giữ xanh (không DOM/storage/SDK trong src).

## 5. Giả thuyết / rủi ro cho peer-review vòng sau

1. **Mock/schema drift quay lại**: mock `aiRefine` bây giờ khớp `AiSuggestion.view()` + echo, nhưng nếu A2 đổi thêm field (ví dụ thêm `quota`/`provider_id` vào view) mà không sửa mock thì demo `?demo=1` lệch serializer một lần nữa. Đề xuất: một test đi qua serializer→adapter (F04-T03) để bắt drift ở lớp thật, không chỉ ở mock.
2. **Field rename sót**: ngoài 4 file UI + mock đã biết, `refined_text` còn tồn tại trong test fixtures của 2 client (`web/tests/web-screens.test.mjs:912,960,1096`, `zalo-mini-app/tests/web-screens.test.mjs:902,950,1086`) — các test này override adapter nên không bắt lỗi schema thật; nếu A3/A4 chỉ đổi UI mà quên đổi fixture, drift sẽ bị che. Peer-review A5 nên grep lại `refined_text` phải = 0 hit sau khi cả 3 lớp land.
3. **editDraft break consumer cũ**: hợp đồng mới "edit chỉ validate field có mặt" nghĩa backend không còn tự điền default cho field thiếu; nếu có consumer cũ gửi `{body}` không kèm `title` thì title giờ giữ nguyên (đúng bất biến) thay vì bị xóa về "" — hành vi thay đổi ngầm. Cần 1 test backend edit một phần field (body-only) + read-back để chốt ý nghĩa "bất biến".
4. **Stale guard phụ thuộc echo revision**: nếu A2 echo `input_revision` nhưng UI so sánh với counter chưa đổi khi AI inflight và user paste (1 input event nhiều ký tự), revision chỉ tăng 1 lần — có nguy cơ chấp nhận gợi ý "stale" nhầm. Đề xuất A3/A4 dùng đơn điệu tăng theo event, không reset khi fail.
5. **CORS chỉ đủ khi A2 land**: `CORS_ALLOW_HEADERS` đang là thay đổi working-tree chưa commit; nếu coordinator commit shared/UI trước backend thì web sẽ fail preflight trên môi trường thật. Thứ tự merge nên giữ backend (A2) cùng/nhánh chung.
6. **MySQL race chưa có bằng chứng**: finalize IntegrityError của A2 và guard `select_for_update` của F06 confirm-send mới chứng minh trên SQLite; MySQL cần evidence riêng (SQLite test case không thay thế — handoff 01 §7).

## 6. Hạn chế của phần A1

- Không chạy git commit/push (quy định điều phối) — mọi thay đổi nằm ở working tree.
- Backend/UI còn đang di chuyển do A2/A3/A4 song song: bảng §1 phản ánh thời điểm đọc; cần rerun sau khi cả 5 agent land.
- Không có bằng chứng MySQL race, live Gemini, thiết bị Zalo thật trong phạm vi A1.

---

# A2 — Backend & Gemini (F04-A2 + A2-FINISH)

- Agent: A2 (Django backend + Gemini + consent; phiên A2 trước chết giữa
  chừng, phiên A2-FINISH hoàn tất 2 gap còn lại + section này). Baseline
  làm việc: `72930ae` (origin/main), branch
  `tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033`, working tree (không commit).
- Phạm vi file (ownership): `packages/family_bridge_features/f04_ai/**`,
  `packages/family_bridge_features/f06_drafts/**`,
  `backend/config/settings.py` (env + CORS), 1 test mới trong
  `tests/feature-lab/harness/tests/`, docs/features/f04/report.md.
  KHÔNG đụng web/, zalo-mini-app/, shared/, mobile/, docs/features/f04 khác.

## 1. Before → after từng lỗi

| Lỗi | Before (baseline `72930ae`) | After (working tree A2) |
|---|---|---|
| **F04-03** refine không check consent | `express.refine` gọi provider không hỏi F01 consent | `_require_consent()` gate SERVER-SIDE TRƯỚC provider: `has_active_consent(author, "ai_processing")` (F01), thiếu/declined/withdrawn/sai policy version → 403 `consent_required`, `provider_calls=0`. Recheck lần 2 tại finalize (revoke trong lúc chờ provider → KHÔNG lưu suggestion). Accept/discard không gate |
| **F04-04** provider trong `@transaction.atomic` | `@transaction.atomic` bọc toàn bộ refine (provider I/O trong transaction + row lock) | Refine tách phase: (1) validate + consent + replay-check → (2) provider call NGOÀI mọi atomic (test probe `connection.in_atomic_block is False`) → (3) recheck consent/kill-switch → (4) atomic ngắn chỉ bọc `create()`. Race IntegrityError → replay row của winner, không 500, không row thứ 2 |
| **F04-06** registry trống, 0 wiring Gemini | `_ai_provider=None`, không file Gemini nào (`grep -r gemini` = 0 hit) | `services/gemini.py`: GeminiProvider REST stdlib, host allowlist CHỈ `generativelanguage.googleapis.com`, auth qua header `x-goog-api-key` (không bao giờ `?key=`, không log), model allowlist (default `gemini-2.5-flash`), parse finishReason (SAFETY/MAX_TOKENS/empty → 503 reason riêng), cap response 1MB, KHÔNG retry tự động. `services/wiring.py`: `build_provider_from_settings()` fail-closed (mọi sai config → None → AI off). `apps.py F04AiConfig.ready()` try/except — không bao giờ crash boot. Kill switch runtime: `kill_switch_active()` re-read **object settings Django** tại từng request → `status()`/`refine()` trung thực khi flag flip sau khi boot (test dùng `override_settings`); đổi env trên Render production vẫn cần restart/redeploy process để settings reload (R1A2-03) |
| **F04-07** không có deletion hook F15 cho category "ai" | Không tồn tại → F15 deletion gặp `hook_not_registered` | `services/deletion.py AiSuggestionDeletionHook` (xóa AiSuggestion của chính user, idempotent, không hồi sinh) + đăng ký trong `ready()` theo pattern F16 (f15 vắng mặt → skip im, boot OK, gap trung thực) |
| **C2/C3** `input_revision` + echo `suggested_text` | API reject `input_revision` (unknown field); không có field C3 | `api.py` cho phép `input_revision` + `validate_input_revision` (int dương ≤ 2147483647); models + migration `0002_aisuggestion_input_revision` (field nullable, additive); `payload_hash` tính CÙNG `input_revision` (same key khác revision → 409); 201 DTO echo `input_revision`; field `suggested_text` là tên duy nhất |
| **C8 edit** kind bắt buộc chết tham số | `require_all=True` truyền vào rồi `pop("kind")` — edit thiếu kind fail `input_invalid` | `_content_fields(require_all=False)` cho edit: chỉ validate field CÓ MẶT; `kind` optional + immutable; create giữ `require_all=True` |
| **C8 deadline guard ép pause** (A2-FINISH gap 1) | `_deadline_guard` raise `InputInvalid pause_not_started` khi `status != paused` → draft KHÔNG pause KHÔNG THỂ preview/confirm; `make_preview` crash `.isoformat()` trên deadline None | Guard chỉ enforce khi draft ĐANG paused (status==paused AND deadline set): `now < deadline` → 409 `cooldown_active` (t=299 chặn, t=300 qua); `now >= deadline` → cho qua (hết giờ KHÔNG auto-send nhưng confirm tay được phép); draft không pause → cho qua luôn (không raise). `make_preview` trả `"deadline": isoformat() if deadline else None` — shape ổn định, khớp mock shared (A1) |
| **F06 sender chưa wire production** (A2-FINISH gap 2) | `register_sender` chỉ gọi trong tests → production `confirm_send` luôn 503 `sender_not_wired` → E2E F04 (preview → confirm → recipient đọc) chết | `f06_drafts/apps.py F06DraftsConfig.ready()` đăng ký kind="text" → `send_text_draft_via_f05` gọi `MessageTransportService.send()` của f05 (production port THẬT — không fake, không insert Message ngoài F05). `INSTALLED_APPS` KHÔNG cần đổi: module path auto-discover single AppConfig trong `apps.py` (như f04), label giữ `f06_drafts` → 0 churn migration (`makemigrations --check` sạch). kind="emotion_card" CỐ Ý KHÔNG wire (F03 owner) → 503 trung thực |
| **CORS preflight** thiếu `x-idempotency-key` | default django-cors-headers không chứa header → mọi POST idempotent fail preflight | `CORS_ALLOW_HEADERS = default + ["x-idempotency-key"]` (settings.py) |

## 2. A2-FINISH — chi tiết guard mới + wiring f06

- **Guard** (`f06_drafts/services/drafts.py::_deadline_guard`): opt-in
  cooldown — draft đang paused mới bị chặn bởi deadline 300s server
  (DEC-03); cancel/edit đưa draft về `editing` → guard cho qua ngay.
  Hợp đồng: "không chọn pause → preview/send hợp lệ không bị ép chờ; đã
  chọn pause → respect deadline server; hết giờ KHÔNG auto-send (không
  job, không cron) nhưng confirm tay sau deadline được phép". Preview
  trước pause vẫn hợp lệ sau khi pause (pause không bump revision → không
  stale).
- **Wiring** (`f06_drafts/apps.py`, MỚI):
  - `ready()` chỉ `registry.register_sender(kind="text", fn=...)` trong
    try/except — wiring lỗi → kind ở lại unwired → confirm 503
    `sender_not_wired` fail-closed, boot không bao giờ chết.
  - Sender fn lazy-import f05 BÊN TRONG hàm (không import module-level
    của f06 → không circular import; build thiếu f05 vẫn boot).
  - **Idempotency key**: `draft:{draft.id}:rev:{draft.revision}`
    (`draft_idempotency_key()`; Draft không có key field sẵn — UUID id +
    revision là bản sắc nội dung đã duyệt). Double-confirm bị chặn ở F06
    (`draft_already_sent`) TRƯỚC khi gọi port; retry sau unknown outcome
    (F05 đã commit nhưng F06 chưa kịp đánh dấu sent) → f05 replay cùng
    sender+key → CÙNG message, không nhân bản. Revision bump sau edit =
    key mới = message mới (đúng nội dung mới).
  - Payload hash recompute từ draft đúng cách `make_preview` bind
    (kind/recipient/body, không reply/context) → confirm trên revision
    đã preview luôn khớp hash của F05.
  - Sender trả `{"message_id": str(sent.message_id)}` khớp consumer
    `confirm_send`.

## 3. Runbook env (Render service: `family-bridge-backend`)

Set trong Render Environment dashboard (hoặc `.env` local); KHÔNG giá trị
secret nào nằm trong repo/docs. Sai mọi ràng buộc → AI off fail-closed
(refine 503 `module_unavailable`), Django vẫn boot, manual flow (US-033)
không bị ảnh hưởng.

| Tên | Kiểu | Default | Bounds / ràng buộc | Vai trò |
|---|---|---|---|---|
| `GEMINI_API_KEY` | string (SECRET) | `""` (rỗng) | không rỗng; không log, không render | Key Gemini; thiếu → AI off. Chỉ đi vào header `x-goog-api-key` |
| `GEMINI_MODEL` | string | `gemini-2.5-flash` | allowlist: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`; ngoài list → AI off | Model pin theo hợp đồng C5 |
| `FB_AI_ENABLED` | bool env (`1`/`true`) | false (unset) | — | Kill switch chính; settings object được re-read tại từng request (flip qua `override_settings` hiệu lực ngay; đổi env production trên Render vẫn cần restart/redeploy process để settings reload — R1A2-03) |
| `GEMINI_TIMEOUT_SECONDS` | int | 15 | 3..30 — `_bounded_int_env` clamp; unparseable → None → AI off; provider clamp thêm 3..30 | Timeout mỗi call provider (R1A2-02: giá trị wired đi tới transport thật — `_call_provider` truyền `timeout_seconds=None`, provider dùng `self.timeout_seconds`), không retry |
| `GEMINI_MAX_OUTPUT_TOKENS` | int | 1024 | 64..4096 — cùng cơ chế clamp | `generationConfig.maxOutputTokens`; MAX_TOKENS → 503 `provider_output_truncated` |

Health/observability: không log prompt/body/key (SEC-22); failure chỉ trả
reason code (`provider_timeout`/`provider_outage`/`provider_quota_exceeded`/
`provider_safety_blocked`/`provider_output_*`).

## 4. Kết quả test (A2 scope)

| Suite | Lệnh | Before → After |
|---|---|---|
| Backend (core+accounts) | `cd backend && DJANGO_ENV=test DB_ENGINE=sqlite manage.py test` | 50 OK (2 skip) → **50 OK (2 skip)** (f06/f04 tests không thuộc discovery backend — chạy ở harness) |
| Harness (f01,f04,f05,f06,f15) | `cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test FB_FEATURES=f01_identity,f04_ai,f05_inbox,f06_drafts,f15_privacy manage.py test harness labgrants family_bridge_features.f04_ai family_bridge_features.f05_inbox family_bridge_features.f06_drafts family_bridge_features.f15_privacy` | 200 OK (3 skip) → **209 OK (3 skip)** |
| f06_drafts package tests | (trong harness run ở trên) | 25 → **28** (+3 `NoPauseC8ContractTests`) |
| `makemigrations --check --dry-run` | từ backend/ | **No changes detected** (exit 0) |

Ca mới thêm — f06 (`test_f06.py`): cập nhật `test_cancel_pause_clears_deadline`
(preview 200 + deadline None sau cancel — baseline 400), thay
`test_pause_not_started_preview_rejected` → `test_preview_without_pause_allowed`;
`NoPauseC8ContractTests`: (a)+(d) `test_no_pause_preview_shape_confirm_ok`
(shape response ổn định: preview_id/revision/recipient_id/deadline/server_time,
deadline=None khi không pause, confirm OK), (b)
`test_paused_t299_confirm_blocked_cooldown` (409 cooldown_active,
remaining_seconds=1), (c) `test_paused_t301_confirm_ok_after_expiry_no_auto_send`
(0 Message, 0 sender call trước confirm; confirm OK sau hết giờ).
Ca mới — harness (`harness/tests/test_f06_wiring_a2finish.py`, MỚI, 6 test):
`test_boot_wiring_registered_production_sender` (bằng chứng ready() wire lúc
boot qua snapshot import), `test_confirm_send_creates_message_via_f05_transport`
(Message row tạo QUA F05, đúng sender/recipient/kind/body/idempotency_key
`draft:{id}:rev:1`), `test_double_confirm_draft_already_sent_no_duplicate`,
`test_retry_after_unknown_outcome_replays_same_message` (mô phỏng crash giữa
F05 commit và F06 đánh dấu sent → replay cùng message),
`test_second_draft_same_body_gets_own_message` (key theo draft → không
dính message của draft khác), `test_emotion_card_unwired_503_truthful`
(F03 owner — 503, 0 Message).

## 5. Rollback

- **Runtime (không deploy)**: `FB_AI_ENABLED=false` (hoặc unset
  `GEMINI_API_KEY`) → AI off ngay cả giữa chừng (kill switch re-read object
  settings tại từng request — đổi env production vẫn cần restart/redeploy
  process Render để settings reload, R1A2-03); mọi path Django/manual sống.
  Cô lập hẳn feature: bỏ `f04_ai`/`f06_drafts` khỏi `FB_FEATURES`.
- **Sender wiring**: revert `f06_drafts/apps.py` → confirm_send về 503
  `sender_not_wired` fail-closed (không bao giờ gửi nửa chừng; Message
  chỉ tạo qua F05 nên không có trạng thái mồ côi).
- **Code**: revert working tree các file liệt kê ở §1. Migration
  `0002_aisuggestion_input_revision` additive (field nullable): code cũ
  bỏ qua field; nếu cần `manage.py migrate f04_ai 0001` trước khi revert
  models. Không có data migration.
- **Deadline guard**: revert drafts.py về baseline sẽ trả lại hành vi
  ép pause — PHẢI revert đồng bộ với shared mock (A1) và UI (A3/A4) nếu
  làm, để tránh lệch hợp đồng giữa 3 lớp.

## 6. NOT_RUN / BLOCKED (trung thực)

- **NOT_RUN — live Gemini**: không có GEMINI_API_KEY thật trong sandbox;
  transport test bằng doubles ở lớp urllib/HTTPError (không network).
  Cần smoke với key thật + duyệt US-008 trước khi bật production.
- **NOT_RUN — MySQL race evidence**: toàn bộ chạy SQLite local; 3 suite
  race/concurrency skip có lý do (FB_TEST_DB=mysql gated). Finalize
  IntegrityError + `select_for_update` confirm mới chứng minh trên SQLite.
- **NOT_RUN — Zalo device thật**: safe-area/keyboard/double-render của
  sheet consent + banner stale thuộc A3 (device smoke ngoài phạm vi A2).
- **BLOCKED — đường ConnectionReader f01 thật cho F06**: harness thay
  bằng double labgrants chuẩn (không có dữ liệu connection f01); đường
  f01 thật chỉ chạy khi B18 tích hợp — cần 1 ca smoke create → preview →
  confirm trên môi trường có f01 connection thật sau merge.

## 7. Rủi ro còn lại cho peer-review

1. **Consumer chưa pause có thể còn giả định cũ**: guard mới làm
   preview/confirm hợp lệ cho draft không pause; shared mock (A1) đã khớp,
   nhưng web UI (A4) từng "ăn theo behavior cũ" (theo ghi nhận A1 §1) —
   cần peer-review xác nhận web compose/message không tự chặn preview khi
   chưa pause (đồng bộ 3 lớp backend/shared/UI).
2. **`docs/features/f06/test.md` stale**: dòng "Cancel pause → preview |
   400 pause_not_started | PASS" phản ánh baseline cũ — ngoài ownership
   A2 nên KHÔNG sửa; cần F06-doc owner cập nhật theo hợp đồng mới để tránh
   mâu thuẫn evidence.
3. **emotion_card vẫn 503 ở production** cho tới khi F03 (owner) wire port
   card: trung thực (fail closed, 0 Message) nhưng luồng card UX chết ở
   confirm — cần ticket theo dõi cho F03 owner.
4. **Registry toàn cục + reset trong tests**: mọi test gọi
   `reset_registries()` phải tự re-register sender (pattern hiện tại đúng);
   một test mới quên register sẽ thấy 503 thay vì prod-wire — độ ồn thấp
   nhưng dễ hiểu nhầm là bug wiring.
5. **AppConfig auto-discovery**: dựa vào hành vi Django ≥3.2 (single
   AppConfig trong `apps.py` tự nhận khi INSTALLED_APPS ghi module path);
   nếu sau này thêm class AppConfig thứ hai mà không đánh dấu `default`,
   discovery có thể chọn nhầm — hiện chỉ 1 class/file, an toàn.

## 8. Fix round 1 — R1A2-01..03 + S1–S3/D-01 (session F04-FIX-BACKEND)

Sửa theo peer-review round 1 (`round1-A1-reviews-A2.md`,
`round1-A5-reviews-A1-plus-security.md`), chưa commit:

- **R1A2-01 (P2, double-charge race)**: model mới `AiRefineOperation`
  (claim per (author, idempotency_key), unique
  `uniq_f04_author_key_operation`, index (author, created_at), chỉ chứa key
  + payload hash — KHÔNG nội dung câu) + migration
  `0003_airefineoperation`. Flow refine mới: replay-check AiSuggestion →
  atomic ngắn claim INFLIGHT (IntegrityError → COMPLETED → replay; suggestion
  mất → 409 `duplicate_key_state_mismatch` trạng thái lạ; INFLIGHT mới <
  TTL 60s → 409 `slot_unavailable refine_in_progress`; INFLIGHT stale →
  đối chiếu outcome-unknown: xóa claim + claim lại, chỉ same payload được
  đi tiếp, khác payload → 409) → provider NGOÀI atomic (giữ nguyên) →
  finalize atomic ngắn: insert AiSuggestion + claim COMPLETED cùng
  transaction; IntegrityError → re-read winner trả replay, reconcile claim.
  TTL 60s = `REFINE_OPERATION_TTL_SECONDS` (comment trong express.py;
  retry là user-initiative, không bao giờ tự resend). Deletion hook F15 xóa
  cả claim của user (không thì replay-sau-xóa dính 409 claim-completed).
  Test mới 5 ca (inflight fresh 409 không gọi provider; stale same-payload
  retry OK 1 lần provider call; stale khác payload 409; COMPLETED mất
  suggestion 409; thành công → COMPLETED + replay không gọi provider).
- **R1A2-02 (P2, timeout chết)**: `_call_provider` truyền
  `timeout_seconds=None` (bỏ hằng 15 đè) → provider dùng `self.timeout_seconds`
  đã wire từ `GEMINI_TIMEOUT_SECONDS`. Test mới: settings 3s → fake transport
  ghi nhận `timeout == 3` qua đường service thật.
- **R1A2-03 (P3, wording kill switch)**: sửa trung thực ở §1/§3/§5 bảng
  trên + docstring `wiring.py`: re-read là **object settings Django** tại
  request time; đổi env production vẫn cần restart/redeploy process Render
  để settings reload (chỉ `override_settings` test có hiệu lực tức thì).
- **S2 (SEC, log 500)**: nhánh IntegrityError mà không thấy winner KHÔNG
  còn re-raise gốc (traceback có SQL params chứa `original_text`) → raise
  `TemporarilyUnavailable({"reason": "refine_race_unresolved"}) from None`
  (503 trung thực, cắt chain). 2 test mới: API trả 503 không 500;
  `__cause__` None + `__suppress_context__` True.
- **S1 (SEC, test gap)**: test mới kill-switch flip NGAY TRONG provider
  call (`kill_switch_active` False trước call → flip giữa chừng → finalize
  recheck chặn): 503, 0 suggestion, guard_checks [False, True].
- **S3/D-01 (CORS preflight)**: 2 test mới trong
  `backend/core/tests/test_cors.py`: (a) `CORS_ALLOW_HEADERS` chứa
  `x-idempotency-key`; (b) OPTIONS preflight thật tới `/api/v1/ai/refine`
  (Origin + Access-Control-Request-Headers) → 200 + header được echo trong
  `Access-Control-Allow-Headers` (corsheaders chạy đủ trong test client).
- **F5 Python-side (yêu cầu từ FIX-SHARED)**: 1 test pin ĐÚNG 10 field
  `AiSuggestion.view()` (list + thứ tự) khớp
  `DOCUMENTED_SUGGESTION_DTO_FIELDS` trong
  `packages/family_bridge_shared/tests/f04-contract.test.mjs` — chốt drift
  serializer↔mock hai chiều; quy tắc cập nhật đồng thời 2 test ghi trong
  docstring test.
- **Deletion hook R1A2-01 hygiene**: `AiSuggestionDeletionHook` xóa cả
  `AiRefineOperation` của user (nếu không, replay-sau-xóa dính 409
  claim-completed-mất-suggestion thay vì "fresh generation, không hồi
  sinh" như hợp đồng C9) + 1 test riêng.
- **A5 race test MySQL-gated (`test_concurrent_same_key_single_provider_effect`)**:
  kỳ vọng `errors == []` của test này viết cho chế độ “loser replay winner”;
  sau fix R1A2-01, loser thật-song-song nhận 409 `slot_unavailable` (đúng
  thiết kế chống double-charge) — test vẫn skip trên SQLite (FB_TEST_DB),
  KHÔNG thuộc ownership của session fix này; cần A5/coordinator cập nhật
  disposition khi chạy MySQL evidence.
