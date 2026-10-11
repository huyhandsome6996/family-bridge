// createCard — khối nội dung (CONTRACTS.md mục 3).
// <section class="fb-card"> + title/description/footer/children tuỳ chọn.
// variant "brand": nền --fb-cta + chữ --fb-on-cta (5.36:1, đạt AA).
import { h } from "../app/dom.js";

const VARIANTS = ["default", "brand"];

function appendChildContent(parent, child) {
  if (child instanceof Node) {
    parent.appendChild(child);
  } else if (Array.isArray(child)) {
    child.forEach((c) => appendChildContent(parent, c));
  } else if (child !== null && child !== undefined && child !== false) {
    parent.appendChild(document.createTextNode(String(child)));
  }
}

export function createCard({
  title,
  description,
  footer,
  children,
  variant = "default",
} = {}) {
  const safeVariant = VARIANTS.includes(variant) ? variant : "default";
  const card = h(
    "section",
    { class: `fb-card${safeVariant === "brand" ? " fb-card--brand" : ""}` }
  );

  if (title) card.appendChild(h("h3", { class: "fb-card__title" }, title));
  if (description) {
    card.appendChild(h("p", { class: "fb-card__description" }, description));
  }
  if (children) appendChildContent(card, children);
  if (footer) card.appendChild(h("footer", { class: "fb-card__footer" }, footer));

  return card;
}
