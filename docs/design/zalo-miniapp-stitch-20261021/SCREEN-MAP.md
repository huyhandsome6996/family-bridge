# Ánh xạ màn Stitch → code Zalo Mini App

24 bề mặt trang tương ứng 24 prompt. 24 route hiệu lực có 23 page module vì `/` và `/welcome` là alias; thêm fallback not-found. Có 83 frame Mxx + 4 phác thảo ban đầu = 87 cặp HTML/PNG. Tên folder không phải route, không tạo router theo tên export.

Tất cả đường dẫn đích dưới đây là `zalo-mini-app/`; không thay bằng cùng tên trong `web/`. Sheet/biến thể không tạo thêm trang nghiệp vụ nếu không cần.

## M01 — Chào mừng

- Route: `/ / /welcome`.
- Đích: `zalo-mini-app/src/pages/welcome/index.js`.
- Không đưa khối Design Spec và cam kết bảo mật vào trang chào; logo dùng asset hiện có được duyệt/placeholder trung thực.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m01_ch_o_m_ng_320px_ch_l_n` | [code.html](stitch-export/m01_ch_o_m_ng_320px_ch_l_n/code.html) | [screen.png](stitch-export/m01_ch_o_m_ng_320px_ch_l_n/screen.png) |
| 2 | `m01_ch_o_m_ng_390px` | [code.html](stitch-export/m01_ch_o_m_ng_390px/code.html) | [screen.png](stitch-export/m01_ch_o_m_ng_390px/screen.png) |

## M02 — Cách dùng

- Route: `/how-to-use`.
- Đích: `zalo-mini-app/src/pages/how-to-use/index.js`.
- Giữ bốn bước; tách cặp admin ACTIVE với mã mời; bỏ cam kết hỗ trợ miễn phí chưa có nguồn.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m02_c_ch_d_ng_family_bridge` | [code.html](stitch-export/m02_c_ch_d_ng_family_bridge/code.html) | [screen.png](stitch-export/m02_c_ch_d_ng_family_bridge/screen.png) |

## M03 — Đăng nhập bằng mã tài khoản

- Route: `/login`.
- Đích: `zalo-mini-app/src/pages/login/index.js`.
- Mã HS/PH + mật khẩu; không SĐT/OTP/linked-Zalo mặc định; không lộ số lần thử/chốt khóa giả; state riêng, bỏ bàn phím vẽ.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m03_ng_nh_p_b_ng_m_t_i_kho_n` | [code.html](stitch-export/m03_ng_nh_p_b_ng_m_t_i_kho_n/code.html) | [screen.png](stitch-export/m03_ng_nh_p_b_ng_m_t_i_kho_n/screen.png) |
| 2 | `m03_tr_ng_th_i_ng_nh_p_x_l_l_i` | [code.html](stitch-export/m03_tr_ng_th_i_ng_nh_p_x_l_l_i/code.html) | [screen.png](stitch-export/m03_tr_ng_th_i_ng_nh_p_x_l_l_i/screen.png) |

## M04 — Đồng ý và quyền riêng tư

- Route: `/consent`.
- Đích: `zalo-mini-app/src/pages/consent/index.js`.
- Giữ text chính sách hiện hành/từng mục đích, không tick hộ; lỗi lưu giữ lựa chọn; notes không render.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m04_ng_ch_a_ch_n` | [code.html](stitch-export/m04_ng_ch_a_ch_n/code.html) | [screen.png](stitch-export/m04_ng_ch_a_ch_n/screen.png) |
| 2 | `m04_ng_ch_n_b_t_bu_c` | [code.html](stitch-export/m04_ng_ch_n_b_t_bu_c/code.html) | [screen.png](stitch-export/m04_ng_ch_n_b_t_bu_c/screen.png) |
| 3 | `m04_ng_l_i_l_u_k_t_n_i` | [code.html](stitch-export/m04_ng_l_i_l_u_k_t_n_i/code.html) | [screen.png](stitch-export/m04_ng_l_i_l_u_k_t_n_i/screen.png) |

## M05 — Chọn vai trò xem trước

