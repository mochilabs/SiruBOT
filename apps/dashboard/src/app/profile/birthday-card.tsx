"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BIRTHDAY_DAYS_IN_MONTH } from "@sirubot/utils/birthday";
import { Cake } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { ProfileBirthday } from "@/lib/profile-stats";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

async function requestBirthday(method: "PUT" | "DELETE", body?: { month: number; day: number }) {
  const res = await fetch("/api/profile/birthday", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "요청을 처리하지 못했어요.");
  }
}

/**
 * 생일 카드 — 보기 / 편집 두 상태. 저장·삭제 후 router.refresh()로 서버 페이지를 다시 그려
 * 별자리와 오늘의 운세 카드까지 함께 바뀌어요. 연도는 받지 않아요 (봇과 같은 월/일 저장).
 */
export function BirthdayCard({ birthday }: { birthday: ProfileBirthday }) {
  const router = useRouter();
  const hasBirthday = birthday.month != null && birthday.day != null;
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(birthday.month ?? 1);
  const [day, setDay] = useState(birthday.day ?? 1);
  const [pending, setPending] = useState<"save" | "clear" | null>(null);

  const maxDay = BIRTHDAY_DAYS_IN_MONTH[month - 1] ?? 31;
  const days = Array.from({ length: maxDay }, (_, index) => index + 1);

  const startEditing = () => {
    setMonth(birthday.month ?? 1);
    setDay(birthday.day ?? 1);
    setEditing(true);
  };

  const changeMonth = (next: number) => {
    setMonth(next);
    // 2월 30일처럼 없는 날짜가 되면 그 달의 마지막 날로 맞춰요
    setDay((prev) => Math.min(prev, BIRTHDAY_DAYS_IN_MONTH[next - 1] ?? 31));
  };

  const run = async (kind: "save" | "clear") => {
    setPending(kind);
    try {
      await requestBirthday(kind === "save" ? "PUT" : "DELETE", kind === "save" ? { month, day } : undefined);
      toast.success(kind === "save" ? "생일을 저장했어요." : "생일을 지웠어요.");
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "요청을 처리하지 못했어요.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Card padding="sm" className="h-full min-h-24">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Cake className="h-4 w-4 text-primary-text" aria-hidden />
            생일
          </CardTitle>
          <CardDescription className="text-xs leading-tight">
            {editing
              ? "생일은 나에게만 보여요. 다른 사람에게는 별자리만 공개돼요."
              : hasBirthday
                ? `${birthday.month}월 ${birthday.day}일 · ${birthday.zodiac?.ko ?? "별자리 없음"}`
                : "생일을 등록하면 별자리와 오늘의 운세를 볼 수 있어요."}
          </CardDescription>
        </div>
        {!editing && (
          <Button variant="secondary" size="sm" className="shrink-0" onClick={startEditing}>
            {hasBirthday ? "수정" : "등록"}
          </Button>
        )}
      </CardHeader>

      {editing && (
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={String(month)} onValueChange={(value) => value && changeMonth(Number(value))} disabled={pending !== null}>
            <SelectTrigger className="w-24" aria-label="생일 월">
              <SelectValue>{(value: string) => `${value}월`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}월
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(day)} onValueChange={(value) => value && setDay(Number(value))} disabled={pending !== null}>
            <SelectTrigger className="w-24" aria-label="생일 일">
              <SelectValue>{(value: string) => `${value}일`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {days.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}일
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {hasBirthday && (
              <Button variant="danger" size="sm" loading={pending === "clear"} disabled={pending !== null} onClick={() => void run("clear")}>
                삭제
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={pending !== null} onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button variant="primary" size="sm" loading={pending === "save"} disabled={pending !== null} onClick={() => void run("save")}>
              저장
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
