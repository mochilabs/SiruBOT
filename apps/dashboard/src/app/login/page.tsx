import { signIn } from "@/lib/auth";
import Link from "next/link";
import Image from "next/image";
import { LogIn } from "lucide-react";

interface LoginPageProps {
	searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
	const { callbackUrl } = await searchParams;
	const redirectTarget = callbackUrl || "/servers";

	return (
		<div className="mx-auto flex min-h-[90vh] w-full max-w-5xl items-center px-4 py-8 md:px-6">
			<section className="dashboard-surface grid w-full gap-8 p-6 md:grid-cols-[0.95fr_1.05fr] md:p-8">
				<div className="panel-glass flex items-center justify-center p-5">
					<Image
						src="/images/siru-profile.png"
						alt="SiruBOT login visual"
						width={420}
						height={420}
						className="h-auto w-full max-w-[300px] rounded-3xl object-cover"
					/>
				</div>

				<div className="flex flex-col justify-center">
					<h1 className="text-3xl font-semibold text-[color:var(--text-main)]">시루봇 대시보드 로그인</h1>
					<p className="mt-3 text-sm leading-relaxed text-[rgba(245,245,247,0.72)]">
						Discord 계정으로 로그인해 서버 설정, 샤드 상태, 랭킹 데이터를 관리할 수 있습니다.
					</p>

					<form
						className="mt-6"
						action={async () => {
							"use server";
							await signIn("discord", { redirectTo: redirectTarget });
						}}
					>
						<button
							type="submit"
							className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--discord)] px-4 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
						>
							<LogIn className="h-4 w-4" />
							Discord로 로그인
						</button>
					</form>

					<Link href="/" className="mt-4 inline-flex justify-center text-sm text-[rgba(245,245,247,0.7)] hover:text-[color:var(--text-main)]">
						대시보드 홈으로 돌아가기
					</Link>
				</div>
			</section>
		</div>
	);
}

