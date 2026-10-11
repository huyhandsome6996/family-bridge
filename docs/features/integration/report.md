# B18 — Tích hợp đầy đủ để review (review/full-product-integration)

- Branch: review/full-product-integration, tạo từ B00 frozen SHA
  `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7`
- PR: target **main** (Draft) — KHÔNG auto-merge, KHÔNG nghiệm thu

## Đã làm

1. **Pin A/B snapshots** (đã push trên remote): backend foundation
   `1b233c4` + miniapp UI foundation `6af2cdd` — merge --no-ff vào nhánh
   review, KHÔNG đụng worktree gốc; không báo Huy đã duyệt.
2. **Ghép 15 feature branches + B16/B17** bằng merge --no-ff (không
   cherry-pick mù); conflict handling trung thực:
   - labgrants models/migration (f15 vs f05 add/add) → giữ f05 superset
     (TestConnection);
   - harness settings THROTTLE_RATES (f04 ai_refine vs f14
     survey_report) → union cả hai rate;
   - còn lại merge sạch (chi tiết integration-manifest.json).
3. **Regression TOÀN BỘ trên nhánh tích hợp**: 16 features + harness +
   labgrants cùng chạy → **333/333 PASS** (2 skipped = MySQL-gated race
   — NOT_RUN trung thực); drift check sạch; 16/16 node test file PASS.
4. **QA Agent B** trên zalo-mini-app (happy-dom): **79/79 PASS** — đây
   là browser-level mock, KHÔNG phải Zalo Android/iOS thật (US-049 chờ
   Antigravity).
5. **Wiring trạng thái**: port registry pattern cho phép nối production
   path ở B18-thật; trên nhánh này các provider/test doubles vẫn là
   TEST-ONLY, đăng ký tường minh — KHÔNG fake auth/transport/content
   để "nhìn như hoàn thành". Đăng ký urls backend thật (Agent A) là
   bước tiếp theo khi backend foundation được review (ghi ở dưới).

## Lệnh kiểm tra từ clean checkout

```bash
pip install "Django>=5.2,<6" "djangorestframework>=3.16,<4"
cd tests/feature-lab
FB_FEATURES="f01_identity,f15_privacy,f05_inbox,f03_cards,f04_ai,f06_drafts,f07_mood,f08_journal,f10_signal,f11_supporters,f13_help,f12_appointments,f09_activities,f02_program,f14_surveys,admin_core" \
  DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test \
  python manage.py test harness labgrants family_bridge_features
node --test packages/family_bridge_mobile/*/tests/*.test.mjs
cd zalo-mini-app && npm install && node --test tests/*.test.mjs
```

## Thứ tự review/merge đề xuất

1. B00 (PR #5, base main) — nền tảng hợp đồng.
2. PR #6..#22 theo thứ tự feature (B01→B15→B05→B03→B04→B06→B07→B08→
   B10→B11→B13→B12→B09→B02→B14→B16→B17) — từng PR diff riêng.
3. PR B18 (nhánh này, base main) — sau khi nền tảng + features được
   duyệt; sau merge các PR feature, base của PR này sẽ chuyển để diff
   còn phần tích hợp (không duplicate apply commit vào main).

## Còn lại (trung thực)

- Nối MessageTransport/CardProvider/... THẬT vào backend scaffold của
  Agent A (accounts.User, urls) — cần review backend foundation trước
  (PR #4 của Agent A); các registry đăng ký sẵn chỗ, wiring là commit
  nhỏ có kiểm tra.
- MySQL race suites: NOT_RUN (không DB); EXPLAIN thật chờ MySQL.
- Zalo device thật (US-049), nghiệm thu (US-050), submit (US-051),
  pilot (US-052): chờ Huy/Antigravity/Thầy — không tự xác nhận.
- US-047 sample-content gate: nội dung mẫu TEST-ONLY phải thay bằng
  nội dung Thầy duyệt trước pilot.
