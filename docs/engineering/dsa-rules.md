# Quy tắc DSA và hiệu năng bắt buộc

Áp dụng cho Django/DRF, MySQL và React trong Zalo Mini App. Mục tiêu là thao tác mượt, ít dữ liệu truyền và ít tài nguyên, đồng thời đúng quyền và đúng ý người viết. Đây là quy tắc thiết kế; ngân sách dưới đây chưa phải số đo sản phẩm.

Mục lục: [quy tắc](#quy-tắc), [lựa chọn](#lựa-chọn-theo-tác-vụ), [ngân sách](#ngân-sách-ban-đầu), [kiểm chứng](#kiểm-chứng), [ví dụ](#ví-dụ-phân-trang-hộp-thư), [nguồn](#nguồn-kỹ-thuật).

## Quy tắc

| ID | Agent phải làm | Agent không được làm |
| --- | --- | --- |
| DSA-01 | Ghi N tổng bản ghi, P số trả về, L độ dài nội dung; giới hạn đầu vào ở backend | Gọi thuật toán là “tối ưu” mà không nêu tải và đánh đổi |
| DSA-02 | Chọn cấu trúc theo đọc/ghi/thứ tự; dùng thư viện chuẩn khi đủ | Tự viết cây/heap/graph khi một query hoặc map đã đáp ứng |
| DSA-03 | Phân biệt CPU, bộ nhớ phụ, query, I/O và số byte | Đồng nhất Big-O nhỏ với UX nhanh hoặc bảo mật tốt |
| DSA-04 | Lọc quyền ở DB rồi phân trang/tổng hợp; kiểm tra grant hiện tại | Lấy tất cả dữ liệu rồi lọc ở client, cache quyền vô thời hạn |
| DSA-05 | Phân trang mọi lịch sử; thứ tự ổn định (created_at, id) bất biến | Dùng offset sâu cho lịch sử tăng nhanh mà không đo; tải toàn bộ sổ |
| DSA-06 | Tránh N+1 bằng select_related/prefetch có giới hạn; đo serializer | Prefetch toàn bộ quan hệ, dùng only/defer rồi query từng dòng |
| DSA-07 | Đề xuất index từ WHERE/JOIN/ORDER BY và kiểm tra EXPLAIN MySQL | Thêm index mọi cột; coi SQLite là bằng chứng hiệu năng MySQL |
| DSA-08 | Dùng transaction, unique constraint, khóa nhất quán và revision | Kiểm tra “chưa tồn tại” rồi insert ngoài transaction; tin cờ client |
| DSA-09 | Giới hạn cache theo size/TTL/identity; vô hiệu hóa khi revoke | Cache nhật ký, AI hoặc survey thô trong cache công khai |
| DSA-10 | Hủy request cũ; một polling khi app hiện; backoff có trần | Poll khi app đóng, nhiều interval, tự retry gửi tâm sự |
| DSA-11 | Tính đồng hồ từ cooldown_until server; cleanup interval | Gửi khi hết giờ, sau resume/AI; lấy giờ client cấp quyền gửi |
| DSA-12 | Giới hạn AI text/token/timeout và concurrency; gọi ngoài khóa DB | Gửi toàn bộ lịch sử, prompt/câu gốc cho người nhận hoặc log |
| DSA-13 | Export theo lô có giới hạn, kiểm tra quyền; aggregate ở DB | Xuất raw survey cho admin hoặc báo cáo nhận diện nhóm nhỏ |
| DSA-14 | Ghi bằng chứng và giới hạn; tối ưu điểm nghẽn có cơ sở | Ép mọi thao tác O(1), thêm hạ tầng mà không chứng minh nhu cầu |

Mọi ngoại lệ kỹ thuật phải nêu lý do, tải dự kiến, phương án thay thế và phép đo trong PR. Ngoại lệ không được làm mất riêng tư hoặc đổi yêu cầu sản phẩm. Quy tắc này không tạo bước hỏi quyền cho sửa chữa thường lệ.

## Lựa chọn theo tác vụ

| Tác vụ | Phương án ban đầu | Chi phí và lưu ý |
| --- | --- | --- |
| Inbox, mood, journal | Query actor + index + cursor; metadata trong list | Index phù hợp có thể khoảng O(log N + P), phụ thuộc plan/I/O; bộ nhớ O(P), không bảo đảm mọi plan |
| Gộp trang tin | Map keyed UUID để dedup, array có thứ tự để render | Gộp P mục kỳ vọng O(P); map O(W) với W cửa sổ giữ lại; xử lý timestamp trùng |
| Membership lặp lại | Set ID của tập đã được phép và có giới hạn | Dựng O(R), lookup kỳ vọng O(1), không thay ACL backend |
| Xác nhận kết nối | Hash mã ngẫu nhiên, unique, transaction | Indexed lookup; chống đoán và dùng lại; không tự suy người thân |
| Gợi ý tuần | 4 nhóm, activity định danh và phiên bản | Quét tập nhỏ O(A); chưa cần ML xếp hạng theo tâm trạng |
| Pause 5 phút | Mốc thời gian và trạng thái nháp | O(1) mỗi tick; không queue job tự gửi |
| Thỏa ước hai bên | Revision bất biến + acceptance mỗi signer | Transaction ngắn; sửa tạo revision mới |
| Báo cáo khảo sát | GROUP BY/COUNT + suppression | Nêu scan/plan thực tế; kết quả O(G), không hứa aggregate O(1) |

Không dùng memo/useMemo để bảo đảm đúng nghiệp vụ. Chỉ memo hóa khi có cơ sở và dependency đúng. Không tự nâng React/bật compiler chỉ vì tài liệu mới có tính năng đó.

## Ngân sách ban đầu

Phải chốt trong API contract trước endpoint nghiệp vụ; scaffold hiện tại chưa thực thi tất cả. Không đổi pause bằng cấu hình ngân sách.

| Phạm vi | Mức khởi đầu đề xuất | Cách đánh giá |
| --- | --- | --- |
| List API | P mặc định 20, tối đa 50 | Từ chối/clamp nhất quán; kiểm tra 20 và 50 |
| Nội dung | Tối đa 4.000 code point Unicode/mục, JSON 64 KiB | Chốt cùng UX; giới hạn byte ở ingress, ký tự ở serializer; không cắt im lặng |
| AI | Một yêu cầu đang chạy/actor, timeout tổng <=30 giây | Token budget theo provider sau đo; lỗi giữ nháp |
| Poll inbox | 30 giây khi hiện, backoff lỗi tối đa 120 giây | Một request đang chạy; resume refresh một lần, jitter; đo pin/mạng |
| UI history | Tối đa 200 mục metadata trong cửa sổ | Evict trang cũ, giữ cursor; không mất nháp; virtualization theo đo |
| List query | Query count không tăng tuyến tính P | Ghi Q20 và Q50, lý giải khác biệt; không ép Q=1 mọi endpoint |
| API list | Mục tiêu p95 <=500 ms ở app/DB ấm, payload <=100 KiB | Dữ liệu giả, môi trường, concurrency rõ; loại AI/cold start |
| UI | Mục tiêu không có tác vụ JS >50 ms do xử lý list trên máy thử | Đo release trên Android/iOS Zalo, ghi thiết bị |

Dữ liệu giả ở 100, 1.000, 10.000 bản ghi/actor; thêm actor khác và timestamp trùng. Chỉ mở rộng stress test khi cần. Latency/cửa sổ UI là mục tiêu đo, không lời hứa mọi điện thoại/Render plan.

## Kiểm chứng

1. Đọc chỉ dẫn/US, xác định quyền, tải và giới hạn.
2. Ghi phương án đơn giản, Big-O có giả định; với DB ghi index, plan, query count, payload.
3. Đo baseline khi tối ưu code cũ; code mới kiểm tra giới hạn/query count.
4. Kiểm tra rỗng, biên, timestamp trùng, insert giữa trang, stale revision, double-submit, revoke, actor khác và offline/resume nếu liên quan.
5. Dùng assertNumQueries hoặc capture query ở hai page sizes; EXPLAIN trên MySQL dữ liệu giả. Không chạy thử gây tải trên production.
6. Báo command, môi trường, dữ liệu, số đo và chưa kiểm chứng. Thay đổi tài liệu không cần bịa benchmark.

Test tập trung rủi ro thật: sai quyền, gửi trùng, N+1, auto-send hoặc log dữ liệu nhạy cảm; không chỉ lặp implementation.

## Ví dụ phân trang hộp thư

Pseudocode thiết kế, chưa phải endpoint hiện có:

```python
# actor từ credential đã xác minh; cursor phải được kiểm tra.
qs = Message.objects.filter(recipient_id=actor.id)
# Áp dụng policy connection/revoke và quyền đọc hiện tại tại đây.
if cursor:
    qs = qs.filter(Q(created_at__lt=cursor.time) |
                   Q(created_at=cursor.time, id__lt=cursor.id))
rows = list(qs.order_by('-created_at', '-id')
              .values('id', 'sender_id', 'kind', 'created_at')[:page_size + 1])
# Không lấy approved_body hoặc AI original cho list preview mặc định.
```

Index ứng viên (recipient_id, created_at, id). Cursor là vị trí, không phải quyền; request nào cũng lọc quyền. created_at bất biến. P+1 xác định has_more, tránh COUNT mỗi trang; query/plan phải đo. MySQL representation/thứ tự UUID phải nhất quán với cursor, không sort lại bằng comparator JS khác.

## Nguồn kỹ thuật

Kiểm tra ngày 10/10/2026, áp dụng đúng phiên bản repo:

- [Django 5.2 database optimization](https://docs.djangoproject.com/en/5.2/topics/db/optimization/): profile trước/sau, query plans, tránh query lặp, lấy dữ liệu cần.
- [MySQL 8.4 multiple-column indexes](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html): thứ tự cột/leftmost prefix.
- [React useMemo](https://react.dev/reference/react/useMemo): tối ưu tính toán, không bảo đảm ngữ nghĩa.