- Route: `/role-select`.
- Đích: `zalo-mini-app/src/pages/role-select/index.js`.
- Chỉ demo/luồng phụ; không cấp role thật; bỏ ảnh cá nhân remote, giữ nhãn demo.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m05_ch_n_vai_tr_xem_tr_c_frame_ch_nh` | [code.html](stitch-export/m05_ch_n_vai_tr_xem_tr_c_frame_ch_nh/code.html) | [screen.png](stitch-export/m05_ch_n_vai_tr_xem_tr_c_frame_ch_nh/screen.png) |
| 2 | `m05_tr_ng_th_i_ang_chuy_n_v_o_b_n_xem_tr_c` | [code.html](stitch-export/m05_tr_ng_th_i_ang_chuy_n_v_o_b_n_xem_tr_c/code.html) | [screen.png](stitch-export/m05_tr_ng_th_i_ang_chuy_n_v_o_b_n_xem_tr_c/screen.png) |

## M06 — Trang chủ — học sinh và người chăm sóc

- Route: `/home`.
- Đích: `zalo-mini-app/src/pages/home/index.js`.
- Hai vai; không giám sát nhật ký con, lịch hẹn ẩn danh/hotline/số tin/latency giả; chưa kết nối không khóa help.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m06_trang_ch_ch_a_k_t_n_i` | [code.html](stitch-export/m06_trang_ch_ch_a_k_t_n_i/code.html) | [screen.png](stitch-export/m06_trang_ch_ch_a_k_t_n_i/screen.png) |
| 2 | `m06_trang_ch_h_c_sinh_thpt` | [code.html](stitch-export/m06_trang_ch_h_c_sinh_thpt/code.html) | [screen.png](stitch-export/m06_trang_ch_h_c_sinh_thpt/screen.png) |
| 3 | `m06_trang_ch_l_i_t_i_c_c_b` | [code.html](stitch-export/m06_trang_ch_l_i_t_i_c_c_b/code.html) | [screen.png](stitch-export/m06_trang_ch_l_i_t_i_c_c_b/screen.png) |
| 4 | `m06_trang_ch_ng_i_ch_m_s_c` | [code.html](stitch-export/m06_trang_ch_ng_i_ch_m_s_c/code.html) | [screen.png](stitch-export/m06_trang_ch_ng_i_ch_m_s_c/screen.png) |

## M07 — Đồng hành bốn tuần

- Route: `/companion`.
- Đích: `zalo-mini-app/src/pages/companion/index.js`.
- Tuần phát hành tự nguyện, không tuần khóa; hoạt động/thời lượng từ catalog; thỏa ước cùng revision cả hai xác nhận.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m07_chi_ti_t_ho_t_ng_ng_h_nh` | [code.html](stitch-export/m07_chi_ti_t_ho_t_ng_ng_h_nh/code.html) | [screen.png](stitch-export/m07_chi_ti_t_ho_t_ng_ng_h_nh/screen.png) |
| 2 | `m07_ng_h_nh_tr_c_khi_tham_gia` | [code.html](stitch-export/m07_ng_h_nh_tr_c_khi_tham_gia/code.html) | [screen.png](stitch-export/m07_ng_h_nh_tr_c_khi_tham_gia/screen.png) |
| 3 | `m07_ng_h_nh_tu_n_ang_ho_t_ng` | [code.html](stitch-export/m07_ng_h_nh_tu_n_ang_ho_t_ng/code.html) | [screen.png](stitch-export/m07_ng_h_nh_tu_n_ang_ho_t_ng/screen.png) |
| 4 | `m07_th_a_c_gia_nh_tu_n_4` | [code.html](stitch-export/m07_th_a_c_gia_nh_tu_n_4/code.html) | [screen.png](stitch-export/m07_th_a_c_gia_nh_tu_n_4/screen.png) |

## M08 — Hộp thư

- Route: `/mailbox`.
- Đích: `zalo-mini-app/src/pages/mailbox/index.js`.
- List một cột, không snippet khi API không có; không cache nhật ký/inbox offline tự phát; trạng thái tải/mạng riêng.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m08_h_p_th_c_c_tr_ng_th_i_ngo_i_l` | [code.html](stitch-export/m08_h_p_th_c_c_tr_ng_th_i_ngo_i_l/code.html) | [screen.png](stitch-export/m08_h_p_th_c_c_tr_ng_th_i_ngo_i_l/screen.png) |
| 2 | `m08_h_p_th_danh_s_ch_c_chi_ti_t` | [code.html](stitch-export/m08_h_p_th_danh_s_ch_c_chi_ti_t/code.html) | [screen.png](stitch-export/m08_h_p_th_danh_s_ch_c_chi_ti_t/screen.png) |

## M09 — Đọc thư và phản hồi

