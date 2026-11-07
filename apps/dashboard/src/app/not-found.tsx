"use client";

import Link from "next/link";
import { ChevronLeft, Home } from "lucide-react";

import { NotFoundRoom } from "@/components/not-found-room";
import { StatusScreen, statusSecondaryActionClass } from "@/components/status-screen";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <StatusScreen
      title="앗, 없는 주소예요"
      description="찾는 페이지가 여기에 없어요. 홈으로 돌아가거나 이전 페이지로 이동해보세요."
      illustration={<NotFoundRoom className="w-full" />}
      actions={
        <>
          <Link href="/" className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2.5 px-8 text-base font-bold")}>
            <Home className="h-5 w-5" aria-hidden />
            홈으로 가기
          </Link>
          <button type="button" onClick={() => window.history.back()} className={statusSecondaryActionClass}>
            <ChevronLeft className="h-4 w-4 transition-transform duration-fast group-hover:-translate-x-0.5" aria-hidden />
            이전으로 가기
          </button>
        </>
      }
    />
  );
}
