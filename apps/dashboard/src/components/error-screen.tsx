"use client";

import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";

import { ErrorRoom } from "@/components/error-room";
import { StatusScreen, statusSecondaryActionClass } from "@/components/status-screen";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface ErrorScreenProps {
	title: string;
	message: string;
	onRetry: () => void;
}

/** 라우트 단위 오류 화면 */
export function ErrorScreen({ title, message, onRetry }: ErrorScreenProps) {
	return (
		<StatusScreen
			title={title}
			description={message}
			illustration={<ErrorRoom className="block h-auto w-full" />}
			actions={
				<>
					<button type="button" onClick={onRetry} className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2.5 px-8 text-base font-bold")}>
						<RefreshCw className="h-5 w-5" aria-hidden />
						다시 시도하기
					</button>
					<Link href="/" className={statusSecondaryActionClass}>
						<Home className="h-4 w-4" aria-hidden />
						홈으로 가기
					</Link>
				</>
			}
		/>
	);
}