- Route: `/messages/:id`.
- Đích: `zalo-mini-app/src/pages/message/index.js`.
- Route mini thật; không giới hạn 400 giả nếu contract 4000; consent/gợi ý không gửi, phản hồi chỉ đúng chiều nhận.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m09_c_th_nh_n_ph_n_h_i_frame_ch_nh` | [code.html](stitch-export/m09_c_th_nh_n_ph_n_h_i_frame_ch_nh/code.html) | [screen.png](stitch-export/m09_c_th_nh_n_ph_n_h_i_frame_ch_nh/screen.png) |
| 2 | `m09_sheet_th_a_thu_n_minh_b_ch_ai` | [code.html](stitch-export/m09_sheet_th_a_thu_n_minh_b_ch_ai/code.html) | [screen.png](stitch-export/m09_sheet_th_a_thu_n_minh_b_ch_ai/screen.png) |
| 3 | `m09_th_g_i_kh_ng_ph_n_h_i_ng_c` | [code.html](stitch-export/m09_th_g_i_kh_ng_ph_n_h_i_ng_c/code.html) | [screen.png](stitch-export/m09_th_g_i_kh_ng_ph_n_h_i_ng_c/screen.png) |
| 4 | `m09_tr_ng_th_i_thu_h_i_ch_a_r_k_t_qu` | [code.html](stitch-export/m09_tr_ng_th_i_thu_h_i_ch_a_r_k_t_qu/code.html) | [screen.png](stitch-export/m09_tr_ng_th_i_thu_h_i_ch_a_r_k_t_qu/screen.png) |

## M10 — Soạn thư cảm xúc, AI và tạm dừng

- Route: `/compose`.
- Đích: `zalo-mini-app/src/pages/compose/index.js`.
- Giữ 300 giây server/bản nháp, không khóa token toàn phiên/hủy để gửi sớm; không IndexedDB/provider-training claim/hotline giả.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m10_panel_g_i_di_n_t_ai` | [code.html](stitch-export/m10_panel_g_i_di_n_t_ai/code.html) | [screen.png](stitch-export/m10_panel_g_i_di_n_t_ai/screen.png) |
| 2 | `m10_sheet_quy_n_ri_ng_t_tr_c_khi_d_ng_ai` | [code.html](stitch-export/m10_sheet_quy_n_ri_ng_t_tr_c_khi_d_ng_ai/code.html) | [screen.png](stitch-export/m10_sheet_quy_n_ri_ng_t_tr_c_khi_d_ng_ai/screen.png) |
| 3 | `m10_so_n_th_c_m_x_c_frame_ch_nh` | [code.html](stitch-export/m10_so_n_th_c_m_x_c_frame_ch_nh/code.html) | [screen.png](stitch-export/m10_so_n_th_c_m_x_c_frame_ch_nh/screen.png) |
| 4 | `m10_tr_ng_th_i_t_m_d_ng_an_to_n_300s` | [code.html](stitch-export/m10_tr_ng_th_i_t_m_d_ng_an_to_n_300s/code.html) | [screen.png](stitch-export/m10_tr_ng_th_i_t_m_d_ng_an_to_n_300s/screen.png) |
| 5 | `m10_xem_tr_c_x_c_nh_n_g_i` | [code.html](stitch-export/m10_xem_tr_c_x_c_nh_n_g_i/code.html) | [screen.png](stitch-export/m10_xem_tr_c_x_c_nh_n_g_i/screen.png) |

## M11 — Thư viện thẻ cảm xúc

