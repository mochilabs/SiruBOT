import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/Providers";
import { ScrollToTop } from "@/components/scroll-to-top";

import "./globals.css";

export const viewport: Viewport = {
	themeColor: "#FFDADA"
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL!),
  title: "시루봇",
  description: "시루봇과 함께 심심할 틈 없는 서버를 만들어봐요!",
  openGraph: {
    description: "시루봇과 함께 심심할 틈 없는 서버를 만들어봐요!",
    url: process.env.NEXT_PUBLIC_APP_URL!,
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
					<div className="min-h-screen flex flex-col">
						<Navbar />
						<div className="flex-1">
							{children}
						</div>
						<Footer />
						<ScrollToTop />
					</div>
				</Providers>
			</body>
		</html>
	);
}

