"use client";

import { useCallback, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notifyApiError } from "@/lib/notify";
import type { GreetingTestResult } from "@/types/member-greeting";


interface GreetingTestPanelProps {
  /** 저장된 설정이 활성화 + 채널 지정이어야 테스트 전송이 가능해요 */
  ready: boolean;
  pending: boolean;
  result: GreetingTestResult | null;
  onTest: () => Promise<void>;
}

/** 테스트 전송 — 봇이 읽을 "저장된 설정"으로 본인 멤버 카드를 그려 메시지 채널에 보내요 */
export function GreetingTestPanel({
  ready,
  pending,
  result,
  onTest,
}: GreetingTestPanelProps) {
  const [sendingTest, setSendingTest] = useState(false);

  const handleTest = useCallback(async () => {
    setSendingTest(true);
    try {
      await onTest();
    } catch (err) {
      notifyApiError(err, "테스트 전송을 요청하지 못했어요.");
    } finally {
      setSendingTest(false);
    }
  }, [onTest]);

  return (
    <div className="space-y-2 rounded-card bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Send size={14} />}
          loading={sendingTest || pending}
          disabled={!ready}
          onClick={() => void handleTest()}
          className="pointer-coarse:h-11"
        >
          테스트 전송
        </Button>
        {pending && (
          <p className="text-xs text-muted-foreground">
            테스트 전송 결과를 기다리는 중…
          </p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {ready
          ? "저장된 설정대로 본인 멤버 카드를 그려 메시지 채널에 보내요."
          : "테스트 전송은 저장된 설정으로 진행돼요. 저장한 뒤 활성화와 채널이 준비되면 보낼 수 있어요."}
      </p>
      {!pending &&
        result &&
        (result.ok ? (
          <p className="text-xs text-success">
            테스트 메시지를 전송했어요. Discord 채널을 확인해 주세요.
          </p>
        ) : (
          <p role="alert" className="text-xs text-destructive">
            {result.timedOut
              ? "테스트 전송 결과를 확인하지 못했어요. Discord 채널을 직접 확인해 주세요."
              : (result.error ?? "테스트 전송에 실패했어요.")}
          </p>
        ))}
    </div>
  );
}
