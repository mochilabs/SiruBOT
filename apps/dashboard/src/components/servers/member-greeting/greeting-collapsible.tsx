"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

interface GreetingCollapsibleProps {
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function GreetingCollapsible({ title, summary, open, onOpenChange, children }: GreetingCollapsibleProps) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-control px-3 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex min-w-0 items-baseline gap-2">
          <span>{title}</span>
          {summary ? <span className="truncate font-normal text-foreground">{summary}</span> : null}
        </span>
        <ChevronDown size={14} aria-hidden className={cn("shrink-0 transition-transform duration-fast", open && "rotate-180")} />
      </Collapsible.Trigger>
      <Collapsible.Panel className="space-y-3 pt-2">{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}
