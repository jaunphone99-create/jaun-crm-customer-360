import type { Route } from "next";
import Link from "next/link";

import { BottomNav, type BottomNavItem } from "./BottomNav";
import { SidebarNav } from "./SidebarNav";

import { signOut } from "@/features/auth/actions";
import { can, topRole, type Access } from "@/lib/access";
import { roleLabel } from "@/lib/labels";

/* โครงหน้าจอหลัก: เมนูข้าง + แถบบน + พื้นที่เนื้อหา

   เมนูแสดงเฉพาะหน้าที่ผู้ใช้เข้าได้ และกลุ่มที่ไม่มีหน้าเลยให้ซ่อนทั้งกลุ่ม (CANONICAL ข้อ 14.2)
   การซ่อนเป็นเรื่องของความสะดวกเท่านั้น — ถึงเดาลิงก์ถูก ฐานข้อมูลก็ยังไม่ให้ข้อมูลอยู่ดี */

type NavItem = { href: Route; label: string; icon: string; permission?: string };
type NavGroup = { label: string; icon: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "หน้าหลัก",
    icon: "home",
    items: [{ href: "/dashboard", label: "หน้าหลัก", icon: "home", permission: "dashboard.view" }],
  },
  {
    label: "ลูกค้าเข้าร้าน",
    icon: "store",
    items: [{ href: "/reception", label: "รับลูกค้าเข้าร้าน", icon: "store", permission: "visit.read" }],
  },
  {
    /* หน้า "ลูกค้า" (03) กับ Customer 360 (05) อยู่ลำดับถัดไปของชุดที่ 1
       จะเพิ่มเข้าเมนูเมื่อหน้าพร้อมจริง ไม่ใส่ลิงก์ที่กดแล้วเจอหน้าว่าง */
    label: "ลูกค้า",
    icon: "users",
    items: [{ href: "/customers/new", label: "เพิ่มลูกค้า", icon: "userPlus", permission: "customer.create" }],
  },
];

function visibleGroups(access: Access): NavGroup[] {
  return GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.permission || can(access, i.permission)),
  })).filter((g) => g.items.length > 0);
}

export function AppShell({ access, children }: { access: Access; children: React.ReactNode }) {
  const groups = visibleGroups(access);
  const role = topRole(access);
  const who = access.staff.nickname || access.staff.display_name;
  const branchCodes = access.branches.map((b) => b.code).join(" ");

  /* แถบล่างบนมือถือ — เอาเฉพาะหน้าที่ผู้ใช้คนนี้เข้าได้จริง (เหมือนเมนูข้าง) */
  const mobileItems: BottomNavItem[] = [
    { href: "/dashboard" as Route, label: "หน้าแรก", icon: "home", permission: "dashboard.view" },
    { href: "/reception" as Route, label: "รับลูกค้า", icon: "store", permission: "visit.read", center: true },
    { href: "/customers/new" as Route, label: "เพิ่มลูกค้า", icon: "userPlus", permission: "customer.create" },
  ]
    .filter((i) => can(access, i.permission))
    .map(({ permission: _permission, ...item }) => item);

  return (
    <div className="app">
      <aside className="sidebar" aria-label="เมนูหลัก">
        <Link className="sidebar__brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            J
          </span>
          <span className="sidebar__brand-text">
            <span className="sidebar__title">
              JAUN <span className="sidebar__title-accent">CRM</span>
            </span>
            <br />
            <span className="sidebar__subtitle">CUSTOMER 360</span>
          </span>
        </Link>

        <SidebarNav groups={groups} />

        <div className="sidebar__footer">
          <p className="sidebar__bu">
            <strong>JAUN POWER MONEY</strong>
            เชื่อมผ่านเลขธุรกรรมใน V1
          </p>
        </div>
      </aside>

      <header className="topbar">
        <div className="grow" />
        <div className="topbar__actions">
          <span className="t-sm">
            {who}
            {role ? ` · ${roleLabel(role.role_code)}` : ""}
            {branchCodes ? ` · ${branchCodes}` : ""}
          </span>
          <form action={signOut}>
            <button type="submit" className="btn btn--ghost btn--sm">
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>

      <main className="main" id="main">
        <div className="page">{children}</div>
      </main>

      {mobileItems.length > 1 ? <BottomNav items={mobileItems} /> : null}
    </div>
  );
}
