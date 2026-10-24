import Link from "next/link";
import {
  CheckCircle2,
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
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="space-y-12">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-surface-1 p-6">
                <CheckCircle2 className="h-16 w-16 text-success" />
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl font-black tracking-tighter text-foreground md:text-7xl break-keep">
                초대해줘서 고마워요!
              </h1>
              <p className="text-lg font-medium leading-relaxed text-muted-foreground md:text-xl max-w-xl break-keep">
                이제 다 됐어요!
                <br />
                나에게 딱 맞는 설정으로 대시보드를 꾸며볼까요?
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
            <Link
              href="/servers"
              className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-3 px-8 text-base font-bold")}
            >
              <Settings2 className="h-5 w-5" />
              설정하러 가기
              <ChevronRight className="h-4 w-4 opacity-70" />
            </Link>

            <Link
              href="/"
              className="group flex items-center gap-2 rounded-control px-2 text-lg font-semibold text-muted-foreground transition-colors hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Home className="h-5 w-5" />
              홈으로 가기
            </Link>
          </div>
        </div>
      </div>
    </FocusPageShell>
  );
}
