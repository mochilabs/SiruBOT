import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Settings2 } from "lucide-react";

export default function InviteRedirectPage() {
	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10">
			<section className="dashboard-surface grid items-center gap-8 p-6 md:grid-cols-[0.9fr_1.1fr] md:p-8">
				<div className="panel-glass flex justify-center p-5">
					<Image
						src="/images/siru-fullbody-sketch.png"
						alt="시루봇 설정 안내"
						width={420}
						height={420}
						className="h-auto w-full max-w-[300px] rounded-3xl object-cover"
					/>
				</div>

				<div>
					<p className="inline-flex items-center gap-2 rounded-full border border-[rgba(252,214,229,0.2)] bg-[rgba(252,214,229,0.12)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--primary)]">
						<CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--secondary)]" />
						Invite Complete
					</p>
					<h1 className="mt-3 text-2xl font-semibold text-[color:var(--text-main)] md:text-3xl">시루봇 초대 감사합니다</h1>
					<p className="mt-3 text-sm leading-relaxed text-[rgba(245,245,247,0.72)] md:text-base">
						시루봇 초대가 끝났다면 이제 서버 설정을 시작해볼까요? 권한, 채널, 기본 재생 옵션을 대시보드에서 빠르게 맞출 수 있습니다.
					</p>
					<div className="mt-6 flex flex-wrap gap-3">
						<Link
							href="/servers"
							className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--discord)] px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.03]"
						>
							<Settings2 className="h-4 w-4" />
							서버 설정하러 가기
						</Link>
						<Link href="/" className="btn-soft inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-medium">
							대시보드로 이동
						</Link>
					</div>
				</div>
			</section>
		</div>
	);
}

