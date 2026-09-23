/* ไอคอนชุดเดียวกับ prototype (prototype/assets/app.js · ตัวแปร ICONS)

   ใช้การเข้ารหัสแบบเดียวกัน: "c:cx,cy,r" = วงกลม · "r:x,y,w,h,rx" = สี่เหลี่ยม · ที่เหลือเป็น path d
   คัดมาเฉพาะไอคอนที่หน้าจอใน Phase 1 ใช้จริง — เพิ่มได้เมื่อมีหน้าใหม่
   ไอคอนในเมนูสำคัญกว่าที่คิด: จอแคบกว่า 1280px เมนูจะย่อเหลือแต่ไอคอน (app.css บรรทัด 883–887) */

const ICONS: Record<string, string[]> = {
  home: ["M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  users: ["c:9,8,4", "M2 21c0-3.5 3-6 7-6s7 2.5 7 6", "M16 4a4 4 0 0 1 0 8", "M22 21c0-3-2-5-5-5.8"],
  userPlus: ["c:9,8,4", "M2 21c0-3.5 3-6 7-6s7 2.5 7 6", "M19 8v6M16 11h6"],
  store: ["M4 10v10h16V10", "M2 10l2-6h16l2 6z", "M10 20v-5h4v5"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  plus: ["M12 5v14M5 12h14"],
  chart: ["M4 20V10M10 20V4M16 20v-7M22 20H2"],
};

export function Icon({ name, className }: { name: keyof typeof ICONS | string; className?: string }) {
  const parts = ICONS[name] ?? ICONS.home ?? [];
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {parts.map((p, i) => {
        if (p.startsWith("c:")) {
          const [cx, cy, r] = p.slice(2).split(",");
          return <circle key={i} cx={cx} cy={cy} r={r} />;
        }
        if (p.startsWith("r:")) {
          const [x, y, w, h, rx] = p.slice(2).split(",");
          return <rect key={i} x={x} y={y} width={w} height={h} rx={rx} />;
        }
        return <path key={i} d={p} />;
      })}
    </svg>
  );
}
