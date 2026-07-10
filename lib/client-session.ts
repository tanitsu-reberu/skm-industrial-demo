export type SessionState = {
  user: {
    email: string;
    role: "admin" | "user";
  } | null;
  adminAccess: {
    isAdmin: boolean;
    hasPassword: boolean;
    hasAccess: boolean;
  } | null;
};

export async function loadSession(signal?: AbortSignal): Promise<SessionState> {
  const response = await fetch("/api/session", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });

  if (!response.ok) return { user: null, adminAccess: null };
  return response.json();
}
