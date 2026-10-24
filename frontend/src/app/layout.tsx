import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reskure — AI Audit & Assurance",
  description: "Independent bias, drift, explainability and privacy readiness verification for AI systems.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased selection:bg-zinc-700 selection:text-zinc-100 min-h-dvh flex flex-col">
        {children}
      </body>
    </html>
  );
}
