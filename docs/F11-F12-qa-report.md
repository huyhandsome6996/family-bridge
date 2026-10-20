# F11 / F12 — production test plan and result sheet (Render)

**Status:** DRAFT for PM review — **no test has been executed yet**. The `Actual`, `Pass/Fail`
and `Evidence` columns are intentionally empty and must be filled from an observed run only.

| Field | Value |
| --- | --- |
| Owner | QA (`@qa`) |
| Date drafted | 2026-10-20 |
| Features | F11 "Điểm tựa dự phòng" (backup supporters) · F12 "Đầu mối trường & Lịch hẹn" (school contacts & appointments) |
| Web under test | https://family-bridge-web.onrender.com (`#/supporters`, `#/appointments`) |
| Backend under test | https://family-bridge-backend.onrender.com (`/api/v1/supporters/*`, `/api/v1/appointments/*`) |
| Scope | End-to-end behaviour of F11 and F12 on the **deployed** site, plus the cross-cutting environment cases the PM asked for |
| Out of scope | Application-code changes, performance/load testing, Zalo device testing, any other feature |

## 1. Sources read to build this plan

Read in this session (documents and code, not marketing summaries):

- `AGENTS.md`, `docs/project-scope.md`, `docs/engineering/dsa-rules.md`,
  `.agents/skills/family-bridge-dsa/SKILL.md`, `docs/security/security-rules.md`,
  `.agents/skills/family-bridge-security/SKILL.md`
- `docs/product/admin-capabilities.md` (CAP-09 `appointment.assign`, CAP-10 `appointment.handle`),
  `docs/features/f11/{manifest,test}.md`, `docs/features/f12/{manifest,test}.md`
- Code: `packages/family_bridge_features/f11_supporters/{api,models}.py`,
  `packages/family_bridge_features/f11_supporters/services/supporters.py`,
  `packages/family_bridge_features/f12_appointments/{api,models}.py`,
  `packages/family_bridge_features/f12_appointments/services/appointments.py`,
  `packages/family_bridge_features/admin_core/{api,models}.py`,
  `packages/family_bridge_features/admin_core/services/admin.py` (scope-aware
  `has_capability`), `packages/family_bridge_features/f16_classroom/services/admin_provision.py`
  (scope-aware precedent `admin_scope` / `require_class_scope`),
  `packages/family_bridge_shared/src/adapter/http-endpoints.js`,
  `packages/family_bridge_shared/src/api/client.mjs`, `backend/core/wiring.py`,
  `backend/core/exceptions.py`, `web/src/pages/supporters/index.js`,
  `web/src/pages/appointments/index.js`, `web/src/adapter/web-adapter.js`,
  `web/tests/qa-web-invariants.test.mjs`
- Project memory notes: `f11-supporters`, `f12-appointments`, `privacy-and-data-isolation`,
  `mock-toolbars-and-payload-rejection`

## 2. Environment evidence collected (read-only, 2026-10-20)

| Target | Method | Result | Note |
| --- | --- | --- | --- |
| `GET /api/v1/health/` | anonymous | **200** `{"status":"ok"}` (653 ms) | The real health path is `/api/v1/health/`, **not** `/health` (root `/health` = 404) |
| `GET /api/v1/ready/` | anonymous | **200** `{"status":"ok"}` (982 ms) | Same: `/api/v1/ready/` is the real path |
| `GET /api/v1/supporters/roles` | anonymous | **401** | F11 route mounted, auth enforced |
| `GET /api/v1/appointments/directory` | anonymous | **401** | F12 route mounted, auth enforced |
| `GET /api/v1/appointments/requests` | anonymous | **401** | F12 route mounted, auth enforced |
| `GET https://family-bridge-web.onrender.com/` | anonymous | **200**, 844 bytes, asset `./assets/index-B7WgjvvI.js` | The deployed bundle contains `https://family-bridge-backend.onrender.com` (HTTPS backend, no localhost/mock fallback) |

No login, no write and no mutation was performed while collecting this evidence.

## 3. How to run

1. Satisfy the preconditions in §4 first — most cases are `NOT_RUN` without them.
2. Warm up the backend (Render free cold start ≈ 50–60 s): `GET /api/v1/health/` about a minute
   before the run.
