import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "ChronoGraph — Intelligent Forensics Assistant",
  description:
    "An intelligent forensics chat assistant for security incident analysis and investigation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-chrono-bg text-chrono-text">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
