# Privacy lifecycle — F07 (trung thực theo implementation)

## Riêng tư mặc định

- Mục tạo mới không có grant nào; UI hiển thị "Chỉ mình bạn — mặc định riêng
  tư" TRƯỚC khi lưu; không có bất kỳ đường tự chia sẻ khi lưu/kết nối/đăng
  nhập/tham gia chương trình. Không auto-send, không timer tự hành động
  (mini-app QA test cấm `setInterval` + chuỗi over-claim trên toàn `src/`).

## Preview → xác nhận

- Sheet chia sẻ hiển thị NGUYÊN phần sẽ chia sẻ (ngày, nhãn cảm xúc, TOÀN BỘ
  ghi chú, revision) — không quảng cáo "chỉ cảm xúc" trong khi API gửi cả note.
- Xác nhận gửi `expected_revision` = revision đang xem trước. Máy chủ so trong
  request: lệch → 409 `stale_revision`, v2 không bao giờ lọt qua xác nhận v1.
- Đổi nội dung/người nhận khi sheet mở: xác nhận vẫn an toàn vì máy chủ là
  nơi kiểm; client không tự "cập nhật preview" im lặng.

## Sửa mục (edit)

- PATCH → revision+1. Grant cũ bind revision cũ: người nhận KHÔNG đọc được bản
  mới (404 `entry_edited_not_reshared`) và không tiếp tục đọc được cả bản cũ
  (approved_revision != entry.revision → 404). UI owner: "Lưu sẽ tạo phiên bản
  mới KHÔNG tự chia sẻ lại".
- Trạng thái trong "Người đã nhận mục này" đổi thành `stale_revision` (badge
  "Bản cũ — cần chia sẻ lại") — owner thấy thật, không bị nói là đang active.

## Thu hồi (revoke)

- Owner revoke 1 share → `revoked_at` ghi ngay; MỌI request đọc mới của người
  nhận đó cho entry đó → 404. Không đụng share khác/mục khác (test scoped).
- Lặp revoke idempotent (200, không đổi thời điểm).
- F15 overview/revoke dùng cùng bảng: revoke từ `/privacy/grants/mood_entry/…`
  chặn đọc F07 ngay (integration test + E2E step 16).
- UI sau revoke: badge `revoked`, nút thu hồi ẩn; lỗi thu hồi KHÔNG báo thành
  công (feedback giữ trạng thái cũ, cho thử lại).

## Hủy kết nối / kết nối lại

- Unlink → reader trả None → đọc 404, danh sách phía nhận rỗng (E2E step 17).
- Reconnect tạo Connection MỚI (id + generation tăng): grant cũ vẫn 404 vì
  binding (connection_id, generation) không khớp — kể cả hai UUID giống hệt.
- Chỉ hành động chia sẻ TƯỜNG MINH của owner (gọi share khi connection mới
  active) mới rebind grant về connection hiện hành. Không có "connection active
  lại → quyền cũ sống lại".

## Cache / màn đang mở / thiết bị

- Server: mỗi request re-check toàn bộ (grant, revision, connection identity +
  generation) — không cache quyền nào để lỗi thời.
- Client: session in-memory (không storage bền vững) — reload trang = đăng nhập
  lại (đã kiểm trên browser thật); nội dung shared chỉ nằm trong DOM trang;
  đăng xuất/đổi actor bỏ DOM theo router destroy.
- Mở lại chi tiết khi lần đọc trước còn trên màn: nội dung cũ bị GỠ trước khi
  hỏi lại máy chủ (fix sau khi phát hiện trong browser test — regression test
  "mở lại sau thu hồi" khóa hành vi này).
- Người nhận đang mở màn khi bị revoke từ thiết bị khác: lần TƯƠNG TÁC MỞ MỚI
  sẽ bị chặn ngay (đã kiểm). Ứng dụng KHÔNG có polling/websocket tự động —
  màn hình đang mở từ trước có thể còn nội dung đã tải hợp lệ trước đó cho đến
  khi người dùng thao tác tiếp; đây là giới hạn được nói rõ, không phải bảo
  đảm "xóa mọi bản sao tức thì".
- Bản sao ngoài ứng dụng (ảnh chụp màn hình) không thu hồi được — thông điệp
  của F15 giữ nguyên, không tuyên bố điều ngược lại.

## Xóa dữ liệu (F15)

- Hook `mood`: xóa entry của user (cascade grant của các entry đó) + revoke
  grant user ĐÃ NHẬN (không đụng entry của người khác). Idempotent; báo cáo
  số liệu thật trong `detail`. `deletion requested` ≠ đã purge; trạng thái
  failed_needs_action được giữ trung thực bởi cơ chế F15.

## Log/telemetry

- Không log body/note/token; LOGGING console-only theo settings; lỗi mạng không
  đưa note vào message; error envelope không chứa private text (FORBIDDEN_DETAIL_KEYS).
