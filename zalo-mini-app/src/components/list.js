// createList — danh sách đơn giản (CONTRACTS.md mục 3).
// <ul class="fb-list"> với mỗi mục <li class="fb-list__item">.
// Quy ước contract: danh sách RỖNG không được render — caller phải dùng
// createEmptyState thay thế; hàm này chỉ phản ánh đúng items truyền vào.
// renderItem(item, index) trả về HTMLElement (hoặc chuỗi tĩnh).
import { h } from "../app/dom.js";

export function createList({ items, renderItem } = {}) {
  const list = h("ul", { class: "fb-list" });
  const safeItems = Array.isArray(items) ? items : [];

  safeItems.forEach((item, index) => {
    const li = h("li", { class: "fb-list__item" });
    const rendered = typeof renderItem === "function" ? renderItem(item, index) : item;

    if (rendered instanceof Node) {
      li.appendChild(rendered);
    } else if (rendered !== null && rendered !== undefined && rendered !== false) {
      // Chuỗi/t_number: render qua text node (an toàn XSS, không innerHTML)
      li.appendChild(document.createTextNode(String(rendered)));
    }
    list.appendChild(li);
  });

  return list;
}
