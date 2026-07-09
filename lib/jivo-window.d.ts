export {};

declare global {
  interface Window {
    jivo_api?: {
      open: (params?: { start?: string }) => { result: string };
      close: () => { result: string };
      setWidgetColor: (color: string, color2?: string) => void;
      setContactInfo: (info: {
        name?: string;
        email?: string;
        phone?: string;
        description?: string;
      }) => void;
      sendPageTitle: (title: string, fromApi?: boolean, url?: string) => void;
    };
    jivo_onLoadCallback?: () => void;
    jivo_onOpen?: () => void;
    __skmJivoApplyBrand?: () => void;
    __skmLocalizeJivo?: () => void;
  }
}