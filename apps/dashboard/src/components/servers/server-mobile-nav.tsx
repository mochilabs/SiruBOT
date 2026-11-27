"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { useFeatureSwitcher } from "./feature-switcher";
import {
  type ServerFeatureItem,
  ServerNavGroupLabel,
} from "./server-feature-sidebar";

interface ServerMobileNavProps {
  items: readonly ServerFeatureItem[];
  active: string;
  onSelect: (key: string) => void;
  groupLabels: Readonly<Record<string, string>>;
  trailing?: React.ReactNode;
}

export function ServerMobileNav({
  items,
  active,
  onSelect,
  groupLabels,
  trailing,
}: ServerMobileNavProps) {
  const switcher = useFeatureSwitcher();
  const [localOpen, setLocalOpen] = useState(false);
  const open = switcher ? switcher.open : localOpen;
  const setOpen = switcher ? switcher.setOpen : setLocalOpen;
  const showTrigger = !switcher?.headerPresent;
  const current = items.find((item) => item.key === active) ?? items[0];

  return (
    <div className={"mb-3 flex items-center gap-2 lg:hidden"}>
      <Sheet open={open} onOpenChange={setOpen}>
        {showTrigger && (
          <SheetTrigger
            render={
              <button
                type="button"
                aria-label={`기능 선택, 현재 ${current.label}`}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-menu bg-card px-3.5 text-left text-sm font-bold text-foreground shadow-sm transition-colors duration-fast hover:bg-accent/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="shrink-0 text-primary-text">
                  {current.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{current.label}</span>
                {current.group && (
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {groupLabels[current.group]}
                  </span>
                )}
                <ChevronsUpDown
                  size={14}
                  aria-hidden
                  className="shrink-0 text-muted-foreground"
                />
              </button>
            }
          />
        )}
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-hidden rounded-t-dialog pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="px-4 pt-5">
            <SheetTitle>설정 기능</SheetTitle>
            <SheetDescription>바꾸고 싶은 기능을 골라요.</SheetDescription>
          </SheetHeader>
          <nav
            aria-label="서버 설정 기능"
            className="max-h-[65dvh] overflow-y-auto px-2 pb-3"
          >
            {items.map((item, idx) => {
              const isActive = item.key === active;
              const groupTitle =
                item.group && item.group !== items[idx - 1]?.group
                  ? groupLabels[item.group]
                  : undefined;
              return (
                <div key={item.key}>
                  {groupTitle && (
                    <ServerNavGroupLabel first={idx === 0}>
                      {groupTitle}
                    </ServerNavGroupLabel>
                  )}
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => {
                      setOpen(false);
                      onSelect(item.key);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-menu px-3.5 text-left text-sm transition-colors duration-fast focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-primary-control/15 font-extrabold text-primary-text"
                        : "font-medium text-foreground/80 hover:bg-accent/15",
                      item.dimmed && !isActive && "opacity-55",
                    )}
                  >
                    <span aria-hidden className="shrink-0">
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.dimmed && (
                      <span className="shrink-0 text-2xs font-semibold text-muted-foreground">
                        꺼짐
                      </span>
                    )}
                    {isActive && (
                      <Check size={14} aria-hidden className="shrink-0" />
                    )}
                  </button>
                </div>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
      {showTrigger ? (
        trailing
      ) : (
        <div className="min-w-0 flex-1 [&>div]:w-full [&>div]:max-w-full">{trailing}</div>
      )}
    </div>
  );
}