3. UI cases: drive the deployed site in a browser. API cases: same endpoints with a bearer token
   from `POST /api/v1/auth/class-session` `{ "code": "HS…", "password": "…" }`.
4. Fill `Actual` with the **observed** result (verbatim UI copy, HTTP status, error-envelope
   `code`/`details`), `Pass/Fail` with `Pass` / `Fail` / `NOT_RUN`, and `Evidence` with a
   screenshot file name + UTC timestamp + the request/response line. Never paste a token, a
   password or real personal data into this file (SEC-10, SEC-19, SEC-22).
5. `Pass` = the observed behaviour matches `Expected` exactly. `Fail` = anything else.
   `NOT_RUN` = blocked by a missing precondition — name the precondition ID.
   **No case may be marked Pass from code reading alone.**

**Current production reachability of F12 (read from the code on 2026-10-20).**
`AppointmentService` gates `create_request`, `list_own`, `get_request`, `queue_for_handler`,
`claim`, `propose_slot`, `cancel` and `complete` on `_staff_directory()`
(`packages/family_bridge_features/f12_appointments/services/appointments.py:101,127,142,148,166,186,270,293`).
While **no** `appointment.handle` / `appointment.assign` grant exists, every one of those
endpoints answers **503 `scheduling_no_staff`** — so in production today only
`GET /api/v1/appointments/directory` is usable (auth-only, no staff gate); `accept_slot` /
`decline_slot` are ungated but unreachable because proposing a slot is gated. Until P-04 is
satisfied, most F12 cases are `NOT_RUN` by construction, and QA-F12-03 (the honest 503) is the
only F12 case that can actually run.

## 4. Production test data preconditions

| ID | Precondition | How to obtain it | Blocks |
| --- | --- | --- | --- |
| P-01 | **Student account** (server role `student`), class login code `HS…` + the shared class password; able to log in at `#/login` | Admin-provisioned classroom pair (`manage.py provision_classroom`) | all student cases |
| P-02 | **Supporter account** (role `caregiver` or a second student) that exists as an *active* user row | Same provisioning flow | F11 supporter-side cases |
| P-03 | **ACTIVE F01 connection** between P-01 and P-02 (classroom pairs create it with `source=admin_provisioned`; otherwise both sides confirm a proposal) | Provisioning or `#/proposal` | QA-F11-02/05/06/07 — the invite dropdown `#invite-person` only lists current connections, and the contact transport re-checks the connection at its current generation |
| P-04 | **School-staff account with a live `AdminCapabilityGrant`**: `capability = appointment.handle` (or `appointment.assign`), `revoked_at IS NULL`, `expires_at` in the future. Record the grant's `scope_type` / `scope_ref` (global, or school + the class/school ref) so QA-F12-25 can be executed | ⚠ **Blocking gap**: `POST /api/v1/admin/capabilities/grant` validates against `KNOWN_CAPABILITIES` (`packages/family_bridge_features/admin_core/models.py:44`), which does **not** contain `appointment.handle`. The grant therefore cannot be created through the admin API — it needs a DB-level insert on the Render database (or the capability list must be extended). ⚠ The grant's **scope is ignored** by the F12 wiring (R-05), so record it anyway | all F12 staff cases; until it exists the site must return the honest 503 (see R-02) |
| P-05 | **Verified school contacts** in the directory | Production wiring returns exactly **one hardcoded verified contact** (`sch-counselor-01`, `review_due 2027-04-11`, `backend/core/wiring.py:113`). Unverified / retired / expired-review contacts **cannot be produced in production** without a data or code change | QA-F12-02 fully; the "unverified hidden" variant runs in the isolated harness `tests/feature-lab` and is marked `NOT_RUN` on production (R-03) |
| P-06 | A **future UTC instant** for slot proposals (30-minute window, `SLOT_MINUTES = 30`) | e.g. tomorrow 09:00Z | QA-F12-09 … QA-F12-13 |
| P-07 | Two clean browser profiles (student + supporter/staff) plus a **390 px mobile viewport**; no stored session — the token lives in memory only (SEC-10) | Private window, separate browser profiles | QA-ENV-05, QA-F11-18, QA-F12-22 |
| P-08 | **Synthetic content only**: display names `HS QA A` / `PH QA B`, note text `QA synthetic note`. No real student data, no real phone numbers | — | every case |
| P-09 | **Warm-up** of the backend right before the run | `GET /api/v1/health/` ~1 min before | QA-ENV-03 |
| P-10 | **Cleanup plan**: after the run, cancel the created appointment requests and revoke the created supporter roles; note any rows left behind for the owner | — | end of session |

