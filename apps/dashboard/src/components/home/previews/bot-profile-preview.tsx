"use client";

import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

/** 프리셋 닉네임 — 실제 기능은 봇의 botProfileService: 저장하면 discord.js editMe로 길드 전용 프로필에 적용돼요 */
const NICKNAME_PRESETS = ["시루봇", "DJ 시루", "라운지 관리사 시루"];

/** 프리셋 아바타 — public/images에 실제 있는 시루 이미지 3종 */
const AVATAR_PRESETS = [
	{ src: "/images/profile.png", label: "기본" },
	{ src: "/images/siru-profile.png", label: "프로필" },
	{ src: "/images/siru-profile-hand.png", label: "손인사" }
];

/** 봇 프로필 프리뷰 — 프리셋을 골라 프로필 카드가 그대로 바뀌는 모습을 보여줘요. 바뀐 값 자체가 저장 결과예요 */
export function BotProfilePreview() {
	const [nickname, setNickname] = useState("시루봇");
	const [avatar, setAvatar] = useState(AVATAR_PRESETS[0].src);

	return (
		<div className="relative pr-2">
			<div className="overflow-hidden rounded-card bg-surface-1 shadow-md">
				<div className="h-16 bg-gradient-to-r from-primary/50 via-primary-control/40 to-primary/50" />
				<div className="relative ml-4 -mt-7 h-14 w-14 overflow-hidden rounded-full ring-4 ring-surface-1">
					<Image key={avatar} src={avatar} alt="시루" fill className="object-cover" sizes="56px" />
				</div>
				<div className="flex min-w-0 flex-col gap-1 p-4 pt-2">
					<p className="truncate text-lg font-black tracking-tighter text-foreground">{nickname}</p>
					<div className="flex items-center gap-2">
						<span className="h-2 w-2 rounded-full bg-success" aria-hidden />
						<span className="text-2xs text-muted-foreground">온라인</span>
						<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">앱</span>
						<span className="text-2xs text-muted-foreground">sirubot</span>
					</div>
				</div>
				<p className="border-t border-border-subtle px-4 py-2 text-2xs text-muted-foreground">이 길드에만 적용된 프로필이에요.</p>
			</div>
			<div className="mt-3 rounded-card bg-surface-2 p-3">
				<p className="text-2xs font-medium text-muted-foreground">길드 닉네임</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{NICKNAME_PRESETS.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => setNickname(name)}
							className={cn(
								"cursor-pointer rounded-control px-2.5 py-1.5 text-xs font-bold transition-colors duration-fast",
								nickname === name
									? "bg-primary/10 text-primary-text"
									: "bg-surface-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground",
							)}
						>
							{name}
						</button>
					))}
				</div>
				<p className="mt-3 text-2xs font-medium text-muted-foreground">길드 아바타</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{AVATAR_PRESETS.map((preset) => (
						<button
							key={preset.src}
							type="button"
							title={preset.label}
							aria-label={`길드 아바타: ${preset.label}`}
							onClick={() => setAvatar(preset.src)}
							className={cn(
								"relative h-9 w-9 overflow-hidden rounded-full transition-all duration-fast",
								avatar === preset.src
									? "ring-2 ring-primary-control ring-offset-2 ring-offset-surface-2"
									: "opacity-70 hover:opacity-100"
							)}
						>
							<Image src={preset.src} alt="" fill className="object-cover" sizes="36px" />
						</button>
					))}
				</div>
			</div>
		</div>
	);
}