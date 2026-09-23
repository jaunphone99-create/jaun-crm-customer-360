import { NextResponse, type NextRequest } from "next/server";

/* ด่านแรกของทุก request (Next.js 16 เรียกไฟล์นี้แทน middleware.ts · architecture §6.3)

   หน้าที่: ต่ออายุเซสชัน และกันคนที่ยังไม่เข้าสู่ระบบออกจากหน้าที่ต้องล็อกอิน
   **ไม่ใช่** ที่ตัดสินสิทธิ์ — สิทธิ์ตัดสินที่ฐานข้อมูลด้วย RLS เสมอ (CANONICAL ข้อ 9)
   ที่นี่ทำแค่ไม่ให้ผู้ใช้เห็นหน้าเปล่าแล้วงง */

const PUBLIC_PATHS = ["/login", "/auth", "/offline"];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const driver = (process.env.JCRM_DB_DRIVER ?? (process.env.JCRM_ENV === "dev" ? "dev" : "supabase")).toLowerCase();

  /* ---- โหมดพัฒนา: ดูแค่ว่ามี cookie เลือกผู้ใช้ไว้หรือยัง ---- */
  if (driver === "dev") {
    const signedIn = Boolean(request.cookies.get("jcrm.dev.session")?.value);
    if (!signedIn && !isPublic(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  /* ---- โหมดจริง: ต่ออายุเซสชัน Supabase แล้วตรวจว่ามีผู้ใช้ ---- */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  const { createServerClient } = await import("@supabase/ssr");
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  /* เรียกเพื่อ refresh token — ห้ามตัดโค้ดบรรทัดนี้ทิ้ง ไม่งั้นเซสชันจะหมดอายุกลางทาง */
  const { data } = await supabase.auth.getUser();

  if (!data.user && !isPublic(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }

  /* ต้องยืนยันสองขั้นตอนก่อนจึงจะใช้งานต่อได้ (ข้อ 9.2) */
  if (data.user && !isPublic(pathname)) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
      const to = request.nextUrl.clone();
      to.pathname = "/login/mfa";
      to.search = "";
      return NextResponse.redirect(to);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|icons/|manifest.webmanifest).*)"],
};
