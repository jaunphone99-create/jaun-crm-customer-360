import { redirect } from "next/navigation";

import { CounterLock } from "@/features/session/CounterLock";
import { sharedCounterIdleMinutes } from "@/features/session/config";
import { gateFor, rolesWithPermission } from "@/features/session/guard";
import { NotAuthorized } from "@/features/shell/NotAuthorized";
import { AppShell } from "@/features/shell/AppShell";
import { getAccess } from "@/lib/access";
import { JCRM_ENV } from "@/lib/env";

/* ด่านของทุกหน้าในกลุ่ม (app) (architecture §6.3 ขั้นที่ 3–4)

   proxy.ts กันได้แค่ "ยังไม่เข้าสู่ระบบ" เพราะตอนนั้นยังไม่รู้ว่าผู้ใช้เป็นใคร
   ที่นี่เรียก api.get_my_access() ครั้งเดียวต่อ request แล้วตัดสินตามลำดับ:
   สถานะบัญชี → MFA step-up → สิทธิ์ของหน้านั้น (ตรรกะอยู่ใน features/session/guard.ts)

   เข้าหน้าที่ไม่มีสิทธิ์โดยพิมพ์ URL ตรง ๆ จะได้การ์ด "ไม่มีสิทธิ์เข้าหน้านี้"
   ไม่ใช่หน้าเปล่าหรือ error — และถึงหลุดเข้ามาได้ ฐานข้อมูลก็ยังไม่คืนข้อมูลอยู่ดี (RLS) */

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess().catch(() => null);
  if (!access) redirect("/login");

  const gate = await gateFor(access);
  if (gate.kind === "redirect") redirect(gate.to);

  /* หน้าจอล็อกของเครื่อง counter อยู่นอก AppShell ตั้งใจ — เวลาล็อกต้องซ่อน .app ทั้งก้อน */
  const lock = (
    <CounterLock idleMinutes={await sharedCounterIdleMinutes()} allowDevOverride={JCRM_ENV === "dev"} />
  );

  if (gate.kind === "denied") {
    /* "ใครเข้าหน้านี้ได้" = ทุกบทบาทที่มีสิทธิ์ใดสิทธิ์หนึ่งของหน้านั้น (routes.ts อธิบายว่าทำไมมีได้หลายตัว) */
    const allowedRoles = gate.permissions.length > 0 ? await rolesWithPermission(gate.permissions) : undefined;
    return (
      <>
        <AppShell access={access}>
          <NotAuthorized
            allowedRoles={allowedRoles}
            myRoles={access.roles.map((r) => r.role_code)}
            detail="ถ้าคิดว่าควรเข้าได้ ให้แจ้งผู้จัดการสาขาเพื่อขอสิทธิ์"
          />
        </AppShell>
        {lock}
      </>
    );
  }

  return (
    <>
      <AppShell access={access}>{children}</AppShell>
      {lock}
    </>
  );
}