## 5. Test cases

### 5.1 F11 — Backup supporters (web `#/supporters`, API `/api/v1/supporters/*`)

| ID | Feature | Priority | Role/account | Steps | Expected | Actual | Pass/Fail | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-F11-01 | F11 supporters | Critical | Student (P-01) | 1. Log in at `#/login`. 2. Open `#/supporters`. 3. Read the `GET /api/v1/supporters/roles` response. | Page title "Điểm tựa dự phòng của con"; response **200** `{"results":[…]}` listing **only the student's own roles**; the F13 link "Trang tìm trợ giúp (F13)" is present | | | |
| QA-F11-02 | F11 supporters | Critical | Student (P-01) | 1. In "Mời thêm điểm tựa", pick a connected person in `#invite-person` and a relationship in `#invite-kind`. 2. Submit the form. | `POST /api/v1/supporters/roles` → **201**, `status="pending"`; UI alert "Lời đề nghị làm điểm tựa đã được chuyển đi thành công."; the role appears under "Lời mời đang chờ phản hồi"; the copy "Đã gửi" is **not** used | | | |
| QA-F11-03 | F11 supporters | Critical | Supporter (P-02) | 1. Log in as the invited supporter. 2. Open `#/supporters` (caregiver view). 3. Click "Đồng ý hỗ trợ". | `POST /api/v1/supporters/roles/{id}/respond` `{decision:"accept"}` → **200**, `status="active"`, `expires_at` = now + 90 days (`ROLE_TTL_DAYS`); the student now sees the supporter under "Điểm tựa đang đồng hành" with a "Nhắn tin" button | | | |
| QA-F11-04 | F11 supporters | High | Supporter (P-02) | Click "Từ chối" on a pending role; then try to accept the same role again via the API. | `respond {decision:"decline"}` → **200**, `status="declined"`; decline is **one-way** — a later accept returns the role unchanged (still `declined`); the student sees no active supporter for that pair | | | |
| QA-F11-05 | F11 supporters | Critical | Student (P-01) | 1. Click "Nhắn tin" on the active supporter. 2. Type a **new** message. 3. Click "Gửi tin nhắn". | `POST /api/v1/supporters/roles/{id}/contact` with body **only** + `X-Idempotency-Key` → **201** `{"state":"sent"}`; alert "Tin nhắn đã được chuyển tới {name}. Nếu cần giúp khẩn cấp, con hãy mở trang Trợ giúp."; the string "Đã gửi" does **not** appear (SEC-07) | | | |
| QA-F11-06 | F11 supporters | Critical | Student (API) | `POST …/contact` with `body` **plus** extra fields (`draft_id`, `journal_page`, `quoted_letter`, `mood`, `original_text`). | **400** `input_invalid` — unknown fields rejected; nothing from F06/F07/F08 is copied into the message (SEC-05) | | | |
| QA-F11-07 | F11 supporters | Critical | Student (API) | Send the **same** `X-Idempotency-Key` twice with the same body; then send it once with a **different** body. | The replay returns the **same** `message_id` and creates **no** second message; a different body under the same key → **409** `duplicate_key_payload_mismatch` (SEC-07) | | | |
| QA-F11-08 | F11 supporters | High | Student (API) | `POST …/contact` **without** `X-Idempotency-Key`. | **400** `input_invalid`, `details.reason="required_for_send"`; no message created | | | |
| QA-F11-09 | F11 supporters | High | Student (UI + API) | Send an **empty / whitespace-only** body (UI) and the same via the API. | UI blocks with "Vui lòng nhập nội dung lời nhắn." and sends **no** request; API → **400** `input_invalid` (reason `empty` / `too_short`) | | | |
| QA-F11-10 | F11 supporters | High | Student (UI + API) | Type more than 4000 characters in the textarea (UI); send a 4001-character body via the API. | UI field caps input at 4000 (`maxlength`); API → **400** `input_invalid` `too_long` (`max=4000`); no message stored (SEC-14) | | | |
| QA-F11-11 | F11 supporters | Critical | Student (P-01) | 1. Revoke the active role ("Dừng" → confirm). 2. Immediately try to send another message to the same supporter (UI **and** API). | Revoke → **200**, `status="revoked"`; the follow-up contact → **400** `input_invalid` `details.reason="supporter_not_available"`; the "Nhắn tin" button is gone; no message is sent | | | |
| QA-F11-12 | F11 supporters | High | Student + Supporter | After the revoke, read `GET /api/v1/supporters/roles` and `GET /api/v1/supporters/commitments` for both accounts. | The revoked role appears in **neither** list (excluded by status); no stale contact path survives the revoke (SEC-03) | | | |
| QA-F11-13 | F11 supporters | Critical | Supporter (P-02, API) | As the supporter: `GET /api/v1/supporters/roles`; `GET /api/v1/supporters/roles/{id}` of another pair; `POST …/respond` and `POST …/revoke` on a role that is not theirs. | `roles` / `commitments` are owner-scoped (the supporter sees only their own commitments); responding to or revoking somebody else's role → **404** `role_not_found`; no cross-student enumeration (SEC-03) | | | |
| QA-F11-14 | F11 supporters | High | Supporter (P-02, API) | As the supporter: `GET /api/v1/admin/capabilities`, `GET /api/v1/admin/dashboard`, `GET /api/v1/appointments/queue`. | **404** on every admin surface (no capability → the surface does not exist); a supporter role grants **no** admin access and no visibility into other students (SEC-04) | | | |
| QA-F11-15 | F11 supporters | Medium | Student (API) | `POST /api/v1/supporters/roles` with `relationship_kind="boss"`, with an unknown extra field, and with `supporter_id` = own user id. | **400** `invalid_kind` (allowlist shown); **400** for the unknown field; **400** `cannot_invite_self` | | | |
| QA-F11-16 | F11 supporters | Medium | Third, unrelated account | `GET /api/v1/supporters/roles/{id}` for a role of another pair. | **404** `role_not_found` — existence is not leaked | | | |
| QA-F11-17 | F11 supporters | High | Student (P-01) | Leave the "Nhắn tin" modal open for more than 300 s (and across a page reload), then click "Gửi tin nhắn". | **Nothing** is sent by the timer and no send job is created; the message goes out only on the explicit click; **no** auto-forward to another supporter (SEC-07, F11 scope rule) | | | |
| QA-F11-18 | F11 supporters | Medium | Student (P-01) | Reload `#/supporters` (F5); then navigate away and back. | The in-memory token is gone → the app returns to the login screen; after re-login the list loads normally. **Expected behaviour (SEC-10), not a defect** | | | |
| QA-F11-19 | F11 supporters | Medium | Student (P-01) | Open the contact modal and read the privacy line. | "Lời nhắn MỚI của con sẽ được gửi trực tiếp tới điểm tựa. Không đính kèm thư cũ hay nhật ký." is shown; there is **no** control to attach a draft, journal page or mood | | | |
| QA-F11-20 | F11 supporters | Medium | Student (P-01) | Submit the invite form with no person selected. | UI blocks with "Vui lòng chọn người cần mời làm điểm tựa."; **no** request is sent | | | |

