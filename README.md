# Family Bridge

Nền tảng hỗ trợ cha mẹ và con cải thiện giao tiếp và thấu hiểu lẫn nhau qua chương trình đồng hành 4 tuần.

> **Trạng thái hiện tại**: Đây là **workspace khởi tạo cấu trúc ban đầu** cho dự án. Toàn bộ các chức năng nghiệp vụ, backend Django, giao diện web và app mobile **chưa được lập trình triển khai**.

---

## 1. Mục tiêu dự án
Family Bridge hướng tới giải quyết rào cản thế hệ và xung đột giao tiếp trong gia đình hiện đại thông qua:
- Trục chính là **chương trình đồng hành 4 tuần** được thiết kế có lộ trình từ nhận diện cảm xúc, thấu cảm đến duy trì gắn kết.
- Hỗ trợ công cụ gợi ý diễn đạt tích cực bằng AI (người dùng luôn kiểm duyệt trước khi gửi).
- Kết nối đa kênh: Web, Mobile App và Zalo Mini App sử dụng chung một hệ thống backend Django tập trung.

Chi tiết về định hướng tính năng xem tại [docs/project-scope.md](docs/project-scope.md).

---

## 2. Cấu trúc thư mục

`	ext
family-bridge/
├── backend/            # Backend dịch vụ trung tâm (Django REST Framework - khởi tạo khung)
├── web/                # Giao diện ứng dụng Web (khởi tạo khung)
├── mobile/             # Ứng dụng di động độc lập (khởi tạo khung)
├── zalo-mini-app/      # Bộ khung Zalo Mini App (Vite 5 + React/JavaScript Blank Template)
├── docs/               # Tài liệu thiết kế và phạm vi dự án
│   └── project-scope.md
├── .gitignore          # Cấu hình loại trừ Git cho đa nền tảng
└── README.md           # Hướng dẫn tổng quan workspace
`

- Các thư mục ackend/, web/, mobile/ hiện tại chỉ chứa file .gitkeep để duy trì cấu trúc thư mục trong Git.
- Thư mục zalo-mini-app/ đã được khởi tạo bằng công cụ chính thức của Zalo (zmp-cli) với template Blank JavaScript và liên kết với Mini App ID dự án.

---

## 3. Yêu cầu môi trường & Công cụ cần có

Để phát triển dự án đầy đủ trong các giai đoạn tiếp theo, máy phát triển cần có:
- **Git** (khuyến nghị >= 2.40)
- **Node.js** (khuyến nghị >= 18.x hoặc 20.x/24.x LTS) & **npm** (>= 9.x)
- **Python** (khuyến nghị >= 3.10)
- **Zalo Mini App CLI (zmp-cli)**: Cài đặt toàn cục qua 
pm install -g zmp-cli (đã sẵn sàng trên máy)

---

## 4. Hướng dẫn chạy bộ khung Zalo Mini App

1. Di chuyển vào thư mục Zalo Mini App:
   `ash
   cd zalo-mini-app
   `

2. Cài đặt các gói phụ thuộc (nếu chưa cài):
   `ash
   npm install
   `

3. Khởi chạy máy chủ phát triển cục bộ:
   `ash
   npm run start
   # hoặc:
   npx zmp-cli start
   `

4. Trình duyệt hoặc Zalo Simulator sẽ mở ra giao diện khung mặc định của Zalo Mini App.

---

## 5. Giấy phép & Bảo mật
Dự án được quản lý dưới dạng kho lưu trữ riêng tư (PRIVATE repository). Không chia sẻ các mã bí mật, file .env hoặc token xác thực vào kho lưu trữ mã nguồn.