- Route: `/cards`.
- Đích: `zalo-mini-app/src/pages/cards/index.js`.
- Nhóm từ catalog, lời kèm <=1000, preview đúng người/phiên; không sessionStorage nội dung, không gửi lại mù khi mất response.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m11_chi_ti_t_th_so_n_l_i_k_m` | [code.html](stitch-export/m11_chi_ti_t_th_so_n_l_i_k_m/code.html) | [screen.png](stitch-export/m11_chi_ti_t_th_so_n_l_i_k_m/screen.png) |
| 2 | `m11_th_vi_n_th_c_m_x_c_m_n_ch_nh` | [code.html](stitch-export/m11_th_vi_n_th_c_m_x_c_m_n_ch_nh/code.html) | [screen.png](stitch-export/m11_th_vi_n_th_c_m_x_c_m_n_ch_nh/screen.png) |
| 3 | `m11_tr_ng_th_i_bi_n_x_l_l_i` | [code.html](stitch-export/m11_tr_ng_th_i_bi_n_x_l_l_i/code.html) | [screen.png](stitch-export/m11_tr_ng_th_i_bi_n_x_l_l_i/screen.png) |
| 4 | `m11_xem_tr_c_x_c_nh_n_g_i_th` | [code.html](stitch-export/m11_xem_tr_c_x_c_nh_n_g_i_th/code.html) | [screen.png](stitch-export/m11_xem_tr_c_x_c_nh_n_g_i_th/screen.png) |

## M12 — Tín hiệu cần được lắng nghe

- Route: `/signal`.
- Đích: `zalo-mini-app/src/pages/signal/index.js`.
- HS gửi, PH tiếp nhận; nhu cầu hẹn không tạo time-picker/appointment; không ghi chú thêm ngoài DTO, không pause help.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m12_h_c_sinh_g_i_t_n_hi_u_l_ng_nghe` | [code.html](stitch-export/m12_h_c_sinh_g_i_t_n_hi_u_l_ng_nghe/code.html) | [screen.png](stitch-export/m12_h_c_sinh_g_i_t_n_hi_u_l_ng_nghe/screen.png) |
| 2 | `m12_ng_i_ch_m_s_c_ti_p_nh_n_t_n_hi_u` | [code.html](stitch-export/m12_ng_i_ch_m_s_c_ti_p_nh_n_t_n_hi_u/code.html) | [screen.png](stitch-export/m12_ng_i_ch_m_s_c_ti_p_nh_n_t_n_hi_u/screen.png) |
| 3 | `m12_x_l_m_t_m_ng_ch_a_r_k_t_qu` | [code.html](stitch-export/m12_x_l_m_t_m_ng_ch_a_r_k_t_qu/code.html) | [screen.png](stitch-export/m12_x_l_m_t_m_ng_ch_a_r_k_t_qu/screen.png) |
| 4 | `m12_xem_tr_c_g_i_t_n_hi_u` | [code.html](stitch-export/m12_xem_tr_c_g_i_t_n_hi_u/code.html) | [screen.png](stitch-export/m12_xem_tr_c_g_i_t_n_hi_u/screen.png) |

## M13 — Tâm trạng của mình

- Route: `/mood`.
- Đích: `zalo-mini-app/src/pages/mood/index.js`.
- Mood của mình, một mục/ngày server; sửa không tự share, không snapshot/socket purge giả; giữ grant states thật.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m13_c_nh_b_o_s_a_n_i_dung_m_c_c_chia_s` | [code.html](stitch-export/m13_c_nh_b_o_s_a_n_i_dung_m_c_c_chia_s/code.html) | [screen.png](stitch-export/m13_c_nh_b_o_s_a_n_i_dung_m_c_c_chia_s/screen.png) |
| 2 | `m13_sheet_chia_s_tr_ng_th_i_thu_h_i_minh_b_ch` | [code.html](stitch-export/m13_sheet_chia_s_tr_ng_th_i_thu_h_i_minh_b_ch/code.html) | [screen.png](stitch-export/m13_sheet_chia_s_tr_ng_th_i_thu_h_i_minh_b_ch/screen.png) |
| 3 | `m13_t_m_tr_ng_c_a_m_nh_frame_ch_nh` | [code.html](stitch-export/m13_t_m_tr_ng_c_a_m_nh_frame_ch_nh/code.html) | [screen.png](stitch-export/m13_t_m_tr_ng_c_a_m_nh_frame_ch_nh/screen.png) |
| 4 | `m13_tr_ng_th_i_ghi_nh_n_trong_ng_y_s_a_m_c` | [code.html](stitch-export/m13_tr_ng_th_i_ghi_nh_n_trong_ng_y_s_a_m_c/code.html) | [screen.png](stitch-export/m13_tr_ng_th_i_ghi_nh_n_trong_ng_y_s_a_m_c/screen.png) |

## M14 — Cảm xúc được chia sẻ với bạn

- Route: `/mood-shared`.
- Đích: `zalo-mini-app/src/pages/mood-shared/index.js`.
- List metadata, detail recheck; xóa nội dung khi revoke, không fake mã hóa hay thêm reply/AI mới.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m14_c_chi_ti_t_n_i_dung_c_m_x_c_c_chia_s` | [code.html](stitch-export/m14_c_chi_ti_t_n_i_dung_c_m_x_c_c_chia_s/code.html) | [screen.png](stitch-export/m14_c_chi_ti_t_n_i_dung_c_m_x_c_c_chia_s/screen.png) |
| 2 | `m14_danh_s_ch_c_m_x_c_c_chia_s_frame_ch_nh` | [code.html](stitch-export/m14_danh_s_ch_c_m_x_c_c_chia_s_frame_ch_nh/code.html) | [screen.png](stitch-export/m14_danh_s_ch_c_m_x_c_c_chia_s_frame_ch_nh/screen.png) |
| 3 | `m14_danh_s_ch_tr_ng_x_l_l_i_t_i_d_li_u` | [code.html](stitch-export/m14_danh_s_ch_tr_ng_x_l_l_i_t_i_d_li_u/code.html) | [screen.png](stitch-export/m14_danh_s_ch_tr_ng_x_l_l_i_t_i_d_li_u/screen.png) |
| 4 | `m14_tr_ng_th_i_kh_ng_c_n_xem_c_thu_h_i_h_t_k_t_n_i` | [code.html](stitch-export/m14_tr_ng_th_i_kh_ng_c_n_xem_c_thu_h_i_h_t_k_t_n_i/code.html) | [screen.png](stitch-export/m14_tr_ng_th_i_kh_ng_c_n_xem_c_thu_h_i_h_t_k_t_n_i/screen.png) |

