import type { Metadata, Viewport } from "next";
import { APP_NAME, ENV_BADGE } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} · Customer 360`, template: `%s · ${APP_NAME}` },
  description: "ระบบข้อมูลลูกค้าและ CRM ภายในองค์กร JAUN",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B1E41",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        {children}
        {ENV_BADGE ? <p className="env-badge">{ENV_BADGE}</p> : null}
      </body>
    </html>
  );
}
