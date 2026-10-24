import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reskure AI Audit",
  description: "Bias, drift, explainability and DPDP/GDPR readiness checks for small AI teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#060913] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}
