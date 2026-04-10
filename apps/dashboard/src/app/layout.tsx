import "./globals.css";

import type { Metadata } from "next";
import localFont from "next/font/local";

import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = {
	title: "시루봇",
	description: "시루봇과 함께 심심할 틈 없는 서버를 만들어보세요.",
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
							<PageTransition>{children}</PageTransition>
						</div>
						<Footer />
					</div>
				</Providers>
			</body>
		</html>
	);
}

