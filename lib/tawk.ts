export type TawkConfig = {
  enabled: boolean;
  propertyId: string;
  widgetId: string;
  /** Показывать виджет только авторизованным пользователям. */
  authOnly: boolean;
};

export function getTawkConfig(): TawkConfig | null {
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim();
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim();

  if (!propertyId || !widgetId) return null;
  if (process.env.NEXT_PUBLIC_TAWK_ENABLED === "false") return null;

  return {
    enabled: true,
    propertyId,
    widgetId,
    authOnly: process.env.NEXT_PUBLIC_TAWK_AUTH_ONLY === "true",
  };
}