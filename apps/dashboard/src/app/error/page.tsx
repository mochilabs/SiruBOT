import Link from "next/link";
import { ChevronLeft, RefreshCw } from "lucide-react";

import { ErrorRoom } from "@/components/error-room";
import { StatusScreen, statusSecondaryActionClass } from "@/components/status-screen";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface ErrorPageProps {
	searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
	AccessDenied: {
		title: "들어갈 수 없어요",
		description: "접근이 거부됐어요. 로그인한 계정이 이 기능을 쓸 수 있는지 확인해 주세요.",
	},
	Configuration: {
		title: "로그인 중 문제가 발생했어요",
		description: "Discord 로그인을 마치지 못했어요. 잠시 후 다시 시도해 주세요. 계속되면 운영자에게 알려 주세요.",
	},
	Verification: {
		title: "로그인을 완료하지 못했어요",
		description: "인증 링크가 만료되거나 이미 사용됐어요. 다시 로그인해 주세요.",
	},
	default: {
		title: "로그인 중 문제가 발생했어요",
		description: "Discord 로그인이 예상대로 완료되지 않았어요. 잠시 후 다시 시도해 주세요.",
	},
};

export default async function ErrorPage({ searchParams }: ErrorPageProps) {
	const { error } = await searchParams;
	const content = ERROR_MESSAGES[error ?? "default"] ?? ERROR_MESSAGES.default;

	return (
		<StatusScreen
			title={content.title}
			description={content.description}
			meta={error && <p className="pt-1 font-mono text-2xs text-muted-foreground">코드: {error}</p>}
			illustration={<ErrorRoom className="block h-auto w-full" />}
			actions={
				<>
					<Link href="/login" className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2.5 px-8 text-base font-bold")}>
						<RefreshCw className="h-5 w-5" aria-hidden />
						다시 로그인하기
					</Link>
					<Link href="/" className={statusSecondaryActionClass}>
						<ChevronLeft className="h-4 w-4" aria-hidden />
						홈으로 가기
					</Link>
				</>
			}
		/>
	);
}