### 5.2 F12 — School contacts & appointments (web `#/appointments`, API `/api/v1/appointments/*`)

| ID | Feature | Priority | Role/account | Steps | Expected | Actual | Pass/Fail | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-F12-01 | F12 appointments | Critical | Anonymous | `GET /api/v1/appointments/directory`, `/requests`, `/queue` without a token. | **401** `not_authenticated` on all three (routes mounted, auth enforced) | | | |
| QA-F12-02 | F12 appointments | Critical | Student (P-01) | Open `#/appointments`; read the directory card and the network tab. | `GET /directory` → **200**; **only verified contacts** are listed; each entry shows "Đã xác minh" plus operating hours; the "Gọi …" button exists only for a verified contact that has a phone, and its `href` is `tel:<digits>` — **no** tap-to-call auto-trigger (SEC-24) | | | |
| QA-F12-03 | F12 appointments | Critical | Student (P-01), **no** staff grant (P-04 not satisfied) | Open `#/appointments`, then try to submit a request. | `GET /requests` → **503** `module_unavailable`, `details.reason="scheduling_no_staff"`; the page shows the honest closed-scheduling copy — "Hệ thống đặt lịch hẹn hiện đang tạm đóng do nhà trường đang sắp xếp nhân sự tiếp nhận." plus "Bạn vẫn có thể liên hệ trực tiếp với các đầu mối trên danh bạ hoặc tìm trợ giúp khẩn cấp qua tổng đài 111." — and **no** booking form; submitting shows "Hiện chưa có nhân sự tiếp nhận lịch hẹn. Vui lòng thử lại sau." **See R-01: this case is expected to FAIL on the current build** | | | |
| QA-F12-04 | F12 appointments | Critical | Student (P-01, staff grant active) | Submit a request with topic `hoc_tap` and a short note. | `POST /api/v1/appointments/requests` → **201**, `status="submitted"`; UI alert "Yêu cầu hẹn gặp đã được chuyển tới nhà trường."; the card shows badge "Đang chờ tiếp nhận"; the copy never claims an appointment exists and never says "Đã gửi" | | | |
| QA-F12-05 | F12 appointments | Critical | Staff (P-04) | Log in as the staff account, open `#/appointments`, click "Tiếp nhận xử lý" on the new request. | `POST /api/v1/appointments/requests/{id}/claim` → **200**, `status="assigned"`, `handler_id` set; the request leaves the unassigned list | | | |
| QA-F12-06 | F12 appointments | Critical | Staff (P-04) | **Before** claiming (use a second submitted request), read `GET /api/v1/appointments/queue` and `GET /api/v1/appointments/requests/{id}`. | The request is visible to the capable handler but the response has **no `note` field** — the student's private note is masked until the handler claims it (SEC-03) | | | |
| QA-F12-07 | F12 appointments | Critical | Staff (P-04) | After claiming, read `GET …/requests/{id}` and `GET /queue` again; a second capable staff account reads the same request. | The assigned handler now sees the `note`; the other staff account still gets **404** `request_not_found` (no scope leak) | | | |
| QA-F12-08 | F12 appointments | Critical | Staff (P-04, grant revoked mid-flow) | Revoke the staff capability, then read `GET …/requests/{id}` and try to propose a slot. | **404** `request_not_found` immediately after revocation; the note is no longer readable — the check happens at read time, not from a cache (SEC-03, SEC-09) | | | |
| QA-F12-09 | F12 appointments | Critical | Staff (P-04) | Click "Đề xuất giờ hẹn" with a future UTC ISO timestamp (P-06). | `POST …/slots` → **201**, `status="slot_proposed"`; the response note says "chưa có lịch hẹn nào cho tới khi học sinh xác nhận"; the student sees "Thời gian đề xuất: …" with "Đồng ý giờ này" / "Từ chối" | | | |
| QA-F12-10 | F12 appointments | Critical | Student (P-01) | Click "Đồng ý giờ này" on the proposed slot. | `POST …/slots/{slotId}/accept` → **200**, `status="scheduled"`; the card badge becomes "Đã chốt lịch hẹn"; **before** accepting, the student is never told an appointment exists | | | |
| QA-F12-11 | F12 appointments | High | Student (P-01) | Click "Từ chối" on the proposed slot. | `POST …/slots/{slotId}/decline` → **200**, `status="assigned"` (the handler may propose another time); the student is not left in `slot_proposed` | | | |
| QA-F12-12 | F12 appointments | High | Staff + Student | Staff proposes slot A, then slot B; the student tries to accept slot A. | Slot A becomes `superseded`; accepting it → **409** `preview_stale` (`details.reason="newer_proposal_exists"`); only the newest slot can be accepted (SEC-15) | | | |
| QA-F12-13 | F12 appointments | High | Staff (P-04) | With an accepted slot on the same 30-minute window, propose an overlapping slot for the same handler. | **409** `slot_unavailable` (`details.reason="handler_already_booked"`) — handler capacity is 1 per window (SEC-15) | | | |
| QA-F12-14 | F12 appointments | High | Student (P-01) | Click "Hủy yêu cầu" → confirm; then cancel the same request again via the API. | First cancel → **200** `status="cancelled"`; the second cancel is **idempotent** (200 `cancelled`, no error, no state change) | | | |
| QA-F12-15 | F12 appointments | High | Staff (P-04) | On a `scheduled` request, click "Đánh dấu hoàn thành"; the requester tries the same call. | Handler → **200** `status="completed"`; the requester → **404 / 400 `request_not_completable`** — only the assigned handler completes a meeting | | | |
| QA-F12-16 | F12 appointments | Critical | Unrelated third account | `GET …/requests/{id}`, `POST …/cancel`, `POST …/slots/{slotId}/accept`, `GET /queue`. | **404** `request_not_found` for every call; no existence leak, no note leak, no queue access (SEC-03) | | | |
| QA-F12-17 | F12 appointments | High | Student (API) | `POST …/requests` with topic `suck` (outside the allowlist), with an unknown extra field, and with an empty note. | **400** `invalid_topic` (allowlist shown); **400** for the unknown field (SEC-05); an **empty note is accepted** (201) because the note is optional | | | |
| QA-F12-18 | F12 appointments | High | Student (API) | `POST …/requests` with a 4001-character note. | **400** `input_invalid` `too_long` — the implementation bound is `MAX_TEXT_CHARS = 4000`. **Open question OQ-01**: the F12 acceptance directive said note ≤ 1000 characters; confirm which bound is authoritative before recording a verdict (SEC-14) | | | |
| QA-F12-19 | F12 appointments | High | Staff (API) | `POST …/slots` with `start_at="not-a-date"`, with a naive timestamp, and with a past timestamp. | **400** `must_be_iso_string`; **400** `must_be_tz_aware_iso`; **400** `must_be_in_future`; no slot row is created | | | |
| QA-F12-20 | F12 appointments | Medium | Account **without** the capability | `GET /api/v1/appointments/queue` and `POST …/claim` with an account that has no `appointment.handle` / `appointment.assign` grant. | **404** `request_not_found` for both — the queue never opens for an ungranted account (SEC-04) | | | |
| QA-F12-21 | F12 appointments | Medium | Student (P-01) | Read the confirmation alert and the request card copy. | "Yêu cầu hẹn gặp đã được chuyển tới nhà trường." only; the string "Đã gửi" appears nowhere; no promise of a confirmed appointment | | | |
| QA-F12-22 | F12 appointments | Medium | Student (P-01) | Reload `#/appointments` (F5); then navigate away and back. | The in-memory token is gone → back to the login screen; after re-login the page loads normally. **Expected behaviour (SEC-10), not a defect** | | | |
| QA-F12-23 | F12 appointments | Medium | Student (P-01) | Look for the F13 help link in every state: normal list, 503 disabled-scheduling, and error state. | "Trang tìm trợ giúp (F13)" (`href="#/help"`) is **always** present, including when scheduling is disabled (immediate help access) | | | |
| QA-F12-24 | F12 appointments | Low | Student (API) | `POST …/requests` with a body larger than 64 KiB, and with malformed JSON. | **400** `input_invalid` (`body_too_large` / `malformed_json`); no row created, no 500, no stack trace (SEC-27) | | | |
| QA-F12-25 | F12 appointments | High | Staff with a **school-scoped** grant (`scope_type=school`, `scope_ref=X`), P-04 | Log in as a staff holder whose grant is scoped to school X; read `GET /api/v1/appointments/queue`, `GET …/requests/{id}` of a request outside that scope, and try `POST …/claim` on it. | The scoped staff sees **only** the objects inside scope: out-of-scope requests → **404** `request_not_found` and cannot be claimed — CAP-10 requires "Assigned + school match". **See R-05: expected to FAIL on the current build**, because the F12 wiring ignores `scope_type` / `scope_ref` (and the F12 request model carries no school identifier at all) | | | |
| QA-F12-26 | F12 appointments | Medium | Staff whose grant is **expired** (`expires_at` in the past) | With an expired `appointment.handle` grant, call `GET /api/v1/appointments/queue` and `POST …/claim`. | **404** `request_not_found` — an expired grant is treated as no capability (TTL is honoured, `wiring.py:95` filters `expires_at__gt=now`) | | | |

