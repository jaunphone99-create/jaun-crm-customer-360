"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "./Icon";

/* แถบนำทางล่างสำหรับมือถือ (CANONICAL ข้อ 14.4 · prototype D.mobileNav)

   จอเล็กกว่า 768px เมนูข้างถูกซ่อน (app.css บรรทัด 906) ถ้าไม่มีแถบนี้
   พนักงานที่ใช้มือถือหน้าร้านจะติดอยู่หน้าเดียว ออกไปไหนไม่ได้
   ปุ่มกลางเป็นปุ่มส้มวงกลมตาม prototype — งานที่ทำบ่อยที่สุดคือ "รับลูกค้า" */

export type BottomNavItem = { href: Route; label: string; icon: string; center?: boolean };

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="เมนูมือถือ">
      {items.map((item) =>
        item.center ? (
          <Link className="bottom-nav__center" key={item.href} href={item.href}>
            <span className="bottom-nav__center-btn">
              <Icon name={item.icon} />
            </span>
            <span>{item.label}</span>
          </Link>
        ) : (
          <Link
            className="bottom-nav__item"
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        )
      )}
    </nav>
  );
}
