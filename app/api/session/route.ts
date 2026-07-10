import { NextResponse } from "next/server";
import { getCurrentUser, hasAdminPanelAccess } from "@/lib/auth";
import { hasAdminPanelPassword } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();

  let adminAccess: { isAdmin: boolean; hasPassword: boolean; hasAccess: boolean } | null = null;
  if (user?.role === "admin") {
    const [hasPassword, hasAccess] = await Promise.all([
      hasAdminPanelPassword(user.id),
      hasAdminPanelAccess(user.id),
    ]);
    adminAccess = { isAdmin: true, hasPassword, hasAccess };
  }

  return NextResponse.json(
    {
      user: user ? { email: user.email, role: user.role } : null,
      adminAccess,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
