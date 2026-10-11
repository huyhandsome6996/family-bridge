# F01 — Đăng nhập Zalo và kết nối người đồng hành (B01)

US: US-011 (F01a), US-013 (F01b). FL: FL-01, FL-02, FL-03, FL-20 (phần connection).
WF: WF-01, WF-02, WF-08, WF-11. SEC: SEC-01/02/05/06/14/15/22.

## Phạm vi nhánh này

- Backend Django app `family_bridge_features.f01_identity` (label `f01_identity`):
  ProviderIdentity, Session, ConsentRecord, ConnectionInvite, ClaimAttempt,
  Connection; services identity/invites/zalo_provider; API /api/v1/auth,
  /api/v1/consents, /api/v1/connections.
- Mobile module `packages/family_bridge_mobile/f01_identity/`: onboarding
  (consent rõ từng purpose, không preselect), trang kết nối (tạo/nhập mã,
  xác nhận hai bên, hủy kết nối), api.js wrappers.
- F01 là OWNER của Connection và MessageTransport? Không — F01 sở hữu
  Connection; MessageTransport thuộc F05. F01 cung cấp ConnectionReader port
  (`InviteService.active_connection_between/get_connection/list_active_for_user`)
  cho F05/F15 dùng qua `family_bridge_core.protocols.ConnectionReader`.

## Không thuộc phạm vi

- Không tạo web client riêng; không chạm `backend/**`, `zalo-mini-app/**`
  (A/B ownership); không thêm endpoint admin (B16); không gửi notification.
- Không tự xác minh Zalo thật: ZALO_APP_ID/SECRET chưa có (external-inputs.md);
  ZaloPlatformVerifier được viết đầy đủ và test bằng HTTP double có căn cứ
  theo tài liệu Zalo ngày 11/10/2026; bài test trên thiết bị thật thuộc US-049.

## Quyết định kỹ thuật có ghi nhận

- Session TTL 24h (P-04 provisional; DEC-14 mở) — token 32 byte urlsafe,
  lưu SHA-256, revoke server-side.
- Mã mời: 12 ký tự alphabet không nhập nhằng (bỏ I/1/O/0), entropy ~57 bit,
  TTL 7 ngày (P-03 provisional), single-use, rate limit 30 claim/giờ/actor
  lưu DB (hoạt động đa instance).
- Connection dùng cặp canonical (party_low < party_high) + UNIQUE(pair, active);
  reconnect là invite mới → generation = trước + 1; revoke giữ generation.
- Consent theo purpose (service/ai_processing/research) + version; login không
  suy consent; withdrawal giữ ledger row.
