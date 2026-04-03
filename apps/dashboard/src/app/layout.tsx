import "./globals.css";
import "@radix-ui/themes/styles.css";

import { Theme } from "@radix-ui/themes";
import type { Metadata } from "next";
import localFont from "next/font/local";

import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/Providers";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "유하리 - Discord Music Dashboard",
  description: "Manage your Discord server music settings with 유하리",
};

const pretendard = localFont({
  src: "../../public/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] antialiased">
        <Theme
          appearance="dark"
          accentColor="sky"
          grayColor="slate"
          radius="medium"
          scaling="95%"
        >
          <TooltipProvider>
            <Providers>
              <div className="relative flex min-h-screen flex-col">
                <Navbar />
                <main className="relative z-10 flex-1">
                  <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
                    {children}
                  </div>
                </main>
                <footer className="relative z-10 border-t border-white/[0.04] py-8">
                  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                        <span className="gradient-text font-semibold">
                          유하리
                        </span>
                        <span>·</span>
                        <span>© {new Date().getFullYear()}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                        <a
                          href="https://discord.com/oauth2/authorize?client_id=1457415706495946957&permissions=0&scope=bot"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="transition-colors hover:text-[var(--color-text-secondary)]"
                        >
                          봇 초대
                        </a>
                      </div>
                    </div>
                  </div>
                </footer>
              </div>
            </Providers>
          </TooltipProvider>
        </Theme>
      </body>
    </html>
  );
}
