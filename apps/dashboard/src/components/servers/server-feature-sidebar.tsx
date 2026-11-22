"use client";

import { Fragment, useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import {
  SidebarIndicatorOverlay,
  useSidebarIndicator,
} from "@/components/primitives/sidebar-indicator";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ServerFeatureItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** group이 바뀌는 지점에는 헤더 없이 얇은 구분선만 그려요 */
  group?: string;
  /** 소속 모듈이 꺼져 있으면 흐리게 표시해요 (클릭은 유지해서 설정 확인·켜기 가능) */
  dimmed?: boolean;
}

interface ServerFeatureSidebarProps {
  items: readonly ServerFeatureItem[];
  active: string;
  onSelect: (key: string) => void;
  groupLabels?: Readonly<Record<string, string>>;
  /** 사이드바 맨 위에 붙는 영역 — 서버 선택기 */
  header?: React.ReactNode;
  /** 폴더처럼 접고 펼 수 있는 그룹 — 활성 항목이 든 그룹은 기본으로 열려요 */
  collapsibleGroups?: readonly string[];
}

/** 데스크톱 사이드바·모바일 시트가 같이 쓰는 그룹 라벨 — SectionLabel에 들여쓰기만 조정해요 */
export function ServerNavGroupLabel({
  first,
  children,
}: {
  first: boolean;
  children: React.ReactNode;
}) {
  return (
    <SectionLabel
      as="p"
      className={cn(
        "px-3.5 pb-1 text-2xs font-bold tracking-wide",
        first ? "pt-1" : "pt-3",
      )}
    >
      {children}
    </SectionLabel>
  );
}

/**
 * PC(lg+) 전용 기능 사이드바 — 플레이리스트 사이드바와 같은 "카드 + 목록" 언어를 써서
 * 대시보드 안에서 새 패턴을 만들지 않아요. 모든 메뉴를 평평하게 보여주고 그룹 경계에
 * 라벨 구분선을 그려요. 활성 항목은 spring 인디케이터로 표시해요.
 */
export function ServerFeatureSidebar({
  items,
  active,
  onSelect,
  groupLabels,
  header,
  collapsibleGroups = [],
}: ServerFeatureSidebarProps) {
  // 사용자가 직접 토글한 그룹만 기록해요 — 없으면 "활성 항목이 들어 있는가"가 기본값이에요
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const activeGroup = items.find((item) => item.key === active)?.group;
  const isOpen = (group?: string) =>
    !group ||
    !collapsibleGroups.includes(group) ||
    (toggled[group] ?? group === activeGroup);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = items.findIndex((item) => item.key === active);
  const getItemEl = useCallback((index: number) => itemRefs.current[index], []);
  const indicator = useSidebarIndicator(items, activeIndex, getItemEl);

  return (
    <nav
      className="hidden w-full lg:block lg:w-72 shrink-0 lg:sticky lg:top-20 lg:z-10"
      aria-label="서버 설정 기능"
    >
      <Card
        padding="none"
        className="flex max-h-[calc(100svh-6.5rem)] flex-col overflow-hidden"
      >
        {header && (
          <div className="shrink-0 border-b border-border-subtle p-2">
            {header}
          </div>
        )}
        <div className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <SidebarIndicatorOverlay indicator={indicator} />

          {items.map((item, idx) => {
            const startsGroup = item.group !== items[idx - 1]?.group;
            const groupTitle =
              startsGroup && item.group ? groupLabels?.[item.group] : undefined;
            const isActive = item.key === active;
            return (
              <Fragment key={item.key}>
                {groupTitle &&
                item.group &&
                collapsibleGroups.includes(item.group) ? (
                  <button
                    type="button"
                    aria-expanded={isOpen(item.group)}
                    onClick={() =>
                      setToggled((prev) => ({
                        ...prev,
                        [item.group!]: !isOpen(item.group),
                      }))
                    }
                    className="relative z-10 mt-2 flex w-full items-center justify-between rounded-menu px-3.5 py-1.5 text-left text-2xs font-bold tracking-wide text-muted-foreground transition-colors duration-fast hover:bg-accent/15 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>{groupTitle}</span>
                    <ChevronDown
                      size={14}
                      aria-hidden
                      className={cn(
                        "transition-transform duration-fast",
                        !isOpen(item.group) && "-rotate-90",
                      )}
                    />
                  </button>
                ) : groupTitle ? (
                  <ServerNavGroupLabel first={idx === 0}>
                    {groupTitle}
                  </ServerNavGroupLabel>
                ) : (
                  startsGroup &&
                  idx !== 0 && (
                    <div
                      role="separator"
                      className="mx-3 my-1 h-px bg-border"
                    />
                  )
                )}
                {isOpen(item.group) && (
                  <button
                    type="button"
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    onClick={() => onSelect(item.key)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "relative z-10 flex w-full items-center gap-3 rounded-menu border-0 px-3.5 py-2 text-left text-sm transition-colors duration-fast focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "font-extrabold text-primary-text"
                        : "font-medium text-foreground/70 hover:bg-accent/15 hover:text-foreground",
                      item.dimmed && !isActive && "opacity-55 hover:opacity-80",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "shrink-0 transition-colors duration-fast",
                        isActive
                          ? "text-primary-text"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                    {item.dimmed && (
                      <span className="shrink-0 text-2xs font-semibold text-muted-foreground">
                        꺼짐
                      </span>
                    )}
                  </button>
                )}
              </Fragment>
            );
          })}
        </div>
      </Card>
    </nav>
  );
}
