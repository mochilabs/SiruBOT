import Link from "next/link";
import {
  ChevronRight,
  Home,
  Settings2
} from "lucide-react";

import { FocusPageShell } from "@/app/_components/focus-page-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function InviteRedirectPage() {
  return (
    <FocusPageShell>
      <div className="space-y-4">
        <h1 className="break-keep text-5xl font-black tracking-tighter text-foreground md:text-6xl">초대해줘서 고마워요!</h1>
        <p className="max-w-xl break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
          이제 다 됐어요!
          <br />
          나에게 딱 맞는 설정으로 대시보드를 꾸며볼까요?
        </p>
      </div>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Link href="/servers" className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-3 px-8 text-base font-bold")}>
          <Settings2 className="h-5 w-5" />
          설정하러 가기
          <ChevronRight className="h-4 w-4 opacity-70" />
        </Link>
        <Link
          href="/"
          className="group flex items-center gap-2 rounded-control px-2 text-base font-semibold text-muted-foreground transition-colors hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Home className="h-5 w-5" />
          홈으로 가기
        </Link>
      </div>
    </FocusPageShell>
  );
}