## M15 — Nhật ký — trang chờ hiện tại

- Route: `/diary`.
- Đích: `zalo-mini-app/src/pages/diary/index.js`.
- Chỉ trang chờ; không soạn/list nhật ký mới hoặc nói tương lai đã hoạt động.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m15_nh_t_k_b_n_ch_l_n_320px` | [code.html](stitch-export/m15_nh_t_k_b_n_ch_l_n_320px/code.html) | [screen.png](stitch-export/m15_nh_t_k_b_n_ch_l_n_320px/screen.png) |
| 2 | `m15_nh_t_k_trang_ch_hi_n_t_i_390px` | [code.html](stitch-export/m15_nh_t_k_trang_ch_hi_n_t_i_390px/code.html) | [screen.png](stitch-export/m15_nh_t_k_trang_ch_hi_n_t_i_390px/screen.png) |

## M16 — Ghi chép riêng và chia sẻ từng mục

- Route: `/privacy-items`.
- Đích: `zalo-mini-app/src/pages/privacy/items.js`.
- Có trang ghi chép thật; hợp nhất hai sheet _1/_2 theo contract, không snapshot copy/local cache/offline promises; riêng tư từng item.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m16_ghi_ch_p_ri_ng_chia_s_t_ng_m_c_frame_ch_nh` | [code.html](stitch-export/m16_ghi_ch_p_ri_ng_chia_s_t_ng_m_c_frame_ch_nh/code.html) | [screen.png](stitch-export/m16_ghi_ch_p_ri_ng_chia_s_t_ng_m_c_frame_ch_nh/screen.png) |
| 2 | `m16_sheet_x_c_nh_n_chia_s_t_ng_trang_1` | [code.html](stitch-export/m16_sheet_x_c_nh_n_chia_s_t_ng_trang_1/code.html) | [screen.png](stitch-export/m16_sheet_x_c_nh_n_chia_s_t_ng_trang_1/screen.png) |
| 3 | `m16_sheet_x_c_nh_n_chia_s_t_ng_trang_2` | [code.html](stitch-export/m16_sheet_x_c_nh_n_chia_s_t_ng_trang_2/code.html) | [screen.png](stitch-export/m16_sheet_x_c_nh_n_chia_s_t_ng_trang_2/screen.png) |
| 4 | `m16_tr_ng_th_i_bi_n_x_l_l_i_m_ng` | [code.html](stitch-export/m16_tr_ng_th_i_bi_n_x_l_l_i_m_ng/code.html) | [screen.png](stitch-export/m16_tr_ng_th_i_bi_n_x_l_l_i_m_ng/screen.png) |
| 5 | `m16_xung_t_n_i_dung_thu_h_i_quy_n_c` | [code.html](stitch-export/m16_xung_t_n_i_dung_thu_h_i_quy_n_c/code.html) | [screen.png](stitch-export/m16_xung_t_n_i_dung_thu_h_i_quy_n_c/screen.png) |

## M17 — Người đồng hành và lời mời

