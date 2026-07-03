/** Цвета бренда СКМ — совпадают с app/globals.css */
export const tawkBrand = {
  primary: "#e30613",
  primaryHover: "#c00510",
  background: "#0a0a0a",
  surface: "#18181b",
  text: "#ffffff",
  muted: "#a1a1aa",
} as const;

/** CSS для кнопки виджета на странице (вне iframe). */
export const tawkPageBrandCss = `
.tawk-min-container .tawk-button,
.tawk-min-container .tawk-button-circle,
.tawk-min-container .tawk-button-large {
  background-color: ${tawkBrand.primary} !important;
  border-color: ${tawkBrand.primary} !important;
}
.tawk-min-container .tawk-button:hover,
.tawk-min-container .tawk-button-circle:hover {
  background-color: ${tawkBrand.primaryHover} !important;
}
`;

/**
 * CSS внутри iframe чата. Полная локализация — в dashboard Tawk.to
 * (Administration → Chat Widget → Widget Content → Language: Russian).
 */
export const tawkIframeBrandCss = `
.tawk-button,
.tawk-button-circle,
.tawk-button-large,
.tawk-button-small,
.tawk-send-button,
button[type="submit"] {
  background-color: ${tawkBrand.primary} !important;
  border-color: ${tawkBrand.primary} !important;
}
.tawk-button:hover,
.tawk-button-circle:hover,
.tawk-send-button:hover {
  background-color: ${tawkBrand.primaryHover} !important;
}
.tawk-header,
.tawk-card-header,
.tawk-chat-header {
  background-color: ${tawkBrand.primary} !important;
  color: ${tawkBrand.text} !important;
}
.tawk-chat-panel,
.tawk-card,
.tawk-card-content,
.tawk-messages {
  background-color: ${tawkBrand.surface} !important;
  color: ${tawkBrand.text} !important;
}
.tawk-message-agent,
.tawk-message-agent .tawk-message-body {
  background-color: ${tawkBrand.primary} !important;
  color: ${tawkBrand.text} !important;
}
.tawk-message-visitor,
.tawk-message-visitor .tawk-message-body {
  background-color: #27272a !important;
  color: ${tawkBrand.text} !important;
}
`;