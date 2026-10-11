"""Test suite nền tảng (Agent 2-c) — sở hữu độc lập, không thuộc phạm vi Agent 2-b.

Cấu trúc:
- probes.py          : view probe test-only (default-deny, ValidationError, Http404).
- urls_probe.py      : URLconf test-only gắn PrivateProbe tại /probe/ (throttle behavior).
- test_health.py     : hợp đồng GET /api/v1/health/ (port từ kt01 + 0 query).
- test_ready.py      : hợp đồng GET /api/v1/ready/ (port từ kt01 + chống leak + log).
- test_default_deny.py: default-deny + endpoint không được tồn tại (token/admin/zalo).
- test_cors.py       : CORS allowlist (port từ kt01).
- test_throttle.py   : SEC-14 behavior throttle + miễn cho health/ready.
- test_envelope.py   : envelope lỗi {"error":{"code","details"}} (hợp đồng mục 3).
- test_settings_guard.py: guard cấu hình production qua subprocess (SEC-09/19/27).
"""
