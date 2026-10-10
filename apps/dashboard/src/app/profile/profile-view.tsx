"use client";

import Image from "next/image";
import { Cake, CalendarCheck, Gamepad2, ListMusic, Music4, Send, Sparkles } from "lucide-react";

import { StatCard } from "@/components/data/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { RevealGroup, RevealItem } from "@/components/motion/reveal";
import { Badge } from "@/components/primitives/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/primitives/card";
import { useCountUp } from "@/hooks/use-count-up";
import { formatTotalDuration } from "@/hooks/use-playlists";
import type {
  ProfileAttendance,
  ProfileBirthday,
  ProfileGamesStats,
  ProfileHoroscope,
  ProfileMusicStats,
} from "@/lib/profile-stats";

export interface ProfileViewProps {
  user: { id: string; name: string; image: string | null };
  birthday: ProfileBirthday;
  fortune: ProfileHoroscope | null;
  music: ProfileMusicStats;
  games: ProfileGamesStats;
  attendance: ProfileAttendance;
}

function formatDay(playedAt: string): string {
  const date = new Date(playedAt);
  if (Number.isNaN(date.getTime())) return "";
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

function MockThumbnail({ className }: { className: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-secondary/20 relative ${className}`}
    >
      <Music4 className="h-1/3 w-1/3 text-primary-text relative z-10" aria-hidden />
      <span className="absolute bottom-1 right-1 text-[8px] font-black text-primary/20 uppercase tracking-tighter select-none z-10">
        No Image
      </span>
    </div>
  );
}

/** 출석 연속 일수 — 뷰포트 진입 시 카운트업 (작고 조용한 스탯) */
function StreakCount({ streak }: { streak: number }) {
  const { ref, value } = useCountUp({ end: streak });

  return (
    <p className="text-2xl font-black tabular-nums text-foreground">
      <span ref={ref}>{Math.round(value).toLocaleString("ko-KR")}</span>
      <span className="ml-1 text-sm font-bold text-muted-foreground">일 연속</span>
    </p>
  );
}

export function ProfileView({ user, birthday, fortune, music, games, attendance }: ProfileViewProps) {
  const hasBirthday = birthday.month != null && birthday.day != null;

  return (
    <>
      <PageHeader title="내 프로필" description={user.name ? `${user.name}님의 프로필이에요.` : undefined} />

      <RevealGroup className="grid gap-4 md:grid-cols-2" stagger={0.1}>
        {/* 생일 카드 */}
        <RevealItem>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cake className="h-4 w-4 text-primary-text" aria-hidden />
                생일
              </CardTitle>
              <CardDescription>
                {hasBirthday
                  ? `${birthday.month}월 ${birthday.day}일 · ${birthday.zodiac?.ko ?? "별자리 없음"}`
                  : "봇 `/프로필 생일 등록` 커맨드로 등록할 수 있어요."}
              </CardDescription>
            </CardHeader>
          </Card>
        </RevealItem>

        {/* 출석 카드 — 슬림하게 */}
        <RevealItem>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary-text" aria-hidden />
                출석
              </CardTitle>
              <div className="flex items-center justify-between gap-3">
                <StreakCount streak={attendance.streak} />
                {attendance.checkedInToday ? (
                  <Badge variant="success">오늘 출석 완료</Badge>
                ) : (
                  <Badge variant="warning">오늘 미출석 · `/출석`으로 체크</Badge>
                )}
              </div>
            </CardHeader>
          </Card>
        </RevealItem>

        {/* 오늘의 운세 — 생일 별자리의 오하아사 (data-api 일일 캐시와 동일 데이터) */}
        <RevealItem className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary-text" aria-hidden />
                오늘의 운세
              </CardTitle>
              <CardDescription>
                {hasBirthday && birthday.zodiac
                  ? `${birthday.zodiac.ko} 오늘의 별자리 운세`
                  : "봇 `/프로필 생일 등록` 커맨드로 등록하면 오늘의 운세가 표시돼요."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasBirthday && birthday.zodiac ? (
                fortune && fortune.content ? (
                  <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-foreground/90">
                    {fortune.content.replaceAll("\t", "\n")}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">지금은 운세를 불러오지 못했어요. 잠시 후 다시 방문해 주세요.</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">-</p>
              )}
              {hasBirthday && birthday.zodiac && fortune && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3 text-xs font-medium text-muted-foreground">
                  <Badge variant="default">{birthday.zodiac.ko}</Badge>
                  {fortune.rank > 0 && <Badge variant="primary">{fortune.rank}위</Badge>}
                  <span className="ml-auto tabular-nums">{fortune.date} 기준</span>
                  {!fortune.translated && <span>( 번역 대기 · 일본어 원문 )</span>}
                </div>
              )}
            </CardContent>
          </Card>
        </RevealItem>

        {/* 게임 전적 카드 */}
        <RevealItem className="md:col-span-2">
          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="h-4 w-4 text-primary-text" aria-hidden />
              게임 전적
            </CardTitle>
          </CardHeader>
          <CardContent>
            {games.rps || games.guessBest != null ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-medium text-foreground/90">
                <span>
                  가위바위보{" "}
                  <span className="font-black tabular-nums">
                    {games.rps ? `${games.rps.wins}승 ${games.rps.losses}패 ${games.rps.draws}무` : "-"}
                  </span>
                  {games.rps && games.rps.bestStreak >= 2 && (
                    <span className="ml-1 text-muted-foreground">(최고 {games.rps.bestStreak}연승)</span>
                  )}
                </span>
                <span>
                  숫자맞히기 최고 기록{" "}
                  <span className="font-black tabular-nums">
                    {games.guessBest != null ? `${games.guessBest}번` : "-"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">(최근 기록 기준)</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </CardContent>
          </Card>
        </RevealItem>
      </RevealGroup>

      {/* 음악 통계 */}
      <div className="mt-6 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground">
          <ListMusic className="h-5 w-5 text-primary-text" aria-hidden />
          음악 통계
        </h2>
        <RevealGroup className="grid gap-4 sm:grid-cols-3">
          <RevealItem>
            <StatCard icon={ListMusic} label="플레이리스트 수" value={music.playlistCount} />
          </RevealItem>
          <RevealItem>
            <StatCard icon={Send} label="총 신청 곡" value={music.requestedCount} />
          </RevealItem>
          <RevealItem>
            <StatCard
              icon={Music4}
              label="청취 시간"
              value={formatTotalDuration(music.listenMs)}
              sub={music.listenSampled ? "(최근 500곡 기준)" : undefined}
            />
          </RevealItem>
        </RevealGroup>

        {/* TOP 5 트랙 */}
        <Card className="mt-2">
          <CardHeader>
            <CardTitle>자주 들은 트랙 TOP 5</CardTitle>
          </CardHeader>
          <CardContent>
            {music.topTracks.length > 0 ? (
              <RevealGroup className="space-y-2">
                {music.topTracks.map((track, i) => (
                  <RevealItem key={`${track.title}-${track.artist}-${i}`}>
                    <li
                      className="bg-surface-1 border border-border-subtle rounded-card flex items-center gap-3 p-3 hover:border-primary/30 transition-colors duration-fast"
                    >
                      <span className="hidden sm:flex w-6 justify-center shrink-0 text-sm font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/20">
                        {track.thumbnail ? (
                          <Image
                            src={track.thumbnail}
                            alt={track.title}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <MockThumbnail className="h-full w-full" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-foreground" title={track.title}>
                          {track.title}
                        </p>
                        <p className="truncate text-xs font-bold text-muted-foreground" title={track.artist}>
                          {track.artist}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black tabular-nums text-primary-text">{track.count.toLocaleString()}회</p>
                        <p className="text-xs font-medium text-muted-foreground">
                          {music.recentTracks[i] ? formatDay(music.recentTracks[i].playedAt) : ""}
                        </p>
                      </div>
                    </li>
                  </RevealItem>
                ))}
              </RevealGroup>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                아직 신청 기록이 없어요. 디스코드에서 음악을 신청해보세요!
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}