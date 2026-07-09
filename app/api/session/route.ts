import { NextResponse } from "next/server";
import { getCurrentUser, hasAdminPanelAccess } from "@/lib/auth";
import { hasAdminPanelPassword } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();

  const adminAccess =
    user?.role === "admin"
      ? {
          isAdmin: true,
          hasPassword: await hasAdminPanelPassword(user.id),
          hasAccess: await hasAdminPanelAccess(user.id),
        }
      : null;

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