### 5.3 Cross-cutting — environment, browsers, copy, session

| ID | Feature | Priority | Role/account | Steps | Expected | Actual | Pass/Fail | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QA-ENV-01 | Environment | Critical | Any | `GET /api/v1/health/` and `GET /api/v1/ready/`. | **200** `{"status":"ok"}` for both; note the paths carry the `/api/v1` prefix — the root `/health` and `/ready` return 404 | | | |
| QA-ENV-02 | Environment | Critical | Anonymous | Call every F11/F12 endpoint without a token. | **401** on all of them; no 404/500; no data in the body | | | |
| QA-ENV-03 | Environment | High | Student (P-01) | Cold start: leave the backend idle, then log in and open `#/supporters` (or `#/appointments`). | The first request may take ≈ 50–60 s (Render free); the UI shows its loading state and then renders; the cold-start timeout is 60 s, so one retry may be needed — **not a defect**; the retry creates **no** duplicate role/request/message | | | |
| QA-ENV-04 | Environment | High | Student (P-01) | DevTools → Offline while the page loads, then again while submitting a contact and an appointment request. | The UI shows a real error state ("Vui lòng kiểm tra kết nối mạng rồi thử lại.") — **never** a fake success; no retry storm; no optimistic "sent" state (SEC-14, no auto-send) | | | |
| QA-ENV-05 | Environment | High | Student (P-01) | Repeat QA-F11-05 and QA-F12-04 in **Chrome, Firefox and Safari** (desktop), then at a **390 px** mobile viewport. | Identical behaviour in all three engines; no horizontal scroll at 390 px; the primary buttons and the call link stay reachable and ≥ 44–48 px tall | | | |
| QA-ENV-06 | Environment | Medium | Engineer | Run `node --test web/tests/qa-web-invariants.test.mjs` against the deployed commit. | **PASS** — the suite bans the copy "Đã gửi / Đã lưu nháp / Đã lưu / Đã chia sẻ" in `web/src`, plus `localStorage` / `sessionStorage` / `setInterval` | | | |
| QA-ENV-07 | Environment | Medium | Student (P-01) | Open `#/supporters` and `#/appointments` and read the DevTools console. | No uncaught exception, no missing asset (404), no unexpected console error | | | |
| QA-ENV-08 | Environment | High | Engineer | Fetch `https://family-bridge-web.onrender.com/` and its JS asset; search for the API origin and for storage usage. | The bundle contains `https://family-bridge-backend.onrender.com` (HTTPS) and **no** localhost / mock fallback; the token is **not** in the URL, in the bundle or in storage (SEC-10) | | | |
| QA-ENV-09 | Environment | Medium | Anonymous | Deep-link `https://family-bridge-web.onrender.com/#/supporters` and `…/#/appointments` without logging in. | The app returns to the login screen — no crash, no blank page, **no private data in the DOM** | | | |
| QA-ENV-10 | Environment | Medium | Student (P-01) | Log out (`POST /api/v1/auth/logout`), then press the browser Back button. | The session is revoked; private data is not re-rendered from a cache; the login screen is shown again (SEC-02, SEC-10) | | | |
| QA-ENV-11 | Environment | Medium | Student (P-01) | Open `#/supporters` and `#/appointments` and inspect the network tab. | Opening a page issues **only** GET requests — no role, request or message is created by a read (SEC-07) | | | |

