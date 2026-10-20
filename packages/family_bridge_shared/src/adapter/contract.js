// Hợp đồng adapter — NGUỒN DUY NHẤT của danh sách ADAPTER_METHODS (ADR-1,
// task 18-a). Danh sách 69 tên copy NGUYÊN VĂN từ
// zalo-mini-app/src/core/adapter/adapter.js; cả mini app lẫn web re-export
// từ file này để không thể drift giữa hai frontend.
//
// Bối cảnh (copy từ adapter.js cũ): hai chế độ KHÔNG trộn —
//   - mode "mock": fixtures synthetic, chỉ khi demo mode bật rõ ràng (?demo=1).
//   - mode "zalo"/production: ApiClient + (mini) zmp-sdk.
export const ADAPTER_METHODS = [
  "getBackendHealth",   // GET /api/v1/health/ -> 'ok' | throws ApiError
  "getBackendReady",    // GET /api/v1/ready/  -> 'ok' | 'unavailable' | throws
  "getConnectionStatus",// trạng thái kết nối gia đình (fixture ở mock; boundary ở zalo)
  // ---- F01: đăng nhập + đồng ý + kết nối hai phía ----
  "loginWithZaloToken", // getAccessToken (SDK) -> POST /api/v1/auth/session
  "trySilentLogin",     // đăng nhập lại im lặng một lần khi mở app
  "logout",             // POST /api/v1/auth/logout (token cũ đã chụp) + vô hiệu hóa phiên NGAY khi gọi
  "getMyProfile",       // GET /api/v1/auth/me — tên tự khai báo của mình
  "updateMyProfile",    // PUT  /api/v1/auth/me — đặt tên tự khai báo
  "listConsents",       // GET  /api/v1/consents
  "recordConsent",      // POST /api/v1/consents
  "createInvite",       // POST /api/v1/connections/invites
  "listInvites",        // GET  /api/v1/connections/invites
  "previewInvite",      // POST /api/v1/connections/invites/preview (read-only)
  "claimInvite",        // POST /api/v1/connections/invites/claim
  "confirmInvite",      // POST /api/v1/connections/invites/{id}/confirm
  "declineInvite",      // POST /api/v1/connections/invites/{id}/decline
  "cancelInvite",       // POST /api/v1/connections/invites/{id}/cancel
  "listConnections",    // GET  /api/v1/connections
  "revokeConnection",   // POST /api/v1/connections/{id}/revoke
  // ---- F06: nháp + tạm dừng 300s do MÁY CHỦ quyết + preview + xác nhận gửi ----
  // Tên endpoint khớp packages/family_bridge_mobile/f06_drafts/api.js và
  // backend family_bridge_features.f06_drafts (PAUSE_SECONDS = 300, cố định).
  "listDrafts",         // GET    /api/v1/drafts (keyset { results, nextCursor })
  "createDraft",        // POST   /api/v1/drafts
  "getDraft",           // GET    /api/v1/drafts/{id} (kèm server_time)
  "editDraft",          // POST   /api/v1/drafts/{id} (bump revision, giữ deadline)
  "discardDraft",       // DELETE /api/v1/drafts/{id}
  "pauseDraft",         // POST   /api/v1/drafts/{id}/pause (deadline máy chủ)
  "cancelDraftPause",   // DELETE /api/v1/drafts/{id}/pause
  "previewDraft",       // POST   /api/v1/drafts/{id}/preview (chỉ sau deadline)
  "confirmDraftSend",   // POST   /api/v1/drafts/{id}/confirm-send — HÀNH ĐỘNG
                        //   CUỐI CÙNG của người dùng, KHÔNG tự retry.
  // ---- Web (Task 2 — Render): đăng nhập lớp học + màn web mới ----
  // Tất cả thao tác GỬI (sendMessage/sendCard/signalSend/aiRefine) đều BẮT
  // BUỘC `key` do caller tạo tại nút xác nhận (crypto.randomUUID) — không có
  // cơ chế client tự gửi; mất response → UI tra cứu /operations/{key}.
  "loginWithCredentials", // POST /api/v1/auth/class-session {code,password}
  "getCapabilities",      // GET  /api/v1/auth/class-capabilities (best-effort)
  "changeClassPassword",  // POST /api/v1/auth/class-password
  "changeClassCode",      // POST /api/v1/auth/class-code
  "changeClassDisplayName", // POST /api/v1/auth/class-display-name
  "listClassProposals",   // GET  /api/v1/classroom/proposals
  "confirmClassProposal", // POST /api/v1/classroom/proposals/{id}/confirm
  "declineClassProposal", // POST /api/v1/classroom/proposals/{id}/decline
  "cancelClassProposal",  // POST /api/v1/classroom/proposals/{id}/cancel
  // ---- Admin cấp phát cặp HS/PH (CAP-23 classroom.provision, 18/10/2026) ----
  // Chỉ admin có grant còn hiệu lực; thiếu grant → backend 404. Mọi thao tác
  // GHI phải có batchRef do caller tạo (crypto.randomUUID) — idempotent.
  "adminListClasses",       // GET  /api/v1/classroom/admin/classes
  "adminPreviewPairs",      // POST /api/v1/classroom/admin/pairs-preview (read-only)
  "adminApplyPairs",        // POST /api/v1/classroom/admin/pairs-apply (+batch_ref)
  "adminBackfillInventory", // GET  /api/v1/classroom/admin/backfill-inventory
  "adminBackfillApply",     // POST /api/v1/classroom/admin/backfill-apply (+batch_ref)
  "listMessages",         // GET  /api/v1/messages (metadata, KHÔNG body)
  "getMessage",           // GET  /api/v1/messages/{id} (+ body)
  "markMessageRead",      // POST /api/v1/messages/{id}/read (recipient-only)
  "sendMessage",          // POST /api/v1/messages (+X-Idempotency-Key)
  "quickReplies",         // GET  /api/v1/messages/quick-replies
  "lookupOperation",      // GET  /api/v1/operations/{key} (tra cứu lost-response)
  "listCards",            // GET  /api/v1/cards
  "previewCard",          // POST /api/v1/cards/preview
  "sendCard",             // POST /api/v1/cards/send (+X-Idempotency-Key)
  "cardSnapshot",         // GET  /api/v1/cards/{id}
  "cardReplySuggestions", // GET  /api/v1/cards/{id}/reply-suggestions
  "signalMeta",           // GET  /api/v1/signals/meta (3 nhu cầu allowlist)
  "signalPreview",        // POST /api/v1/signals/preview
  "signalSend",           // POST /api/v1/signals/send (+X-Idempotency-Key)
  "signalDetail",         // GET  /api/v1/signals/{id}
  "signalAck",            // POST /api/v1/signals/{id}/ack (recipient-only)
  "aiStatus",             // GET  /api/v1/ai/status
  "aiRefine",             // POST /api/v1/ai/refine (+X-Idempotency-Key)
  "aiAccept",             // POST /api/v1/ai/suggestions/{id}/accept
  "aiDiscard",            // POST /api/v1/ai/suggestions/{id}/discard
  "helpDirectory",        // GET  /api/v1/help/directory (public, AllowAny)
  "privacyOverview",      // GET  /api/v1/privacy/overview
  "revokeGrant",          // POST /api/v1/privacy/grants/{type}/{id}/revoke
  "requestDeletion",      // POST /api/v1/privacy/deletion-requests
  "getDeletionRequest",   // GET  /api/v1/privacy/deletion-requests/{id}
  "cancelDeletionRequest",// POST /api/v1/privacy/deletion-requests/{id}/cancel
  "withdrawConsent",      // POST /api/v1/privacy/consents/{purpose}/withdraw
  "listDeletionRequests", // GET  /api/v1/privacy/deletion-requests/list (owner-only, cursor v2 "v2|<iso>|<id>")
  "createMoodEntry",      // POST /api/v1/mood/entries (F07 emotion allowlist)
  "listMoodEntries",      // GET  /api/v1/mood/entries (page_size mapping đúng)
  "getMoodEntry",         // GET   /api/v1/mood/entries/{id} (owner-only)
  "editMoodEntry",        // PATCH /api/v1/mood/entries/{id} (revision +1, auto un-share)
  "moodSummary",          // GET   /api/v1/mood/entries/summary (đếm mô tả)
  "listMoodEntryShares",  // GET   /api/v1/mood/entries/{id}/shares (trạng thái thật)
  "shareMoodEntry",       // POST  /api/v1/mood/entries/{id}/share (+expected_revision)
  "revokeMoodShare",      // POST  /api/v1/mood/shares/{id}/revoke
  "listSharedMoodEntries",// GET   /api/v1/mood/shared (phía nhận, có cursor)
  "getSharedMoodEntry",   // GET   /api/v1/mood/shared/{id} (recheck mỗi lần đọc)
  "programMy",            // GET  /api/v1/program/my (kèm opted-out)
  "programWeeks",         // GET  /api/v1/program/weeks/{program_key}
  "activitiesCatalog",    // GET  /api/v1/activities/catalog
  // ---- F11: Điểm tựa dự phòng ----
  "listSupporterRoles",
  "inviteSupporter",
  "respondSupporterRole",
  "revokeSupporterRole",
  "contactSupporter",
  "listSupporterCommitments",
  // ---- F12: Lịch hẹn & đầu mối trường ----
  "getSchoolDirectory",
  "listAppointmentRequests",
  "createAppointmentRequest",
  "getAppointmentRequest",
  "claimAppointmentRequest",
  "proposeAppointmentSlot",
  "acceptAppointmentSlot",
  "declineAppointmentSlot",
  "cancelAppointmentRequest",
  "completeAppointmentRequest",
  "getAppointmentQueue",

  "programCatalog",       // GET  /api/v1/program/catalog (published only)
  "programEnroll",        // POST /api/v1/program/enroll (pins revision)
  "programOptOut",        // POST /api/v1/program/opt-out (voluntary)
  "programProgress",      // POST /api/v1/program/progress (own-only)
  "programAgreementAccept",// POST /api/v1/program/agreement/accept (per-person)
  "programAgreement",     // GET  /api/v1/program/agreement?program_key=
  "programAgreementPropose",   // POST /api/v1/program/agreement/propose
  "programAgreementConfirm",   // POST /api/v1/program/agreement/{id}/confirm
  "programAgreementWithdraw",  // POST /api/v1/program/agreement/{id}/withdraw
  "activitiesInvites",    // GET  /api/v1/activities/invites (2 chiều)
  "activitiesInvite",     // POST /api/v1/activities/invites (F09 two-sided)
  "activitiesRespond",    // POST /api/v1/activities/invites/{id}/respond (invitee-only)
  // ---- F08: Nhật ký riêng và nhật ký song hành (US-016/US-031) ----
  "listJournalPrompts",       // GET    /api/v1/journal/prompts
  "listJournalPages",         // GET    /api/v1/journal/pages (?cursor=&page_size=&search=)
  "createJournalPage",        // POST   /api/v1/journal/pages
  "getJournalPage",           // GET    /api/v1/journal/pages/{id}
  "editJournalPage",          // PATCH  /api/v1/journal/pages/{id} (+expected_revision)
  "deleteJournalPage",        // DELETE /api/v1/journal/pages/{id}
  "listJournalPageShares",    // GET    /api/v1/journal/pages/{id}/shares
  "shareJournalPage",         // POST   /api/v1/journal/pages/{id}/share (+expected_revision)
  "revokeJournalShare",       // POST   /api/v1/journal/shares/{share_id}/revoke
  "listJournalPageReplies",   // GET    /api/v1/journal/pages/{id}/replies
  "listSharedJournalPages",   // GET    /api/v1/journal/shared
  "getSharedJournalPage",     // GET    /api/v1/journal/shared/{share_id}
  "replySharedJournalPage",   // POST   /api/v1/journal/shared/{share_id}/replies
  "listMyJournalReplies",     // GET    /api/v1/journal/my-replies
];
// ApiError ném từ adapter luôn có thuộc tính `kind` (phân loại tại nơi ném):
//   "configuration" | "network" | "timeout" | "http" | "invalid_response".
// UI PHẢI phân loại theo `kind`, không suy loại từ status 0 hay từ câu thông báo.
// Riêng ready: ApiError kind "http" + status 503 -> adapter trả 'unavailable'
// (trạng thái hợp lệ, không phải lỗi) — hợp đồng ready-503 giữ nguyên.
