import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { BackgroundShapes } from "@/components/background-shapes";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { GlobalCommandPalette } from "@/components/overlay/global-command-palette";
import { Providers } from "@/components/Providers";
import { ScrollToTop } from "@/components/scroll-to-top";

import "./globals.css";

export const viewport: Viewport = {
	themeColor: "#1a0e12",
	// iOS 노치·홈 인디케이터 safe-area를 CSS env()로 계산하기 위해 viewport-fit=cover 확장
	viewportFit: "cover"
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "시루봇",
  description: "시루봇과 함께 심심할 틈 없는 서버를 만들어봐요!",
  openGraph: {
    description: "시루봇과 함께 심심할 틈 없는 서버를 만들어봐요!",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "시루봇",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "시루봇",
    description: "시루봇과 함께 심심할 틈 없는 서버를 만들어봐요!",
    images: ["/images/og-image.png"],
  },
  icons: {
    icon: "/images/siru-profile-hand.png",
  }
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
		<html lang="ko" className={pretendard.variable} suppressHydrationWarning>
			<body className={pretendard.className}>
				<Providers>
				<div className="min-h-svh flex flex-col relative overflow-x-clip">
					<BackgroundShapes />
					<Navbar />
						<div className="flex-1 relative z-10">
							{children}
						</div>
						<Footer />
						<ScrollToTop />
						<GlobalCommandPalette />
					</div>
				</Providers>
			</body>
		</html>
	);
}

