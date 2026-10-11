# F15 scope — xem report.md + test.md kèm theo.

Nhánh này mang theo 2 fix harness cần dùng chung cho mọi feature branch
(từ baseline B00): (1) harness/urls.py mount prefix khi routes rỗng,
(2) harness/settings.py: mở rộng dependency có điều kiện theo presence trên
branch + thêm labgrants (test-only). Nội dung sẽ trùng nhau khi merge B18.
