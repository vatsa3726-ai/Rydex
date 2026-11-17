import type { ReactNode } from "react";
export const metadata = { title: "Veyra AI", description: "Fictional AI personalities for adults" };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body style={{fontFamily:"system-ui",margin:0,background:"#17131f",color:"#f9efff"}}>{children}</body></html>; }
