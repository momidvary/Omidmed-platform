import type { Metadata } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { CaseProvider } from "@/lib/store/CaseContext";
import { PatientProvider } from "@/lib/store/PatientContext";
import { LocaleProvider } from "@/lib/store/LocaleContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
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
    <html lang="en" className={`${inter.variable} ${vazirmatn.variable}`}>
      <body>
        <LocaleProvider>
          <CaseProvider>
            <PatientProvider>
              <AppShell>{children}</AppShell>
            </PatientProvider>
          </CaseProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
