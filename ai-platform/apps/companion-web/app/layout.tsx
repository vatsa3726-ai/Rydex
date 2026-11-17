import type { ReactNode } from "react";
import "./globals.css";
export const metadata = {
  title: "SoulNest",
  description: "Thoughtful AI companions",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