## 6. Open questions for the PM

| ID | Question | Why it matters |
| --- | --- | --- |
| OQ-01 | F12 `note` bound: the implementation accepts up to `MAX_TEXT_CHARS = 4000` (`packages/family_bridge_core/validation.py:22`), while the F12 acceptance directive stated note ≤ 1000 characters. Which is authoritative? | QA-F12-18 cannot get a verdict until this is settled. **Source of the "1000" figure (checked on 2026-10-20): it does not appear in the repository docs** — it comes only from the F12 PM directive message ("note: max 1000 ký tự"). The repo's own bound (`MAX_TEXT_CHARS`) and the F12 test pack ("note bounds → 400") both point at 4000, so 4000 is the working assumption until the owner says otherwise |
| OQ-02 | How should the `appointment.handle` / `appointment.assign` grant be created on the production database, given that the admin API rejects it as an unknown capability (P-04)? | Without it, the whole F12 staff path (QA-F12-05 … QA-F12-15) stays `NOT_RUN` |
| OQ-03 | Is a data-driven school directory expected before the pilot, or is the single hardcoded verified contact the intended MVP state (P-05)? | Decides whether the "unverified contact hidden" case can ever run in production |
| OQ-04 | Who executes the run, and is DB-level access to the Render database available for P-04 and the P-10 cleanup? | Sets the scheduling of this plan |

