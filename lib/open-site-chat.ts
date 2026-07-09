export function openSiteChat() {
  if (typeof window === "undefined") return;

  if (window.jivo_api?.open) {
    window.jivo_api.open({ start: "chat" });
    return;
  }

  const label = document.querySelector<HTMLElement>("#jivo_chat_widget, [class*='jivo'], jdiv");
  label?.click();
}