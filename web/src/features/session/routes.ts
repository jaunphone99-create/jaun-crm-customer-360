/* ตารางเดียวของทั้งแอป: หน้าไหนต้องมีสิทธิ์อะไร (architecture §6.3 ขั้นที่ 3)

   ทำไมต้องมีไฟล์นี้: proxy.ts ทำงานก่อนรู้จักผู้ใช้ จึงกันได้แค่ "ยังไม่เข้าสู่ระบบ"
   ส่วน "เข้าสู่ระบบแล้วแต่ไม่มีสิทธิ์หน้านี้" ต้องตัดสินหลังอ่าน api.get_my_access()
   ซึ่งทำได้ที่ (app)/layout.tsx — ที่นี่เก็บแค่ "ข้อมูล" ไม่มีตรรกะฐานข้อมูล

   ย้ำกติกาข้อ 9.6: นี่คือการกัน "ไม่ให้เปิดหน้า" เท่านั้น ไม่ใช่การตัดสินสิทธิ์จริง
   ต่อให้เดาลิงก์ถูกและหลุดเข้ามาได้ ฐานข้อมูลก็ยังไม่คืนข้อมูลอยู่ดี (RLS) */

/* หัวข้อที่ proxy.ts เขียนบอก layout ว่าตอนนี้ขอหน้าไหน
   อยู่ในไฟล์นี้เพราะ proxy ทำงานทุก request — มัน import ได้แค่โมดูลเบา ๆ ที่ไม่มี dependency */
export const PATH_HEADER = "x-jcrm-path";

export type AppRouteRule = {
  /** เส้นทางที่ประกาศ — คุมทั้งตัวมันเองและเส้นทางย่อยทั้งหมด (`/customers` คุม `/customers/CUS-…` ด้วย) */
  path: string;
  /** สิทธิ์ที่ต้องมีและต้อง `effective_now` · null = เปิดให้ทุกคนที่เข้าสู่ระบบแล้ว */
  permission: string | null;
  /** ชื่อหน้าไทย — ใช้เขียน log ฝั่งเซิร์ฟเวอร์ตอนปฏิเสธ ไม่ได้แสดงให้ผู้ใช้เห็น */
  label: string;
};

/* เรียงอย่างไรก็ได้ — ตัวจับคู่เลือก "เส้นทางที่ประกาศยาวที่สุดที่ตรง" เสมอ
   เพิ่มหน้าใหม่ต้องมาเพิ่มที่นี่ ไม่งั้นหน้านั้นจะถูกปฏิเสธทั้งหมด (ตั้งใจให้ปลอดภัยไว้ก่อน) */
export const APP_ROUTES: AppRouteRule[] = [
  /* หน้าแรกหลังเข้าสู่ระบบของ "ทุกบทบาท" — ห้ามผูกกับ dashboard.view
     เพราะ SYSTEM_ADMIN ไม่มีสิทธิ์นั้น (ข้อ 7) แต่ต้องเข้าสู่ระบบได้และเห็นสถานะตัวเอง
     ตัวเลข KPI ของชุดที่ 2 ต้องกันด้วย dashboard.view ในหน้านั้นเอง ไม่ใช่กันทั้งหน้า */
  { path: "/dashboard", permission: null, label: "หน้าหลัก" },
  { path: "/reception", permission: "visit.read", label: "รับลูกค้าเข้าร้าน" },
  { path: "/customers", permission: "customer.read", label: "ลูกค้า" },
  { path: "/customers/new", permission: "customer.create", label: "เพิ่มลูกค้า" },
  { path: "/users", permission: "user.read", label: "ผู้ใช้และสิทธิ์" },
];

/** ตัดเครื่องหมาย / ท้ายทางออก เพื่อให้ `/customers/` กับ `/customers` เป็นเส้นทางเดียวกัน */
function normalize(pathname: string): string {
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return p.startsWith("/") ? p : `/${p}`;
}

/**
 * หากฎของเส้นทางนี้ — เลือกกฎที่ "ประกาศยาวที่สุดและตรง"
 * `/customers/new` จึงชนะ `/customers` ส่วน `/customers/CUS-2026-000001` ตกมาใช้ `/customers`
 * ไม่ตรงกฎไหนเลย → null (ผู้เรียกต้องถือว่าไม่มีสิทธิ์ · ปลอดภัยไว้ก่อน)
 */
export function ruleFor(pathname: string): AppRouteRule | null {
  const path = normalize(pathname);
  let best: AppRouteRule | null = null;
  for (const rule of APP_ROUTES) {
    const base = normalize(rule.path);
    if (path !== base && !path.startsWith(`${base}/`)) continue;
    if (!best || base.length > normalize(best.path).length) best = rule;
  }
  return best;
}
