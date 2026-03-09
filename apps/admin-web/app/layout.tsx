import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Bynle Admin",
  description: "Tenant admin for Bynle"
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
