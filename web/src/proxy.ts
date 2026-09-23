import { NextResponse, type NextRequest } from "next/server";

import { PATH_HEADER } from "@/features/session/routes";

/* ด่านแรกของทุก request (Next.js 16 เรียกไฟล์นี้แทน middleware.ts · architecture §6.3)

   หน้าที่: ต่ออายุเซสชัน และกันคนที่ยังไม่เข้าสู่ระบบออกจากหน้าที่ต้องล็อกอิน
   **ไม่ใช่** ที่ตัดสินสิทธิ์ — สิทธิ์ตัดสินที่ฐานข้อมูลด้วย RLS เสมอ (CANONICAL ข้อ 9)
   ที่นี่ทำแค่ไม่ให้ผู้ใช้เห็นหน้าเปล่าแล้วงง

   ที่นี่ยัง "ไม่รู้จักผู้ใช้" (ยังไม่ได้เรียก api.get_my_access) จึงกันได้แค่ยังไม่ล็อกอิน
   ส่วนสิทธิ์รายหน้าตัดสินที่ (app)/layout.tsx — proxy ช่วยได้อย่างเดียวคือ
   บอก layout ว่าตอนนี้ผู้ใช้กำลังขอหน้าไหน ผ่านหัวข้อ x-jcrm-path ด้านล่าง
   (Server Component อ่าน pathname เองไม่ได้ · ต้องมาจาก header ของ request)

   ห้ามให้ไฟล์นี้ยิงฐานข้อมูล — มันทำงานทุก request รวมทั้ง prefetch ของ Next.js */

/* หน้าที่เข้าได้โดยยังไม่มีเซสชัน

   /set-password และ /forgot-password ต้องอยู่ในรายการนี้ด้วย:
   คนที่กดลิงก์คำเชิญ/ลิงก์รีเซ็ตในอีเมล และคนที่ "ลืมรหัสผ่าน" ยังไม่มีเซสชันตามนิยาม
   ถ้าไม่ประกาศไว้ proxy จะเด้งกลับ /login ก่อนหน้าจะได้ทำงาน = flow คำเชิญและรีเซ็ตใช้ไม่ได้เลย
   ทั้งสองหน้าไม่ได้ให้สิทธิ์อะไร — /set-password แลก token_hash เป็นเซสชันใน Server Action
   (ไม่มีทั้ง token และเซสชัน หน้าจะพากลับ /login เอง) ส่วน /forgot-password ตอบเหมือนกันเสมอ */
const PUBLIC_PATHS = ["/login", "/auth", "/offline", "/set-password", "/forgot-password"];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/* คัดลอกหัวข้อของ request แล้วเขียน x-jcrm-path ทับ
   เขียนทับเสมอเพื่อไม่ให้ผู้ใช้ปลอมหัวข้อนี้มาหลอก layout ได้ */
function headersWithPath(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, request.nextUrl.pathname);
  return headers;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const driver = (process.env.JCRM_DB_DRIVER ?? (process.env.JCRM_ENV === "dev" ? "dev" : "supabase")).toLowerCase();
  const headers = headersWithPath(request);

  /* ---- โหมดพัฒนา: ดูแค่ว่ามี cookie เลือกผู้ใช้ไว้หรือยัง ---- */
  if (driver === "dev") {
    const signedIn = Boolean(request.cookies.get("jcrm.dev.session")?.value);
    if (!signedIn && !isPublic(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request: { headers } });
  }

  /* ---- โหมดจริง: ต่ออายุเซสชัน Supabase แล้วตรวจว่ามีผู้ใช้ ---- */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request: { headers } });

  const { createServerClient } = await import("@supabase/ssr");
  let response = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        response = NextResponse.next({ request: { headers } });
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