- Route: `/connect`.
- Đích: `zalo-mini-app/src/pages/connect/index.js`.
- Kết nối admin ACTIVE không mời lại; mã mời tự nguyện hai phía; không xác minh danh tính giả/QR mới, unlink phải xác nhận.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m17_dialog_h_y_k_t_n_i_x_l_ngo_i_l` | [code.html](stitch-export/m17_dialog_h_y_k_t_n_i_x_l_ngo_i_l/code.html) | [screen.png](stitch-export/m17_dialog_h_y_k_t_n_i_x_l_ngo_i_l/screen.png) |
| 2 | `m17_ng_i_ng_h_nh_ch_a_k_t_n_i_h_ng_d_n` | [code.html](stitch-export/m17_ng_i_ng_h_nh_ch_a_k_t_n_i_h_ng_d_n/code.html) | [screen.png](stitch-export/m17_ng_i_ng_h_nh_ch_a_k_t_n_i_h_ng_d_n/screen.png) |
| 3 | `m17_ng_i_ng_h_nh_k_t_n_i_l_i_m_i` | [code.html](stitch-export/m17_ng_i_ng_h_nh_k_t_n_i_l_i_m_i/code.html) | [screen.png](stitch-export/m17_ng_i_ng_h_nh_k_t_n_i_l_i_m_i/screen.png) |
| 4 | `m17_sheet_m_m_i_x_c_minh_danh_t_nh_hai_ph_a` | [code.html](stitch-export/m17_sheet_m_m_i_x_c_minh_danh_t_nh_hai_ph_a/code.html) | [screen.png](stitch-export/m17_sheet_m_m_i_x_c_minh_danh_t_nh_hai_ph_a/screen.png) |

## M18 — Đề xuất ghép nối tự nguyện

- Route: `/proposal`.
- Đích: `zalo-mini-app/src/pages/proposal/index.js`.
- Phân biệt đề xuất pending và admin ACTIVE; bỏ nghĩa lớp đã ghép vẫn bắt xác nhận lại; không đồng ý nội dung hộ.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m18_c_p_k_t_n_i_admin_active` | [code.html](stitch-export/m18_c_p_k_t_n_i_admin_active/code.html) | [screen.png](stitch-export/m18_c_p_k_t_n_i_admin_active/screen.png) |
| 2 | `m18_ch_i_ph_ng_x_c_nh_n` | [code.html](stitch-export/m18_ch_i_ph_ng_x_c_nh_n/code.html) | [screen.png](stitch-export/m18_ch_i_ph_ng_x_c_nh_n/screen.png) |
| 3 | `m18_kh_ng_c_xu_t_dialog_t_ch_i` | [code.html](stitch-export/m18_kh_ng_c_xu_t_dialog_t_ch_i/code.html) | [screen.png](stitch-export/m18_kh_ng_c_xu_t_dialog_t_ch_i/screen.png) |
| 4 | `m18_x_c_nh_n_gh_p_n_i_frame_ch_nh` | [code.html](stitch-export/m18_x_c_nh_n_gh_p_n_i_frame_ch_nh/code.html) | [screen.png](stitch-export/m18_x_c_nh_n_gh_p_n_i_frame_ch_nh/screen.png) |

## M19 — Cá nhân

- Route: `/profile`.
- Đích: `zalo-mini-app/src/pages/profile/index.js`.
- Phiên thật không đổi role; menu điều hướng đúng tính năng; demo tách, logout xóa private state.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m19_c_nh_n_ch_demo_d_li_u_minh_h_a` | [code.html](stitch-export/m19_c_nh_n_ch_demo_d_li_u_minh_h_a/code.html) | [screen.png](stitch-export/m19_c_nh_n_ch_demo_d_li_u_minh_h_a/screen.png) |
| 2 | `m19_c_nh_n_dialog_ng_xu_t_sheet_i_t_n` | [code.html](stitch-export/m19_c_nh_n_dialog_ng_xu_t_sheet_i_t_n/code.html) | [screen.png](stitch-export/m19_c_nh_n_dialog_ng_xu_t_sheet_i_t_n/screen.png) |
| 3 | `m19_c_nh_n_t_i_kho_n_h_c_sinh` | [code.html](stitch-export/m19_c_nh_n_t_i_kho_n_h_c_sinh/code.html) | [screen.png](stitch-export/m19_c_nh_n_t_i_kho_n_h_c_sinh/screen.png) |
| 4 | `m19_c_nh_n_t_i_kho_n_ng_i_ch_m_s_c` | [code.html](stitch-export/m19_c_nh_n_t_i_kho_n_ng_i_ch_m_s_c/code.html) | [screen.png](stitch-export/m19_c_nh_n_t_i_kho_n_ng_i_ch_m_s_c/screen.png) |

## M20 — Cài đặt tài khoản

- Route: `/settings`.
- Đích: `zalo-mini-app/src/pages/settings/index.js`.
- Capabilities thật, re-auth đúng; bỏ mật khẩu mẫu, trường học, 6 ký tự giả/TLS/hash claim và notification setting chưa có.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m20_c_i_t_t_i_kho_n_danh_s_ch_ch_nh` | [code.html](stitch-export/m20_c_i_t_t_i_kho_n_danh_s_ch_ch_nh/code.html) | [screen.png](stitch-export/m20_c_i_t_t_i_kho_n_danh_s_ch_ch_nh/screen.png) |
| 2 | `m20_l_i_m_t_kh_u_hi_n_t_i_dialog_ng_xu_t` | [code.html](stitch-export/m20_l_i_m_t_kh_u_hi_n_t_i_dialog_ng_xu_t/code.html) | [screen.png](stitch-export/m20_l_i_m_t_kh_u_hi_n_t_i_dialog_ng_xu_t/screen.png) |
| 3 | `m20_sheet_i_m_t_kh_u_b_n_ph_m_m` | [code.html](stitch-export/m20_sheet_i_m_t_kh_u_b_n_ph_m_m/code.html) | [screen.png](stitch-export/m20_sheet_i_m_t_kh_u_b_n_ph_m_m/screen.png) |
| 4 | `m20_sheet_i_t_n_m_ng_nh_p_quy_n_m_y_ch` | [code.html](stitch-export/m20_sheet_i_t_n_m_ng_nh_p_quy_n_m_y_ch/code.html) | [screen.png](stitch-export/m20_sheet_i_t_n_m_ng_nh_p_quy_n_m_y_ch/screen.png) |

