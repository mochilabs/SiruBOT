"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Loader2, LogIn, Save, X } from "lucide-react";

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

/** 닫은 일시 장애 안내 기록 키 — 같은 페이지(같은 길드)·같은 상태 코드 단위로 세션 동안 유지돼요 */
function noticeStorageKey(pathname: string, code: number): string {
	return `siru:error-note:${pathname}:${code}`;
}

function readNoticeDismissed(key: string): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.sessionStorage.getItem(key) === "1";
	} catch {
		return false;
	}
}

function writeNoticeDismissed(key: string): void {
	if (typeof window === "undefined") return;
	try {
		window.sessionStorage.setItem(key, "1");
	} catch {
		// 스토리지 차단 시 닫기가 세션에만 유지되지 않아요 — 기본 동작으로 계속해요
	}
}

export function PanelError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
	const pathname = usePathname();
	const [dismissed, setDismissed] = useState(false);
	const storageKey = noticeStorageKey(pathname, error.status ?? 0);

	useEffect(() => {
		setDismissed(readNoticeDismissed(storageKey));
	}, [storageKey]);

	if (error.status === 401) {
		// 세션 만료 — 재시도 대신 로그인 페이지로 안내해요
		return (
			<Card padding="lg" className="gap-3">
				<p className="flex items-center gap-2 text-sm text-destructive">
					<AlertCircle size={16} aria-hidden />
					{error.message}
				</p>
				<Link
					href={`/api/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
					className={cn(buttonVariants({ variant: "primary", size: "sm" }), "w-fit")}
				>
					<LogIn size={14} aria-hidden />
					다시 로그인
				</Link>
			</Card>
		);
	}

	const handleDismiss = () => {
		writeNoticeDismissed(storageKey);
		setDismissed(true);
	};

	if (error.retryable) {
		if (dismissed) {
			// 닫은 뒤에도 상태는 조용하게 남겨요 — 원인과 다음 행동을 숨기지 않아요
			return (
				<p className="text-xs text-muted-foreground">
					{error.message}{" "}
					<button type="button" className="font-semibold underline underline-offset-2" onClick={onRetry}>
						다시 시도
					</button>
				</p>
			);
		}

		// Discord 일시 장애 등 재시도 가능한 오류 — 화면을 가리는 배너 대신 닫을 수 있는 인라인 안내
		return (
			<div role="status" className="flex items-start gap-3 rounded-control border border-warning/30 bg-warning/5 px-4 py-3">
				<div className="min-w-0 flex-1 space-y-1 text-xs text-warning">
					<p className="flex items-center gap-1.5">
						<AlertCircle size={14} aria-hidden className="shrink-0" />
						{error.message}
					</p>
					<button type="button" className="font-semibold underline underline-offset-2" onClick={onRetry}>
						다시 시도
					</button>
				</div>
				<Button variant="ghost" size="sm" icon={<X size={14} aria-hidden />} onClick={handleDismiss} aria-label="오류 안내 닫기" />
			</div>
		);
	}

	// 권한 없음(403) 등 재시도로 해결되지 않는 안내 — 명확한 카드로 유지해요
	return (
		<Card padding="lg" className="gap-3">
			<p className="flex items-center gap-2 text-sm text-destructive">
				<AlertCircle size={16} aria-hidden />
				{error.message}
			</p>
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