## 7. Risks found while preparing this plan (code-level, **not** runtime-verified)

| ID | Severity | Finding | Evidence | Expected effect on production |
| --- | --- | --- | --- | --- |
| R-01 | High | The F12 web SPA can never reach the honest 503 copy: `web/src/pages/appointments/index.js:110` and `:366` read `err.data.reason`, but the shared `ApiError` exposes `code` / `details` (`packages/family_bridge_shared/src/api/client.mjs:13-24`) and the backend envelope is `{"error":{"code":"module_unavailable","details":{"reason":"scheduling_no_staff"}}}` (`backend/core/exceptions.py:18`). Every other web page reads `error.details.reason` (e.g. `web/src/pages/mood/index.js:53`, `web/src/pages/settings/index.js:40`). | source references above; **independently confirmed by the PM on 2026-10-20** | With no staff grant (the current production state), the page renders an empty request list **with an enabled booking form** instead of the "tạm đóng" card, and submitting shows the generic "Không thể gửi yêu cầu: …" instead of "Hiện chưa có nhân sự tiếp nhận lịch hẹn." — i.e. **F12-AC-02 is not met in the web app**. Reproduce with QA-F12-03 / QA-F12-04 |
| R-02 | Medium | `appointment.handle` cannot be granted through `POST /api/v1/admin/capabilities/grant` — `KNOWN_CAPABILITIES` (`packages/family_bridge_features/admin_core/models.py:44`) does not contain it, so the call is rejected as `unknown_capability` | source reference above | The F12 staff path is untestable in production until the grant is created another way (P-04). **Confirmed by the PM on 2026-10-20** (`admin.py:73` + `api.py:191` reject it) |
| R-03 | Medium | The production school directory is a hardcoded list of one contact (`backend/core/wiring.py:113-131`); there is no unverified / retired / expired-review record to filter | source reference above | QA-F12-02's "unverified hidden" variant cannot be exercised in production — run it in `tests/feature-lab` and mark the production variant `NOT_RUN` |
| R-04 | Low | Reloading `#/supporters` or `#/appointments` loses the in-memory token, so the user is returned to the login screen | `packages/family_bridge_shared/src/session.js`, SEC-10 | Expected behaviour, not a defect — recorded so it is not filed as a bug (QA-F11-18, QA-F12-22) |
| R-05 | High | **The F12 staff gate ignores the grant's scope.** `ProductionStaffDirectory.list_handlers()` and `has_capability()` filter only on capability + `revoked_at IS NULL` + `expires_at` — never on `scope_type` / `scope_ref` (`backend/core/wiring.py:84-110`), so a `scope_type=school` grant behaves like a global one. The scope-aware logic already exists elsewhere in the codebase: `AdminCapabilityService.has_capability()` (`packages/family_bridge_features/admin_core/services/admin.py:48-68`) and the F16 classroom precedent `admin_scope()` / `require_class_scope()` (`packages/family_bridge_features/f16_classroom/services/admin_provision.py:106-127`). On top of that, `AppointmentRequest` carries **no school / class identifier** (`packages/family_bridge_features/f12_appointments/models.py:41-59`), so "school match" cannot be enforced on the object either | source references above; requirement in `docs/product/admin-capabilities.md` (CAP-10 "Assigned + school match", R-STAFF "scope school và request được phân công") | A staff holder of a school-scoped grant sees **every** unassigned submitted request school-wide (note masked until claim) and can claim any of them; CAP-10 scope matching is not enforced on the F12 path. Two layers must be fixed together: the wiring must honour `scope_type`/`scope_ref`, **and** the request model needs a school/class reference to match against. Reproduce with QA-F12-25 (expected FAIL today) |

## 8. Safety rules for the run

- Synthetic accounts and synthetic content only (P-08). No real student data, no real phone numbers.
- No destructive production action: no account deletion, no forced revocation of real staff grants, no
  load testing, no fuzzing of other endpoints. F11 revoke / F12 cancel are part of the test data
  set only.
- Production database access is limited to P-04 (grant) and the P-10 cleanup list; everything else
  goes through the public API.
- Never paste a token, password, invite code or private body into this file or into chat
  (SEC-10, SEC-19, SEC-22).
- This file is a test plan and a result sheet. It does not mark any US Done, does not certify a
  SEC control and does not replace the F12/F11 feature-level test packs in `docs/features/`.
