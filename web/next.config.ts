import type { NextConfig } from "next";

/* ทุก response ของแอปอาจมีข้อมูลลูกค้า จึงห้าม cache ทุกชั้น
   (CANONICAL ข้อ 9.2 · system-architecture.md §6.4) */
const noStore = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  async headers() {
    return [
      /* asset ที่มี hash ในชื่อไฟล์ cache ได้ ไม่มีข้อมูลผู้ใช้ */
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      /* ที่เหลือห้ามเก็บ — ยกเว้น /_next ซึ่ง Next.js จัดการ cache ของตัวเองอยู่แล้ว
         (asset มี hash ในชื่อไฟล์ · การไปทับ Cache-Control ของมันทำให้ dev และ RSC payload เพี้ยน) */
      { source: "/((?!_next/).*)", headers: noStore },
    ];
  },
};

export default nextConfig;
