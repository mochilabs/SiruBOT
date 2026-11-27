import { Fragment } from "react";

import Container from "@/components/container";
import { SERVER_TAB_GROUPS, SERVER_TABS } from "@/components/servers/server-tabs";
import { PanelLoading } from "@/components/servers/settings-shared";
import { Card } from "@/components/ui/card";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function ServerDashboardLoading() {
  return (
    <Container>
      <section aria-busy="true" aria-label="서버 대시보드">
        
        <span role="status" className="sr-only">
          대시보드를 불러오는 중…
        </span>

        <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-8">
          <Card aria-hidden padding="none" className="hidden w-full shrink-0 lg:block lg:w-72">
            <div className="flex min-h-12 items-center gap-3 border-b border-border-subtle p-2 px-3">
              <Skeleton className="size-8 shrink-0 rounded-control" />
              <Skeleton.Line width="8rem" height="h-5" />
            </div>
            <div className="flex flex-col gap-0.5 p-2">
              {SERVER_TABS.map((item, idx) => (
                <Fragment key={item.key}>
                  {item.group !== SERVER_TABS[idx - 1]?.group && SERVER_TAB_GROUPS[item.group] && (
                    <div className={cn("px-3.5 pb-1", idx === 0 ? "pt-1" : "pt-3")}>
                      <Skeleton.Line width="2.5rem" height="h-4" />
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <SkeletonCircle size="h-3.5 w-3.5" />
                    <Skeleton.Line width={`${Math.max(2.5, item.label.length * 0.75)}rem`} height="h-4" />
                  </div>
                </Fragment>
              ))}
            </div>
          </Card>

          <div className="w-full min-w-0 flex-1">
            <div aria-hidden className="mb-3 flex gap-2 lg:hidden">
              <Skeleton className="min-h-11 flex-1 rounded-menu" />
              <Skeleton className="min-h-11 w-28 rounded-menu" />
            </div>

            <PanelLoading label="" decorative />
          </div>
        </div>
      </section>
    </Container>
  );
}