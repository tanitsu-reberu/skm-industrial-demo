export type JivoConfig = {
  enabled: boolean;
  widgetId: string;
  /** Показывать виджет только авторизованным пользователям. */
  authOnly: boolean;
};

export function getJivoConfig(): JivoConfig | null {
  const widgetId = process.env.NEXT_PUBLIC_JIVO_WIDGET_ID?.trim();

  if (!widgetId) return null;
  if (process.env.NEXT_PUBLIC_JIVO_ENABLED === "false") return null;

  return {
    enabled: true,
    widgetId,
    authOnly: process.env.NEXT_PUBLIC_JIVO_AUTH_ONLY === "true",
  };
}