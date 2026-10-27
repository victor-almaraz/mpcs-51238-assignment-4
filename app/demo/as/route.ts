// Demo mode only (lib/server/demo.ts): signs the demo in as another seeded user, such as `user_new`,
// who has nothing yet, then opens `next`. /demo/as?user=user_demo returns to the demo user.
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_USER, DEMO_USER_COOKIE, demoMode } from "@/lib/server/demo";
import { safeNext } from "@/lib/server/forms";

export function GET(request: NextRequest): NextResponse {
  if (!demoMode()) return new NextResponse(null, { status: 404 });
  const user = request.nextUrl.searchParams.get("user") ?? DEMO_USER;
  if (!/^user_[a-z]+$/.test(user)) return new NextResponse("unknown demo user", { status: 400 });
  const response = NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  if (user === DEMO_USER) response.cookies.delete(DEMO_USER_COOKIE);
  else response.cookies.set(DEMO_USER_COOKIE, user, { path: "/", httpOnly: true, sameSite: "lax" });
  return response;
}
