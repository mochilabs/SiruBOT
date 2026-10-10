"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Loader2, LogIn, RefreshCw, Save } from "lucide-react";

import { Button, buttonVariants } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import type { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

export function PanelHeader({
	icon,
	title,
	description,
	action,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	action?: ReactNode;
}) {
	return (
		<header className="flex items-start justify-between gap-4">
			<div className="flex items-start gap-3">
				<span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-text">{icon}</span>
				<div>
					<h2 className="text-lg font-bold text-foreground">{title}</h2>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
			</div>
			{action}
		</header>
	);
}

/** 토큰 기반 안내 박스 */
export function InfoBox({ children }: { children: ReactNode }) {
	return <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-1">{children}</div>;
}

/** 경고 박스 (상태 색상 관례: amber) */
export function WarningBox({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-xs text-warning">{children}</div>
	);
}

export function PanelLoading({ label }: { label: string }) {
	return (
		<Card padding="lg" className="flex items-center gap-3 text-muted-foreground text-sm" role="status">
			<Loader2 className="h-4 w-4 animate-spin" />
			{label}
		</Card>
	);
}

export function PanelError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
	const pathname = usePathname();

	return (
		<Card padding="lg" className="gap-3">
			<p className="flex items-center gap-2 text-sm text-destructive">
				<AlertCircle size={16} aria-hidden />
				{error.message}
			</p>
			{error.status === 401 ? (
				// 세션 만료 — 재시도 대신 로그인 페이지로 안내해요
				<Link
					href={`/api/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
					className={cn(buttonVariants({ variant: "primary", size: "sm" }), "w-fit")}
				>
					<LogIn size={14} aria-hidden />
					다시 로그인
				</Link>
			) : (
				error.retryable && (
					<Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
						다시 시도
					</Button>
				)
			)}
		</Card>
	);
}

export function SaveBar({
	dirty,
	saving,
	onSave,
	children,
}: {
	dirty: boolean;
	saving: boolean;
	onSave: () => void;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center gap-3 pt-1">
			<Button variant="primary" loading={saving} disabled={!dirty} icon={saving ? undefined : <Save size={16} />} onClick={onSave}>
				{saving ? "저장 중…" : "저장"}
			</Button>
			{children}
		</div>
	);
}
