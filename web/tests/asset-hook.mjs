// asset-hook.mjs — loader hook xử lý import asset tĩnh (.png/.jpg/.jpeg/.webp/
// .svg/.gif/.avif + .css) dưới Node thuần cho TOÀN BỘ test DOM (design-system/
// pages/qa-*).
//
// Vite lúc build biến `import x from "./a.png"` thành `export default <URL>`;
// dưới Node thuần việc import ảnh bị ERR_UNKNOWN_FILE_EXTENSION. Hook này
// mô phỏng ĐÚNG hành vi Vite: export đường dẫn file (dạng file:// URL) để
// code app chạy nguyên văn — không đổi logic, không giả dữ liệu.
//
// .css: các trang Stitch (pages-role-select.css / pages-connect.css) import
// stylesheet ngay đầu file theo đúng chiến lược Vite (`import "../styles/x.css"`
// là side-effect import). Dưới Node thuần hook trả default là file:// URL của
// file CSS — side-effect import chạy được, không ai đọc giá trị này.
//
// Đăng ký trong file test: await module.register(new URL("./asset-hook.mjs", import.meta.url));
// (module.register trả Promise trong Node ≥ 20.6 — phải await TRƯỚC mọi
// import động của src để hook có hiệu lực từ đầu.)
import { pathToFileURL } from "node:url";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];
const STYLE_EXTENSIONS = [".css"];

export async function load(url, context, nextLoad) {
  const path = new URL(url).pathname;
  if (IMAGE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))) {
    return {
      format: "module",
      source: `export default ${JSON.stringify(pathToFileURL(path).href)};`,
      shortCircuit: true,
    };
  }
  if (STYLE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))) {
    return {
      format: "module",
      source: `export default ${JSON.stringify(pathToFileURL(path).href)};`,
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
