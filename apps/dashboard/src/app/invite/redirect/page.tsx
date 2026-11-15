import Link from "next/link";
import { ChevronRight, Home, RotateCcw, Settings2 } from "lucide-react";

import { StatusScreen, statusSecondaryActionClass } from "@/components/status-screen";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

interface InviteRedirectPageProps {
  searchParams: Promise<{ error?: string; guild_id?: string }>;
}

export default async function InviteRedirectPage({ searchParams }: InviteRedirectPageProps) {
  const { error, guild_id: guildId } = await searchParams;

  if (error) {
    return (
      <StatusScreen
        title="초대가 취소되었어요"
        description={
          error === "access_denied"
            ? "Discord 서버 권한 승인이 취소되어 봇을 초대하지 못했어요."
            : "Discord 연동 중 문제가 발생해 봇을 초대하지 못했어요. 다시 시도해 주세요."
        }
        actions={
          <>
            <Link href="/invite" className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2.5 px-8 text-base font-bold")}>
              <RotateCcw className="h-5 w-5" />
              다시 초대하기
            </Link>
            <Link href="/" className={statusSecondaryActionClass}>
              <Home className="h-4 w-4" />
              홈으로 가기
            </Link>
          </>
        }
      />
    );
  }

  const validGuildId = guildId && /^\d{17,20}$/.test(guildId) ? guildId : null;
  const targetHref = validGuildId ? `/servers/${validGuildId}` : "/servers";

  return (
    <StatusScreen
      title="초대해줘서 고마워요!"
      description={
        <>
          이제 다 됐어요!
          <br />
          나에게 딱 맞는 설정으로 대시보드를 꾸며볼까요?
        </>
      }
      actions={
        <>
          <Link href={targetHref} className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2.5 px-8 text-base font-bold")}>
            <Settings2 className="h-5 w-5" />
            설정하러 가기
            <ChevronRight className="h-4 w-4 opacity-70" />
          </Link>
          <Link href="/" className={statusSecondaryActionClass}>
            <Home className="h-4 w-4" />
            홈으로 가기
          </Link>
        </>
      }
    />
  );
}
