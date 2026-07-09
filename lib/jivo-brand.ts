import { jivoRussianCopy } from "@/lib/jivo-copy";

export const jivoBrand = {
  primary: "#e30613",
  primaryHover: "#c00510",
  background: "#18181b",
  text: "#ffffff",
} as const;

export const jivoPageCss = `
#jivo_chat_widget,
#jivo_custom_widget,
jdiv {
  z-index: 9990 !important;
}
`;

type JivoBootOptions = {
  visitor?: { name: string; email: string } | null;
};

export function buildJivoBootScript({ visitor = null }: JivoBootOptions = {}) {
  const visitorJson = JSON.stringify(visitor);
  const colorJson = JSON.stringify(jivoBrand.primary);
  const color2Json = JSON.stringify(jivoBrand.primaryHover);

  return `
(function () {
  var visitor = ${visitorJson};
  var brandColor = ${colorJson};
  var brandColor2 = ${color2Json};

  function applyBrandAndContact() {
    if (!window.jivo_api) return;

    try {
      window.jivo_api.setWidgetColor(brandColor, brandColor2);
    } catch (e) {}

    if (visitor && visitor.email) {
      try {
        window.jivo_api.setContactInfo({
          name: visitor.name || ${JSON.stringify(jivoRussianCopy.guestName)},
          email: visitor.email,
        });
      } catch (e) {}
    }
  }

  window.__skmJivoApplyBrand = applyBrandAndContact;

  var previousOnLoad = window.jivo_onLoadCallback;
  window.jivo_onLoadCallback = function () {
    if (typeof previousOnLoad === "function") {
      try { previousOnLoad(); } catch (e) {}
    }
    applyBrandAndContact();
    if (typeof window.__skmLocalizeJivo === "function") {
      window.__skmLocalizeJivo();
    }
  };

  var previousOnOpen = window.jivo_onOpen;
  window.jivo_onOpen = function () {
    if (typeof previousOnOpen === "function") {
      try { previousOnOpen(); } catch (e) {}
    }
    if (typeof window.__skmLocalizeJivo === "function") {
      window.__skmLocalizeJivo();
    }
  };
})();
`;
}