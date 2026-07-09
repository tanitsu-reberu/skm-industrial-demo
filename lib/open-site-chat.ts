export function openSiteChat() {
  if (typeof window === "undefined") return;

  if (window.jivo_api?.open) {
    window.jivo_api.open({ start: "chat" });
    return;
  }

  window.dispatchEvent(new CustomEvent("skm:open-chat"));

  const label = document.querySelector<HTMLElement>("#jivo_chat_widget, [class*='jivo'], jdiv");
  label?.click();
}
