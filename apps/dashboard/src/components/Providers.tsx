"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "framer-motion";
import { SWRConfig } from "swr";

import { fetcher } from "@/lib/fetcher";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000 }}>
			<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
				<MotionConfig reducedMotion="user">
					<SessionProvider>{children}</SessionProvider>
				</MotionConfig>
			</ThemeProvider>
		</SWRConfig>
	);
}
