import Link from "next/link";
import { ChevronRight, Home, Settings2 } from "lucide-react";

import { StatusScreen, statusSecondaryActionClass } from "@/components/status-screen";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function InviteRedirectPage() {
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
          <Link href="/servers" className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2.5 px-8 text-base font-bold")}>
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