## M21 — Riêng tư, đồng ý và xóa dữ liệu

- Route: `/privacy`.
- Đích: `zalo-mini-app/src/pages/privacy/index.js`.
- Không SLA 7–14 ngày/ân hạn 48h/hứa xóa backup; deletion categories/status/cancel theo API; consent purpose độc lập.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m21_quy_tr_nh_y_u_c_u_x_a_d_li_u_l_ch_s_x_l` | [code.html](stitch-export/m21_quy_tr_nh_y_u_c_u_x_a_d_li_u_l_ch_s_x_l/code.html) | [screen.png](stitch-export/m21_quy_tr_nh_y_u_c_u_x_a_d_li_u_l_ch_s_x_l/screen.png) |
| 2 | `m21_ri_ng_t_ng_v_x_a_d_li_u_frame_ch_nh` | [code.html](stitch-export/m21_ri_ng_t_ng_v_x_a_d_li_u_frame_ch_nh/code.html) | [screen.png](stitch-export/m21_ri_ng_t_ng_v_x_a_d_li_u_frame_ch_nh/screen.png) |
| 3 | `m21_sheet_r_t_ng_h_qu_th_c_t` | [code.html](stitch-export/m21_sheet_r_t_ng_h_qu_th_c_t/code.html) | [screen.png](stitch-export/m21_sheet_r_t_ng_h_qu_th_c_t/screen.png) |
| 4 | `m21_sheet_x_c_nh_n_thu_h_i_quy_n_chia_s` | [code.html](stitch-export/m21_sheet_x_c_nh_n_thu_h_i_quy_n_chia_s/code.html) | [screen.png](stitch-export/m21_sheet_x_c_nh_n_thu_h_i_quy_n_chia_s/screen.png) |

## M22 — Tìm trợ giúp

- Route: `/help`.
- Đích: `zalo-mini-app/src/pages/help/index.js`.
- Bản chính đầu mối đang xác minh; frame tương lai verified chỉ tham khảo, không số/gọi/lịch hẹn mới hoặc thông báo tuyệt đối.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m22_t_m_tr_gi_p_b_n_ch_l_n_200` | [code.html](stitch-export/m22_t_m_tr_gi_p_b_n_ch_l_n_200/code.html) | [screen.png](stitch-export/m22_t_m_tr_gi_p_b_n_ch_l_n_200/screen.png) |
| 2 | `m22_t_m_tr_gi_p_frame_ch_nh_ang_x_c_minh` | [code.html](stitch-export/m22_t_m_tr_gi_p_frame_ch_nh_ang_x_c_minh/code.html) | [screen.png](stitch-export/m22_t_m_tr_gi_p_frame_ch_nh_ang_x_c_minh/screen.png) |
| 3 | `m22_t_m_tr_gi_p_t_b_n_nh_p_pause_300s` | [code.html](stitch-export/m22_t_m_tr_gi_p_t_b_n_nh_p_pause_300s/code.html) | [screen.png](stitch-export/m22_t_m_tr_gi_p_t_b_n_nh_p_pause_300s/screen.png) |
| 4 | `m22_t_m_tr_gi_p_tham_chi_u_khi_d_li_u_duy_t` | [code.html](stitch-export/m22_t_m_tr_gi_p_tham_chi_u_khi_d_li_u_duy_t/code.html) | [screen.png](stitch-export/m22_t_m_tr_gi_p_tham_chi_u_khi_d_li_u_duy_t/screen.png) |

