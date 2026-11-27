"use client";

import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";

import { ErrorRoom } from "@/components/error-room";
import { StatusScreen, statusSecondaryActionClass } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

interface ErrorScreenProps {
	title: string;
	message: string;
	onRetry: () => void;
}

export function ErrorScreen({ title, message, onRetry }: ErrorScreenProps) {
	return (
		<StatusScreen
			title={title}
			description={message}
			illustration={<ErrorRoom className="block h-auto w-full" />}
			actions={
				<>
					<Button variant="cta" onClick={onRetry} className="h-11 gap-2.5 px-8 text-base font-bold">
						<RefreshCw className="h-5 w-5" aria-hidden />
						다시 시도하기
					</Button>
					<Link href="/" className={statusSecondaryActionClass}>
						<Home className="h-4 w-4" aria-hidden />
						홈으로 가기
					</Link>
				</>
			}
		/>
	);
}
