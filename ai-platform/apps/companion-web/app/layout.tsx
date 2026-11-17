import type { ReactNode } from "react";
export const metadata = { title: "SoulNest", description: "Thoughtful AI companions" };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body style={{fontFamily:"system-ui",margin:0,background:"#f6f3ff",color:"#28203b"}}>{children}</body></html>; }
