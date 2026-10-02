"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Save, Trash2 } from "lucide-react";

import { ToastProvider, useToast } from "@/components/feedback/toast";

/* ─────────────────────────── types ─────────────────────────── */

interface AiPolicy {
  enabled: boolean;
  model: string | null;
  systemPrompt: string | null;
  disabledChannelIds: string[];
  historyCount: number;
}

/* ─────────────────────────── styles ─────────────────────────── */

const inputClass =
  "w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground";

const primaryButtonClass =
  "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all";

const ghostButtonClass =
  "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium hover:bg-muted/40 disabled:opacity-50 transition-all text-foreground";

/* ─────────────────────────── helpers ─────────────────────────── */

/** API 오류 — 서버의 한국어 메시지를 그대로 보여주고 401/403(재시도 불가)을 구분해요 */
class ApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

async function toApiError(res: Response, fallback: string): Promise<ApiError> {
  let message = fallback;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error;
  } catch {
    // JSON 본문이 없으면 기본 메시지 유지
  }
  return new ApiError(message, res.status !== 401 && res.status !== 403);
}

/* ─────────────────────────── panel ─────────────────────────── */

function AiSettingsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [policy, setPolicy] = useState<AiPolicy | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const confirmTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  // 토스트 컨텍스트 값은 토스트가 열릴 때마다 새로 만들어져요 — effect 재실행을 막기 위해 ref로 씁니다.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const applyPolicy = useCallback((next: AiPolicy) => {
    setPolicy(next);
    setEnabled(next.enabled);
    setModel(next.model ?? "");
    setSystemPrompt(next.systemPrompt ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(`/api/servers/${guildId}/ai`, { cache: "no-store" });
        if (!res.ok) throw await toApiError(res, "AI 설정을 불러오지 못했어요.");
        const data: AiPolicy = await res.json();
        if (!cancelled) applyPolicy(data);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof ApiError ? error : new ApiError("AI 설정을 불러오지 못했어요.", true));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, applyPolicy, retryToken]);

  const reportError = (error: unknown, fallback: string) => {
    const apiError = error instanceof ApiError ? error : new ApiError(fallback, true);
    toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
  };

  const dirty =
    policy !== null &&
    (enabled !== policy.enabled ||
      model.trim() !== (policy.model ?? "") ||
      systemPrompt.trim() !== (policy.systemPrompt ?? ""));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          model: model.trim() || null,
          systemPrompt: systemPrompt.trim() || null,
        }),
      });
      if (!res.ok) throw await toApiError(res, "저장에 실패했어요.");
      applyPolicy((await res.json()) as AiPolicy);
      toast.success("AI 설정을 저장했어요.", "봇이 곧 새 설정을 적용해요.");
    } catch (error) {
      reportError(error, "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHistory = async () => {
    if (!confirmDelete) {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
      setConfirmDelete(true);
      confirmTimerRef.current = window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setConfirmDelete(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/ai/history`, { method: "DELETE" });
      if (!res.ok) throw await toApiError(res, "기록 삭제에 실패했어요.");
      setPolicy((prev) => (prev ? { ...prev, historyCount: 0 } : prev));
      toast.success("이 서버의 AI 대화 기록을 삭제했어요.");
    } catch (error) {
      reportError(error, "기록 삭제에 실패했어요.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-border/60 bg-muted/10 p-6 flex items-center gap-3 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        AI 설정 불러오는 중…
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-2xl border border-border/60 bg-muted/10 p-6 space-y-3">
        <p className="text-sm text-muted-foreground">❌ {loadError.message}</p>
        {loadError.retryable && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRetryToken((token) => token + 1);
            }}
            className={ghostButtonClass}
          >
            <Loader2 className="h-4 w-4" />
            다시 시도
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-muted/10 p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-foreground">AI 채팅 설정</h2>
            <p className="text-sm text-muted-foreground/80">
              서버 단위 AI 채팅 on/off와 모델·지침을 관리해요.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="서버 AI 채팅 사용 여부"
          disabled={saving}
          onClick={() => setEnabled((v) => !v)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-all disabled:opacity-60 ${enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`}
          />
        </button>
      </header>

      <div className="space-y-2">
        <label htmlFor="ai-model" className="text-sm font-semibold text-foreground">
          모델
        </label>
        <input
          id="ai-model"
          type="text"
          value={model}
          maxLength={100}
          disabled={saving}
          onChange={(e) => setModel(e.target.value)}
          placeholder="비워두면 env 기본값을 사용해요"
          className={inputClass}
        />
        <p className="text-xs text-muted-foreground/70">
          예: gpt-4o-mini · vision 모델을 써야 이미지 분석이 가능해요.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="ai-prompt" className="text-sm font-semibold text-foreground">
          서버 추가 지침
        </label>
        <textarea
          id="ai-prompt"
          value={systemPrompt}
          maxLength={1000}
          disabled={saving}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="이 서버에서만 적용할 추가 지침을 적어요 (최대 1000자)"
          className={`${inputClass} min-h-[96px] resize-none`}
        />
        <p className="text-xs text-muted-foreground/70">
          시루의 기본 페르소나에 덧붙여져요. 비워두면 제거돼요.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground/80 space-y-1">
        <p>
          채널별 on/off와 빠른 조회는 디스코드에서 <span className="font-semibold text-foreground">/채팅설정</span>으로
          해요.
        </p>
        <p>
          저장된 대화 기록: <span className="font-semibold text-foreground">{policy?.historyCount ?? 0}</span>개 채널
          {policy && policy.disabledChannelIds.length > 0 && (
            <> · 꺼둔 채널 {policy.disabledChannelIds.length}개</>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="button" onClick={handleSave} disabled={saving || !dirty} className={primaryButtonClass}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={handleDeleteHistory}
          disabled={deleting || (policy?.historyCount ?? 0) === 0}
          className={`${ghostButtonClass} ${confirmDelete ? "border-rose-500/50 text-rose-500" : ""}`}
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {confirmDelete ? "정말 삭제할까요?" : "대화 기록 전체 삭제"}
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────── export ─────────────────────────── */

export function AiSettings({ guildId }: { guildId: string }) {
  return (
    <ToastProvider>
      <AiSettingsPanel guildId={guildId} />
    </ToastProvider>
  );
}
