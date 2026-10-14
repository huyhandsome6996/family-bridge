// asset-hook.mjs — loader hook xử lý import ảnh (.png/.jpg/.jpeg/.webp/.svg)
// dưới Node thuần cho TOÀN BỘ test DOM (design-system/pages/qa-*).
//
// Vite lúc build biến `import x from "./a.png"` thành `export default <URL>`;
// dưới Node thuần việc import ảnh bị ERR_UNKNOWN_FILE_EXTENSION. Hook này
// mô phỏng ĐÚNG hành vi Vite: export đường dẫn file (dạng file:// URL) để
// code app chạy nguyên văn — không đổi logic, không giả dữ liệu.
//
// Đăng ký trong file test: await module.register(new URL("./asset-hook.mjs", import.meta.url));
// (module.register trả Promise trong Node ≥ 20.6 — phải await TRƯỚC mọi
// import động của src để hook có hiệu lực từ đầu.)
import { pathToFileURL } from "node:url";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];

export async function load(url, context, nextLoad) {
  const path = new URL(url).pathname;
  if (IMAGE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))) {
    return {
      format: "module",
      source: `export default ${JSON.stringify(pathToFileURL(path).href)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
