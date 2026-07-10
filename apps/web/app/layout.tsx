import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { CaseProvider } from "@/lib/store/CaseContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PhysioAI Assistant",
  description:
    "AI-assisted clinical reasoning, assessment, treatment planning and exercise prescription for physiotherapists.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <CaseProvider>
          <AppShell>{children}</AppShell>
        </CaseProvider>
      </body>
    </html>
  );
}
