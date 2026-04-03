import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Music,
  Volume2,
  Repeat,
  Sparkles,
  Monitor,
  Shield,
  Settings2,
} from "lucide-react";
import { db } from "@/lib/db";
import type { DiscordGuild } from "@/types/discord";

interface GuildSettings {
  volume: number;
  textChannelId: string | null;
  voiceChannelId: string | null;
  enableController: boolean;
  sponsorBlockSegments: string[];
  djRoleId: string | null;
  repeat: string;
  related: boolean;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  position: number;
}

interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
}

async function getGuild(
  accessToken: string,
  guildId: string,
): Promise<DiscordGuild | null> {
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const guilds: DiscordGuild[] = await res.json();
  return guilds.find((g) => g.id === guildId) || null;
}

async function getGuildChannels(
  accessToken: string,
  guildId: string,
): Promise<DiscordChannel[]> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/channels`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 60 },
    },
  );
  if (!res.ok) return [];
  const channels: DiscordChannel[] = await res.json();
  return channels.filter((c) => c.type === 0 || c.type === 2);
}

async function getGuildRoles(
  accessToken: string,
  guildId: string,
): Promise<DiscordRole[]> {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/roles`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 60 },
    },
  );
  if (!res.ok) return [];
  return res.json();
}

async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const guild = await db.guild.findUnique({
    where: { id: guildId },
  });
  if (!guild) {
    return {
      volume: 10,
      textChannelId: null,
      voiceChannelId: null,
      enableController: true,
      sponsorBlockSegments: [],
      djRoleId: null,
      repeat: "off",
      related: false,
    };
  }
  return {
    volume: guild.volume,
    textChannelId: guild.textChannelId,
    voiceChannelId: guild.voiceChannelId,
    enableController: guild.enableController,
    sponsorBlockSegments: guild.sponsorBlockSegments,
    djRoleId: guild.djRoleId,
    repeat: guild.repeat,
    related: guild.related,
  };
}

const SPONSOR_BLOCK_OPTIONS = [
  {
    name: "sponsor",
    label: "스폰서",
    emoji: "💰",
    description: "유료 홍보 및 광고 구간",
  },
  {
    name: "selfpromo",
    label: "자기 홍보",
    emoji: "📢",
    description: "채널 홍보, 구독 요청 등",
  },
  {
    name: "interaction",
    label: "상호작용",
    emoji: "💬",
    description: "좋아요, 댓글 요청 등",
  },
  {
    name: "intro",
    label: "인트로",
    emoji: "🎬",
    description: "반복되는 인트로 영상",
  },
  {
    name: "outro",
    label: "아웃트로",
    emoji: "🔚",
    description: "엔딩 카드, 크레딧 등",
  },
  {
    name: "preview",
    label: "미리보기",
    emoji: "👀",
    description: "이전 영상 요약 또는 미리보기",
  },
  {
    name: "music_offtopic",
    label: "음악 외 구간",
    emoji: "🎵",
    description: "음악 영상에서 음악이 아닌 부분",
  },
  {
    name: "filler",
    label: "필러",
    emoji: "⏭️",
    description: "주제와 관련 없는 장면",
  },
];

const REPEAT_OPTIONS = [
  { value: "off", label: "반복 안함", emoji: "➡️" },
  { value: "track", label: "한 곡 반복", emoji: "🔂" },
  { value: "queue", label: "전체 반복", emoji: "🔁" },
];