## M23 — Kiểm tra kết nối máy chủ

- Route: `/connection-check`.
- Đích: `zalo-mini-app/src/pages/connection-check/index.js`.
- Health/ready theo luồng có thật; không suy AI/auth hoạt động; không latency/TLS/offline-cache/máy chủ bảo trì khi thiếu nguồn.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m23_ki_m_tra_k_t_n_i_ang_ki_m_tra` | [code.html](stitch-export/m23_ki_m_tra_k_t_n_i_ang_ki_m_tra/code.html) | [screen.png](stitch-export/m23_ki_m_tra_k_t_n_i_ang_ki_m_tra/screen.png) |
| 2 | `m23_ki_m_tra_k_t_n_i_k_t_n_i_th_nh_c_ng` | [code.html](stitch-export/m23_ki_m_tra_k_t_n_i_k_t_n_i_th_nh_c_ng/code.html) | [screen.png](stitch-export/m23_ki_m_tra_k_t_n_i_k_t_n_i_th_nh_c_ng/screen.png) |
| 3 | `m23_ki_m_tra_k_t_n_i_l_i_m_ng_qu_th_i_gian_ch` | [code.html](stitch-export/m23_ki_m_tra_k_t_n_i_l_i_m_ng_qu_th_i_gian_ch/code.html) | [screen.png](stitch-export/m23_ki_m_tra_k_t_n_i_l_i_m_ng_qu_th_i_gian_ch/screen.png) |
| 4 | `m23_ki_m_tra_k_t_n_i_m_y_ch_b_o_tr_m_ph_ng` | [code.html](stitch-export/m23_ki_m_tra_k_t_n_i_m_y_ch_b_o_tr_m_ph_ng/code.html) | [screen.png](stitch-export/m23_ki_m_tra_k_t_n_i_m_y_ch_b_o_tr_m_ph_ng/screen.png) |

## M24 — Không tìm thấy trang

- Route: `(fallback)`.
- Đích: `zalo-mini-app/src/pages/not-found/index.js`.
- Fallback route; không lộ URL/ID/token; home với phiên, welcome khi khách; không cam kết dữ liệu an toàn chỉ do 404.

| # | Frame gốc | HTML tham chiếu | Ảnh |
|---|---|---|---|
| 1 | `m24_b_n_ch_l_n_320px_handoff_k_thu_t` | [code.html](stitch-export/m24_b_n_ch_l_n_320px_handoff_k_thu_t/code.html) | [screen.png](stitch-export/m24_b_n_ch_l_n_320px_handoff_k_thu_t/screen.png) |
| 2 | `m24_kh_ng_t_m_th_y_trang_c_phi_n_ng_nh_p` | [code.html](stitch-export/m24_kh_ng_t_m_th_y_trang_c_phi_n_ng_nh_p/code.html) | [screen.png](stitch-export/m24_kh_ng_t_m_th_y_trang_c_phi_n_ng_nh_p/screen.png) |
| 3 | `m24_kh_ng_t_m_th_y_trang_kh_ch_ch_a_ng_nh_p` | [code.html](stitch-export/m24_kh_ng_t_m_th_y_trang_kh_ch_ch_a_ng_nh_p/code.html) | [screen.png](stitch-export/m24_kh_ng_t_m_th_y_trang_kh_ch_ch_a_ng_nh_p/screen.png) |

## Bốn phác thảo ban đầu — chỉ tham khảo

Không tạo thêm route và không ưu tiên hơn Mxx/API/riêng tư.

- `h_p_th_family_bridge`: [HTML](stitch-export/h_p_th_family_bridge/code.html) · [PNG](stitch-export/h_p_th_family_bridge/screen.png).
- `ng_h_nh_k_t_n_i_family_bridge`: [HTML](stitch-export/ng_h_nh_k_t_n_i_family_bridge/code.html) · [PNG](stitch-export/ng_h_nh_k_t_n_i_family_bridge/screen.png).
- `so_n_th_chia_s_family_bridge`: [HTML](stitch-export/so_n_th_chia_s_family_bridge/code.html) · [PNG](stitch-export/so_n_th_chia_s_family_bridge/screen.png).
- `trang_ch_family_bridge`: [HTML](stitch-export/trang_ch_family_bridge/code.html) · [PNG](stitch-export/trang_ch_family_bridge/screen.png).
