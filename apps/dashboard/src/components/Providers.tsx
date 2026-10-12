"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { domAnimation, LazyMotion, MotionConfig } from "framer-motion";
import { SWRConfig } from "swr";

import { Toaster } from "@/components/ui/toast";
import { fetcher } from "@/lib/fetcher";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000, errorRetryCount: 3 }}>
			<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
				<LazyMotion features={domAnimation}>
					<MotionConfig reducedMotion="user">
						<SessionProvider>{children}</SessionProvider>
						{/* 토스트는 앱에 단 하나 — 페이지별 Provider는 금지 (두 번 렌더·매니저 분열 방지) */}
						<Toaster />
					</MotionConfig>
				</LazyMotion>
			</ThemeProvider>
		</SWRConfig>
	);
}
