# Family Bridge Zalo Mini App

Bản nền tảng giao diện US-003: JavaScript thuần (ES Modules) + Vite + zmp-sdk, KHÔNG React/zmp-ui.

- [Cài đặt và chạy local](../docs/setup/miniapp/README.md)
- [Phạm vi dự án](../docs/project-scope.md) · [Quy tắc UI](../docs/engineering/ui-rules.md) · [Hợp đồng API nền tảng](../docs/contracts/api-foundation.md)
- [Bàn giao nền tảng Mini App](../docs/handover/miniapp-foundation/README.md) (mapping màn hình, adapter, checklist Antigravity, báo cáo chính sách Zalo)

## Cấu trúc

```
zalo-mini-app/
├── index.html               # Entry HTML (SPA)
├── app-config.json          # Cấu hình Zalo Mini App (statusBar, safe area…)
├── vite.config.mjs          # Build + plugin sinh manifest app-config.json
├── scripts/verify-build.mjs # Kiểm tra output www/ sau build
├── src/
│   ├── main.js              # Entry JS: boot store/adapter/router
│   ├── app/                 # dom.js, router.js, store.js, nav.js
│   ├── core/
│   │   ├── config.js        # env + demo mode + phát hiện môi trường Zalo
│   │   ├── adapter/         # adapter.js, mock-adapter.js, zalo-adapter.js
│   │   ├── api/client.mjs   # API client HTTPS-only, timeout, không retry tự động
│   │   └── fixtures/        # Dữ liệu minh họa (chỉ demo mode)
│   ├── components/          # Design system thuần JS (button, sheet, dialog…)
│   ├── styles/              # tokens.css, base.css, components.css
│   └── pages/               # U01/U02/U04/U08-U10 + 5 hub + connection-check + help
└── tests/                   # node:test + happy-dom (mock adapter, không cần server)
```

## Lệnh chính

```bash
npm install        # cài dependencies (Node >= 22.12)
npm start          # dev server localhost:3000 (preview browser)
npm test           # toàn bộ tests (mock adapter, không gọi server)
npm run build      # build production vào www/ + verify manifest Zalo
```

`npm run deploy` (zmp CLI) thuộc Antigravity — xem checklist bàn giao.

## Chế độ demo

Demo mode CHỈ bật khi thêm `?demo=1` vào URL (rõ ràng, có nhãn "Dữ liệu minh họa" trên mọi màn hình). Không có cơ chế fallback tự động từ lỗi API/auth sang mock; production không tự bật dữ liệu giả. Chi tiết: `src/core/config.js`.