export default async function ServerSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/api/auth/signin?callbackUrl=/servers");

  const { id: guildId } = await params;

  const guild = await getGuild(session.accessToken!, guildId);
  if (!guild) notFound();

  const permissions = BigInt(guild.permissions);
  const canManage =
    (permissions & BigInt(0x20)) === BigInt(0x20) ||
    (permissions & BigInt(0x8)) === BigInt(0x8);
  if (!canManage) redirect("/servers");

  const [settings, channels, roles] = await Promise.all([
    getGuildSettings(guildId),
    getGuildChannels(session.accessToken!, guildId),
    getGuildRoles(session.accessToken!, guildId),
  ]);

  const textChannels = channels.filter((c) => c.type === 0);
  const voiceChannels = channels.filter((c) => c.type === 2);
  const iconUrl = guild.icon
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/servers"
            className="rounded-lg p-2 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)]"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-4">
            {iconUrl ? (
              <Image
                src={iconUrl}
                alt={`${guild.name} icon`}
                width={48}
                height={48}
                className="rounded-xl ring-1 ring-[var(--color-border)]"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)] text-lg font-semibold text-[var(--color-accent)]">
                {guild.name.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                <span className="gradient-text">{guild.name}</span>
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                서버 설정
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 음악 설정 */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)]">
              <Music size={18} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                음악 설정
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                재생 관련 기본 설정
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* 볼륨 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
                <Volume2 size={14} />
                기본 볼륨: {settings.volume}%
              </div>
              <div className="h-2 rounded-full bg-[var(--color-bg-tertiary)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent2)] transition-all"
                  style={{ width: `${settings.volume}%` }}
                />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                봇 명령어로 변경: /볼륨
              </p>
            </div>

            {/* 반복 모드 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
                <Repeat size={14} />
                반복 모드
              </div>
              <div className="flex gap-2">
                {REPEAT_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      settings.repeat === opt.value
                        ? "bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)] text-[var(--color-accent)]"
                        : "bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    <span>{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 추천 곡 자동재생 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
                <Sparkles size={14} />
                추천 곡 자동재생
              </div>
              <div
                className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  settings.related
                    ? "bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)] text-[var(--color-accent)]"
                    : "bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                {settings.related ? "✨ 켜짐" : "꺼짐"}
              </div>
            </div>
          </div>
        </div>

        {/* 채널 설정 */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent2-subtle)] border border-[var(--color-border)]">
              <Settings2 size={18} className="text-[var(--color-accent2)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                채널 설정
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                음악 재생 및 컨트롤 채널
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* 텍스트 채널 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                음악 텍스트 채널
              </p>
              <div className="rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-primary)]">
                {settings.textChannelId
                  ? (textChannels.find((c) => c.id === settings.textChannelId)
                      ?.name ?? `채널 ID: ${settings.textChannelId}`)
                  : "설정되지 않음"}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                봇 명령어로 변경: /설정 채널
              </p>
            </div>

            {/* 음성 채널 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                기본 음성 채널
              </p>
              <div className="rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-primary)]">
                {settings.voiceChannelId
                  ? (voiceChannels.find((c) => c.id === settings.voiceChannelId)
                      ?.name ?? `채널 ID: ${settings.voiceChannelId}`)
                  : "설정되지 않음"}
              </div>
            </div>

            {/* 음악 컨트롤 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
                <Monitor size={14} />
                음악 컨트롤러
              </div>
              <div
                className={`rounded-lg px-3 py-2 text-xs font-medium ${
                  settings.enableController
                    ? "bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)] text-[var(--color-accent)]"
                    : "bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                {settings.enableController ? "🎛️ 활성화" : "비활성화"}
              </div>
            </div>
          </div>
        </div>

        {/* DJ 모드 */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] border border-[var(--color-border-accent)]">
              <Shield size={18} className="text-[var(--color-accent)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                DJ 모드
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                DJ 역할 설정
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--color-text-secondary)]">
                DJ 역할
              </p>
              <div className="rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text-primary)]">
                {settings.djRoleId
                  ? (roles.find((r) => r.id === settings.djRoleId)?.name ??
                    `역할 ID: ${settings.djRoleId}`)
                  : "설정되지 않음 (모든 사용자)"}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                DJ 역할이 설정되면 해당 역할만 음악 컨트롤 가능
              </p>
            </div>
          </div>
        </div>

        {/* SponsorBlock */}
        <div className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent2-subtle)] border border-[var(--color-border)]">
              <span className="text-lg">🚫</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                SponsorBlock
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                YouTube 영상 구간 자동 스킵
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {SPONSOR_BLOCK_OPTIONS.map((opt) => {
              const isActive = settings.sponsorBlockSegments.includes(opt.name);
              return (
                <div
                  key={opt.name}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-all ${
                    isActive
                      ? "bg-[var(--color-accent2-subtle)] border border-[var(--color-border)]"
                      : "bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{opt.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">
                        {opt.label}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {opt.description}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-md border transition-all ${
                      isActive
                        ? "bg-[var(--color-accent2)] border-[var(--color-accent2)]"
                        : "border-[var(--color-border)]"
                    }`}
                  >
                    {isActive && (
                      <svg
                        className="h-full w-full text-white"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="glass-panel p-6 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          대부분의 설정은 Discord에서{" "}
          <code className="rounded bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-xs">
            /설정
          </code>{" "}
          명령어로도 변경할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
