// Barrel — điểm import duy nhất cho pages (CONTRACTS.md mục 3/5).
// Port web (ADR-3, task 19-a): chỉ export các component được 13 trang đã port
// + app-shell/bottom-nav (router) cần. KHÔNG port: createList, createAppHeader
// (chỉ các trang stub W2-b dùng — sẽ port cùng W2-b).
// 19/10/2026 (F07 web parity — quyết định Huy): port thêm createTextarea cho
// trang /mood; file copy độc lập của mini app, không import chéo UI tree.
export { createButton } from "./button.js";
export { createInput } from "./input.js";
export { createTextarea } from "./textarea.js";
export { createCard } from "./card.js";
export { createSheet } from "./sheet.js";
export { createDialog } from "./dialog.js";
export { createSkeleton } from "./skeleton.js";
export { createEmptyState } from "./empty-state.js";
export { createErrorState } from "./error-state.js";
export { createStatusBadge } from "./status-badge.js";
export { createTopBar } from "./top-bar.js";
export { createBottomNav } from "./bottom-nav.js";
export { createDemoBanner } from "./demo-banner.js";
export { createLogo } from "./logo.js";
export { createIcon } from "./icon.js";
