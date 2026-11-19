import type { ReactNode } from "react";
import "./globals.css";
export const metadata = {
  title: "Veyra AI — Imagined, unmistakably",
  description:
    "A private world of fictional adult AI personalities by HPSV Infra Tech LLP. 18+ access. All characters are fictional and 21+.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
