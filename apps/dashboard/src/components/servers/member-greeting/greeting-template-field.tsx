"use client";

import { useCallback, useRef } from "react";
import {
  DEFAULT_GREETINGS,
  GREETING_TEMPLATE_VARIABLES,
  type GreetingKind,
} from "@sirubot/utils/memberGreeting";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";


const TEMPLATE_MAX = 500;

/** 실제 전송 시 채워지는 값의 예시를 보여줘요 (jtc 템플릿 미리보기와 같은 방식) */
function sampleTemplate(template: string): string {
  return template
    .replaceAll("{유저}", "@철수")
    .replaceAll("{유저이름}", "철수")
    .replaceAll("{서버}", "이 서버")
    .replaceAll("{멤버수}", "123");
}

interface GreetingTemplateFieldProps {
  kind: GreetingKind;
  /** 편집 중인 템플릿 (저장 전) */
  value: string;
  disabled: boolean;
  onChange: (template: string) => void;
}

/** 메시지 템플릿 — 변수 삽입 버튼은 커서 위치에 끼워 넣고, 아래에 실제 값 예시를 보여줘요 */
export function GreetingTemplateField({
  kind,
  value,
  disabled,
  onChange,
}: GreetingTemplateFieldProps) {
  const templateRef = useRef<HTMLTextAreaElement>(null);

  const insertTemplateToken = useCallback(
    (token: string) => {
      const element = templateRef.current;
      const start = element?.selectionStart ?? value.length;
      const end = element?.selectionEnd ?? start;
      const next = value.slice(0, start) + token + value.slice(end);
      onChange(next.slice(0, TEMPLATE_MAX));
      requestAnimationFrame(() => {
        if (!element) return;
        element.focus();
        const cursor = Math.min(start + token.length, TEMPLATE_MAX);
        element.setSelectionRange(cursor, cursor);
      });
    },
    [value, onChange],
  );

  return (
    <Field
      label="메시지 템플릿"
      description="멤버 이름·서버 정보는 변수로 넣어요. 실제 값은 전송 시 채워져요."
    >
      <Textarea
        ref={templateRef}
        value={value}
        maxLength={TEMPLATE_MAX}
        rows={3}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={DEFAULT_GREETINGS[kind].template}
      />
      <div
        className="flex flex-wrap items-center gap-1.5 pt-1"
        role="group"
        aria-label="템플릿 변수 삽입"
      >
        {GREETING_TEMPLATE_VARIABLES.map((variable) => (
          <Button
            key={variable.token}
            variant="secondary"
            size="sm"
            disabled={disabled}
            title={variable.description}
            onClick={() => insertTemplateToken(variable.token)}
            className="pointer-coarse:h-11"
          >
            {variable.token}
            {!variable.usableInImage && (
              <span className="text-2xs text-muted-foreground">
                봇 메시지 전용
              </span>
            )}
          </Button>
        ))}
      </div>
      <p className="text-2xs text-muted-foreground">
        {value.length}/{TEMPLATE_MAX} · 예시:{" "}
        <span className="text-foreground font-semibold">
          {sampleTemplate(value.trim() || DEFAULT_GREETINGS[kind].template)}
        </span>
      </p>
    </Field>
  );
}
