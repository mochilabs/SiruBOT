import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { GlobalCommandPalette } from "@/components/overlay/global-command-palette";
import { Providers } from "@/components/Providers";
import { ScrollToTop } from "@/components/scroll-to-top";
import { OG_IMAGES, SITE_DESCRIPTION, SITE_TITLE, socialMetadata } from "@/lib/site-metadata";

import "./globals.css";

export const viewport: Viewport = {
	themeColor: "#2b2023",
	viewportFit: "cover"
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: SITE_TITLE,
    template: "%s | 시루봇",
  },
  description: SITE_DESCRIPTION,
  applicationName: "시루봇",
  keywords: ["시루봇", "디스코드 음악봇", "Discord 음악 봇", "디스코드 봇", "AI 채팅", "서버 관리"],
  ...socialMetadata({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    path: "/",
    image: OG_IMAGES.home,
  }),
  robots: {
    index: true,
    follow: true,
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

// woff2 5.3MB; next/font가 unicode-range를 지원하지 않아 preload 비활성화
const pretendardJP = localFont({
	src: "../../public/PretendardJPVariable.woff2",
	display: "swap",
	weight: "45 920",
	variable: "--font-pretendard-jp",
	preload: false,
});

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko" data-scroll-behavior="smooth" className={`${pretendard.variable} ${pretendardJP.variable}`} suppressHydrationWarning>
			<body>
				<Providers>
				<div className="min-h-svh flex flex-col relative overflow-x-clip">
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

