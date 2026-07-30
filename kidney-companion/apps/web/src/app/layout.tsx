import type { ReactNode } from "react";

export const metadata = {
  title: "Kidney Companion",
  description: "Manage chronic kidney disease in one place — informational, not a medical device.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#f6f8fb", color: "#0f172a" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>{children}</main>
      </body>
    </html>
  );
}
