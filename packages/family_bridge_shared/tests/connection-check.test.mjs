// tests/connection-check.test.mjs — helper phân loại lỗi màn kiểm tra kết nối
// (node:test thuần, KHÔNG happy-dom). Mapping phải GIỐNG HỆT bản trong
// zalo-mini-app/src/pages/connection-check/index.js (đã tách về đây).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../src/api/client.mjs";
import { errorKind, failureFor, messageOf } from "../src/connection-check.js";

describe("shared connection-check — errorKind", () => {
  it("đọc `kind` của ApiError", () => {
    assert.equal(errorKind(new ApiError("x", 0, "timeout")), "timeout");
    assert.equal(errorKind(new ApiError("x", 0, "network")), "network");
    assert.equal(errorKind(new ApiError("x", 0, "configuration")), "configuration");
  });

  it("fallback an toàn: Error thường / ApiError cũ không kind / null -> 'unknown' (KHÔNG bao giờ timeout)", () => {
    assert.equal(errorKind(new Error("boom")), "unknown");
    assert.equal(errorKind({ status: 0 }), "unknown");
    assert.equal(errorKind(null), "unknown");
    assert.equal(errorKind(undefined), "unknown");
  });
});

describe("shared connection-check — failureFor theo kind", () => {
  it("timeout -> title 'Kết nối quá thời gian chờ'", () => {
    const view = failureFor(new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0, "timeout"));
    assert.equal(view.title, "Kết nối quá thời gian chờ");
    assert.ok(view.description.includes("Vui lòng thử lại"));
  });

  it("configuration -> title cấu hình + message của lỗi (được nêu tên biến cấu hình)", () => {
    const error = new ApiError(
      "Địa chỉ máy chủ chưa cấu hình đúng. Kiểm tra biến VITE_API_BASE_URL khi build rồi thử lại.",
      0,
      "configuration",
    );
    const view = failureFor(error);
    assert.equal(view.title, "Chưa cấu hình địa chỉ máy chủ");
    assert.match(view.description, /VITE_API_BASE_URL/);
  });

  it("configuration không có message -> dùng mô tả fallback", () => {
    const view = failureFor({ kind: "configuration" });
    assert.equal(view.title, "Chưa cấu hình địa chỉ máy chủ");
    assert.match(view.description, /chưa biết địa chỉ máy chủ/);
  });

  it("network -> title 'Chưa kết nối được máy chủ'", () => {
    const view = failureFor(new ApiError("Chưa kết nối được backend. Kiểm tra mạng và thử lại.", 0, "network"));
    assert.equal(view.title, "Chưa kết nối được máy chủ");
  });

  it("invalid_response -> title 'Không kiểm tra được kết nối'", () => {
    const view = failureFor(new ApiError("Backend trả về dữ liệu không hợp lệ.", 200, "invalid_response"));
    assert.equal(view.title, "Không kiểm tra được kết nối");
  });

  it("fallback 'http' / 'unknown' (Error thường, ApiError cũ) -> lỗi chung, KHÔNG bao giờ coi là timeout", () => {
    for (const error of [
      new ApiError("Không thể hoàn tất yêu cầu. Vui lòng thử lại.", 503, "http"),
      new Error("boom"),
      { status: 0 }, // ApiError cũ không kind
    ]) {
      const view = failureFor(error);
      assert.equal(view.title, "Không kiểm tra được kết nối", `kind=${error.kind}`);
      assert.ok(!view.title.includes("thời gian chờ"), "không được hiển thị như timeout");
    }
  });
});

describe("shared connection-check — messageOf", () => {
  it("ưu tiên message có nội dung (trả nguyên văn), ngược lại trả fallback", () => {
    assert.equal(messageOf({ message: "Xin chào" }, "fallback"), "Xin chào");
    assert.equal(messageOf({ message: "   " }, "fallback"), "fallback");
    assert.equal(messageOf(null, "fallback"), "fallback");
  });
});
