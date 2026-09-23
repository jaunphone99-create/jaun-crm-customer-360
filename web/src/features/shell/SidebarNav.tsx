"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "./Icon";

/* แยกเป็น client component เพราะต้องรู้ว่าตอนนี้อยู่หน้าไหนเพื่อทำเครื่องหมาย aria-current
   ส่วนการกรองเมนูตามสิทธิ์ทำที่ฝั่ง server แล้ว ที่นี่แค่วาด */

export type NavGroupView = { label: string; icon: string; items: { href: Route; label: string; icon: string }[] };

export function SidebarNav({ groups }: { groups: NavGroupView[] }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar__nav" aria-label="เมนูหลัก">
      {groups.map((group) => {
        const single = group.items.length === 1 && group.items[0]?.label === group.label;
        return (
          <div className="nav-group" key={group.label}>
            {single ? null : (
              <div className="nav-group__label">
                <span>{group.label}</span>
              </div>
            )}
            {group.items.map((item) => (
              <Link
                key={item.href}
                className={single ? "nav-item" : "nav-item nav-item--sub"}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                title={item.label}
              >
                <Icon name={item.icon} className="nav-icon" />
                <span className="nav-item__label">{item.label}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
