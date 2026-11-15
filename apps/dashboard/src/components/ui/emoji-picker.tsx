"use client";

import { useMemo, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { isValidRolePanelEmoji } from "@sirubot/utils/rolePanel";
import { ChevronDown, Search, Smile, SmilePlus, X } from "lucide-react";

import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

interface UnicodeEmojiItem {
	emoji: string;
	label: string;
	keywords: string;
}

interface EmojiCategory {
	id: string;
	label: string;
	items: UnicodeEmojiItem[];
}

const UNICODE_EMOJI_CATEGORIES: EmojiCategory[] = [
	{
		id: "role",
		label: "자주 쓰는 역할",
		items: [
			{ emoji: "✅", label: "체크 완료", keywords: "check verify 확인 인증 완료" },
			{ emoji: "⭐", label: "별", keywords: "star vip 별 인기" },
			{ emoji: "🌟", label: "빛나는 별", keywords: "glowing star 빛나는 별 특별" },
			{ emoji: "🔔", label: "알림 벨", keywords: "bell notification 알림 공지" },
			{ emoji: "📢", label: "확성기", keywords: "announcement 공지 확성기 알림" },
			{ emoji: "📣", label: "메가폰", keywords: "megaphone 응원 홍보 알림" },
			{ emoji: "📌", label: "압정", keywords: "pin notice 고정 핀 필수" },
			{ emoji: "💬", label: "말풍선", keywords: "chat message 채팅 대화 소통" },
			{ emoji: "💭", label: "생각 풍선", keywords: "thought 잡담 자유 수다" },
			{ emoji: "👑", label: "왕관", keywords: "crown king owner 왕관 서버장 리더" },
			{ emoji: "🛡️", label: "방패", keywords: "shield mod 방패 관리자 보안" },
			{ emoji: "⚔️", label: "쌍검", keywords: "swords pvp 전투 대결 공대" },
			{ emoji: "🔥", label: "불꽃", keywords: "fire hot 불 인기 핫" },
			{ emoji: "✨", label: "반짝임", keywords: "sparkles magic 반짝 신입 뉴비" },
			{ emoji: "💎", label: "보석", keywords: "gem diamond boost 보석 부스트 다이아" },
			{ emoji: "🎉", label: "파티 폭죽", keywords: "party event 파티 이벤트 축하" },
			{ emoji: "🏆", label: "트로피", keywords: "trophy win 트로피 랭킹 우승" },
			{ emoji: "🥇", label: "금메달", keywords: "gold medal 1등 금메달" },
			{ emoji: "🎯", label: "과녁", keywords: "target 미션 목표 내전" },
			{ emoji: "🎫", label: "티켓", keywords: "ticket 입장권 참가 티켓" },
			{ emoji: "🔞", label: "성인 제한", keywords: "nsfw 18 adult 성인" },
		],
	},
	{
		id: "color",
		label: "색상·하트·기호",
		items: [
			{ emoji: "❤️", label: "빨간 하트", keywords: "red heart 빨강 하트" },
			{ emoji: "🧡", label: "주황 하트", keywords: "orange heart 주황 하트" },
			{ emoji: "💛", label: "노란 하트", keywords: "yellow heart 노랑 하트" },
			{ emoji: "💚", label: "초록 하트", keywords: "green heart 초록 하트" },
			{ emoji: "💙", label: "파란 하트", keywords: "blue heart 파랑 하트" },
			{ emoji: "💜", label: "보라 하트", keywords: "purple heart 보라 하트" },
			{ emoji: "🩷", label: "분홍 하트", keywords: "pink heart 분홍 핑크 하트" },
			{ emoji: "🩵", label: "하늘 하트", keywords: "light blue heart 하늘 민트 하트" },
			{ emoji: "🖤", label: "검은 하트", keywords: "black heart 검정 블랙 하트" },
			{ emoji: "🤍", label: "하얀 하트", keywords: "white heart 하양 화이트 하트" },
			{ emoji: "🤎", label: "갈색 하트", keywords: "brown heart 갈색 브라운 하트" },
			{ emoji: "💖", label: "반짝이는 하트", keywords: "sparkling heart 반짝 하트" },
			{ emoji: "🔴", label: "빨간 원", keywords: "red circle 빨강 원" },
			{ emoji: "🟠", label: "주황 원", keywords: "orange circle 주황 원" },
			{ emoji: "🟡", label: "노란 원", keywords: "yellow circle 노랑 원" },
			{ emoji: "🟢", label: "초록 원", keywords: "green circle 초록 원" },
			{ emoji: "🔵", label: "파란 원", keywords: "blue circle 파랑 원" },
			{ emoji: "🟣", label: "보라 원", keywords: "purple circle 보라 원" },
			{ emoji: "⚫", label: "검은 원", keywords: "black circle 검정 원" },
			{ emoji: "⚪", label: "하얀 원", keywords: "white circle 하양 원" },
			{ emoji: "🟤", label: "갈색 원", keywords: "brown circle 갈색 원" },
			{ emoji: "🟥", label: "빨간 사각형", keywords: "red square 빨강 네모" },
			{ emoji: "🟧", label: "주황 사각형", keywords: "orange square 주황 네모" },
			{ emoji: "🟨", label: "노란 사각형", keywords: "yellow square 노랑 네모" },
			{ emoji: "🟩", label: "초록 사각형", keywords: "green square 초록 네모" },
			{ emoji: "🟦", label: "파란 사각형", keywords: "blue square 파랑 네모" },
			{ emoji: "🟪", label: "보라 사각형", keywords: "purple square 보라 네모" },
			{ emoji: "⭕", label: "동그라미", keywords: "circle o 찬성 가능" },
			{ emoji: "❌", label: "엑스", keywords: "cross x 반대 불가 취소" },
			{ emoji: "❓", label: "물음표", keywords: "question 질문 미정" },
			{ emoji: "❗", label: "느낌표", keywords: "exclamation 중요 필수" },
		],
	},
	{
		id: "activity",
		label: "게임·활동·취미",
		items: [
			{ emoji: "🎮", label: "게임 패드", keywords: "game controller 게임 오락" },
			{ emoji: "🕹️", label: "조이스틱", keywords: "joystick arcade 게임 오락실" },
			{ emoji: "🎲", label: "주사위", keywords: "dice boardgame 주사위 보드게임 랜덤" },
			{ emoji: "🧩", label: "퍼즐", keywords: "puzzle 퍼즐 두뇌" },
			{ emoji: "🎵", label: "음표", keywords: "music note 음악 노래" },
			{ emoji: "🎶", label: "여러 음표", keywords: "music notes 음악 감상" },
			{ emoji: "🎧", label: "헤드폰", keywords: "headphone music 헤드폰 음악 보이스" },
			{ emoji: "🎤", label: "마이크", keywords: "mic sing 노래방 마이크 보이스" },
			{ emoji: "🎸", label: "기타", keywords: "guitar band 기타 밴드 악기" },
			{ emoji: "🎹", label: "피아노", keywords: "piano keyboard 피아노 건반 악기" },
			{ emoji: "🎨", label: "팔레트", keywords: "art palette 그림 디자인 예술" },
			{ emoji: "🎬", label: "슬레이트", keywords: "movie video 영화 영상 시청" },
			{ emoji: "📺", label: "텔레비전", keywords: "tv stream 방송 스트리밍 애니" },
			{ emoji: "📚", label: "책", keywords: "book study 독서 공부 스터디" },
			{ emoji: "✏️", label: "연필", keywords: "pencil write 글쓰기 필기 작문" },
			{ emoji: "💻", label: "노트북", keywords: "laptop code dev 개발 코딩 컴퓨터" },
			{ emoji: "🖥️", label: "모니터", keywords: "desktop pc 데스크탑 컴퓨터" },
			{ emoji: "📷", label: "카메라", keywords: "camera photo 사진 카메라" },
			{ emoji: "⚽", label: "축구공", keywords: "soccer sports 축구 운동 스포츠" },
			{ emoji: "🏀", label: "농구공", keywords: "basketball 농구 스포츠" },
			{ emoji: "⚾", label: "야구공", keywords: "baseball 야구 스포츠" },
			{ emoji: "🎾", label: "테니스공", keywords: "tennis 테니스 배드민턴" },
			{ emoji: "🏋️", label: "역도", keywords: "gym workout 헬스 운동" },
			{ emoji: "🚴", label: "자전거", keywords: "bike cycling 자전거 라이딩" },
			{ emoji: "🍳", label: "프라이팬", keywords: "cooking food 요리 음식" },
			{ emoji: "✈️", label: "비행기", keywords: "airplane travel 여행 비행기" },
			{ emoji: "🏕️", label: "캠핑", keywords: "camping 캠핑 아웃도어" },
		],
	},
	{
		id: "face",
		label: "표정·사람",
		items: [
			{ emoji: "😀", label: "활짝 웃음", keywords: "smile happy 웃음 미소" },
			{ emoji: "😄", label: "눈웃음", keywords: "grinning laugh 웃음 기쁨" },
			{ emoji: "😊", label: "수줍은 미소", keywords: "blush smile 미소 친절" },
			{ emoji: "🥰", label: "하트 웃음", keywords: "love hearts 사랑 호감" },
			{ emoji: "😎", label: "선글라스", keywords: "cool sunglasses 멋짐 선글라스" },
			{ emoji: "🤓", label: "안경 얼굴", keywords: "nerd study 안경 공부 정보" },
			{ emoji: "🥳", label: "축하 얼굴", keywords: "party celebrate 축하 환영" },
			{ emoji: "🤔", label: "생각하는 얼굴", keywords: "thinking question 생각 질문" },
			{ emoji: "🫡", label: "경례", keywords: "salute 확인 충성" },
			{ emoji: "😴", label: "졸린 얼굴", keywords: "sleepy afk 잠 자리비움" },
			{ emoji: "🤯", label: "놀란 얼굴", keywords: "mind blown 충격 놀람" },
			{ emoji: "👻", label: "유령", keywords: "ghost 유령 잠수 눈팅" },
			{ emoji: "🤖", label: "로봇", keywords: "robot bot 로봇 봇 AI" },
			{ emoji: "👾", label: "외계 괴물", keywords: "alien monster 픽셀 레트로 게임" },
			{ emoji: "👍", label: "엄지 척", keywords: "thumbs up good 좋아요 찬성" },
			{ emoji: "👎", label: "엄지 아래", keywords: "thumbs down bad 싫어요 반대" },
			{ emoji: "👋", label: "손 흔들기", keywords: "wave hello 인사 환영 안녕" },
			{ emoji: "👏", label: "박수", keywords: "clap applause 박수 칭찬" },
			{ emoji: "🙌", label: "만세", keywords: "hands hooray 만세 환영" },
			{ emoji: "🙏", label: "모은 손", keywords: "pray thanks 감사 부탁" },
			{ emoji: "🤝", label: "악수", keywords: "handshake partner 악수 협동" },
			{ emoji: "💪", label: "알통", keywords: "strong muscle 힘 화이팅" },
			{ emoji: "👀", label: "눈", keywords: "eyes look 눈 구경 관전" },
			{ emoji: "🧠", label: "뇌", keywords: "brain 지식 전략" },
		],
	},
	{
		id: "nature",
		label: "동물·자연·음식",
		items: [
			{ emoji: "🐶", label: "강아지", keywords: "dog puppy 강아지 개" },
			{ emoji: "🐱", label: "고양이", keywords: "cat kitty 고양이 냥" },
			{ emoji: "🐰", label: "토끼", keywords: "rabbit bunny 토끼" },
			{ emoji: "🦊", label: "여우", keywords: "fox 여우" },
			{ emoji: "🐻", label: "곰", keywords: "bear 곰" },
			{ emoji: "🐼", label: "판다", keywords: "panda 판다" },
			{ emoji: "🐯", label: "호랑이", keywords: "tiger 호랑이" },
			{ emoji: "🦁", label: "사자", keywords: "lion 사자" },
			{ emoji: "🐸", label: "개구리", keywords: "frog 개구리" },
			{ emoji: "🐧", label: "펭귄", keywords: "penguin 펭귄" },
			{ emoji: "🐤", label: "병아리", keywords: "chick bird 병아리 새" },
			{ emoji: "🦉", label: "부엉이", keywords: "owl night 부엉이 올빼미 야행성" },
			{ emoji: "🐺", label: "늑대", keywords: "wolf 늑대" },
			{ emoji: "🦄", label: "유니콘", keywords: "unicorn 유니콘" },
			{ emoji: "🐝", label: "꿀벌", keywords: "bee 꿀벌" },
			{ emoji: "🦋", label: "나비", keywords: "butterfly 나비" },
			{ emoji: "🌸", label: "벚꽃", keywords: "cherry blossom flower 벚꽃 꽃 봄" },
			{ emoji: "🌻", label: "해바라기", keywords: "sunflower 해바라기 꽃" },
			{ emoji: "🍀", label: "네잎클로버", keywords: "clover luck 클로버 행운" },
			{ emoji: "🌱", label: "새싹", keywords: "seedling sprout 새싹 뉴비 초보" },
			{ emoji: "☀️", label: "해", keywords: "sun day 해 낮 아침" },
			{ emoji: "🌙", label: "초승달", keywords: "moon night 달 밤 새벽" },
			{ emoji: "🌈", label: "무지개", keywords: "rainbow 무지개" },
			{ emoji: "❄️", label: "눈송이", keywords: "snowflake winter 눈 겨울 얼음" },
			{ emoji: "⚡", label: "번개", keywords: "lightning zap 번개 스피드" },
			{ emoji: "☕", label: "커피", keywords: "coffee cafe 커피 카페 휴식" },
			{ emoji: "🍺", label: "맥주", keywords: "beer drink 맥주 술 친목" },
			{ emoji: "🍕", label: "피자", keywords: "pizza food 피자 맛집" },
			{ emoji: "🍰", label: "케이크", keywords: "cake birthday 케이크 생일 디저트" },
		],
	},
];

export interface EmojiPickerProps {
	value: string | null;
	onChange: (emoji: string | null) => void;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	className?: string;
	"aria-label"?: string;
}

export function EmojiPicker({
	value,
	onChange,
	placeholder = "이모지",
	required = false,
	disabled = false,
	className,
	"aria-label": ariaLabel = "이모지 선택",
}: EmojiPickerProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState<string>("all");

	const trimmedValue = value?.trim() || null;
	const isInvalid = Boolean(trimmedValue && !isValidRolePanelEmoji(trimmedValue));

	const normalizedQuery = search.trim().toLowerCase();

	const filteredCategories = useMemo(() => {
		return UNICODE_EMOJI_CATEGORIES.map((category) => {
			if (!normalizedQuery) return category;
			return {
				...category,
				items: category.items.filter(
					(item) =>
						item.emoji.includes(normalizedQuery) ||
						item.label.toLowerCase().includes(normalizedQuery) ||
						item.keywords.toLowerCase().includes(normalizedQuery),
				),
			};
		}).filter((category) => category.items.length > 0);
	}, [normalizedQuery]);

	const directInputCandidate = useMemo(() => {
		const raw = search.trim();
		if (!raw) return null;
		return isValidRolePanelEmoji(raw) ? raw : null;
	}, [search]);

	function handleSelect(nextEmoji: string | null) {
		onChange(nextEmoji);
		setOpen(false);
		setSearch("");
	}

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<div className={cn("inline-flex items-center gap-1", className)}>
				<Popover.Trigger
					disabled={disabled}
					aria-label={ariaLabel}
					className={cn(
						"group/emoji-trigger inline-flex h-9 min-w-[6.5rem] cursor-pointer items-center justify-between gap-2 rounded-control bg-input py-1.5 pl-3 pr-2.5 text-sm font-medium text-foreground shadow-control-boundary transition-colors duration-fast select-none hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
						isInvalid && "shadow-control-boundary-invalid text-destructive",
					)}
				>
					{trimmedValue ? (
						<span className="flex items-center gap-2">
							<span className="text-lg leading-none">{trimmedValue}</span>
							<span className="text-xs text-muted-foreground">변경</span>
						</span>
					) : (
						<span className="flex items-center gap-1.5 font-normal text-muted-foreground">
							<SmilePlus className="size-4 shrink-0" />
							<span className="truncate text-xs">
								{placeholder}
								{required ? " *" : ""}
							</span>
						</span>
					)}
					<ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-fast", open && "rotate-180")} />
				</Popover.Trigger>

				{trimmedValue && !required && !disabled ? (
					<button
						type="button"
						onClick={() => onChange(null)}
						aria-label="이모지 지우기"
						title="이모지 지우기"
						className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors duration-fast hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<X className="size-3.5" />
					</button>
				) : null}
			</div>

			<Popover.Portal>
				<Popover.Positioner sideOffset={6} align="start" className="isolate z-(--z-overlay)">
					<Popover.Popup className="pop-in w-80 origin-(--transform-origin) rounded-menu border border-border-subtle bg-popover p-3 text-popover-foreground shadow-2xl outline-none">
						<div className="space-y-2.5">
							<InputGroup className="h-8">
								<InputGroupAddon align="inline-start">
									<Search className="size-3.5" aria-hidden />
								</InputGroupAddon>
								<InputGroupInput
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="이모지 검색 (예: 게임, 하트, 알림) 또는 붙여넣기"
									className="text-xs"
								/>
								{search ? (
									<InputGroupAddon align="inline-end">
										<InputGroupButton
											size="icon-xs"
											onClick={() => setSearch("")}
											aria-label="검색어 지우기"
										>
											<X className="size-3.5" />
										</InputGroupButton>
									</InputGroupAddon>
								) : null}
							</InputGroup>

							{directInputCandidate ? (
								<button
									type="button"
									onClick={() => handleSelect(directInputCandidate)}
									className="flex w-full items-center justify-between rounded-control bg-surface-2 px-2.5 py-1.5 text-xs text-foreground transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span className="flex items-center gap-2">
										<span className="text-base leading-none">{directInputCandidate}</span>
										<span>입력한 이모지 바로 사용</span>
									</span>
									<span className="font-mono text-2xs text-muted-foreground">{directInputCandidate}</span>
								</button>
							) : null}

							{!normalizedQuery ? (
								<div className="flex flex-wrap gap-1 border-b border-border/50 pb-2">
									<button
										type="button"
										aria-pressed={activeTab === "all"}
										onClick={() => setActiveTab("all")}
										className={cn(
											"rounded-control px-2 py-1 text-2xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											activeTab === "all"
												? "bg-primary-control/15 font-semibold text-primary-text"
												: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
										)}
									>
										전체
									</button>
									{UNICODE_EMOJI_CATEGORIES.map((category) => (
										<button
											key={category.id}
											type="button"
											aria-pressed={activeTab === category.id}
											onClick={() => setActiveTab(category.id)}
											className={cn(
												"rounded-control px-2 py-1 text-2xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												activeTab === category.id
													? "bg-primary-control/15 font-semibold text-primary-text"
													: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
											)}
										>
											{category.label}
										</button>
									))}
								</div>
							) : null}

							<div className="max-h-64 space-y-3 overflow-y-auto pr-1">
								{filteredCategories
									.filter((category) => Boolean(normalizedQuery) || activeTab === "all" || activeTab === category.id)
									.map((category) => (
										<div key={category.id} className="space-y-1.5">
											<div className="px-1 text-2xs font-medium text-muted-foreground">{category.label}</div>
											<div className="grid grid-cols-7 gap-1">
												{category.items.map((item) => {
													const selected = trimmedValue === item.emoji;
													return (
														<button
															key={item.emoji}
															type="button"
															aria-pressed={selected}
															onClick={() => handleSelect(item.emoji)}
															title={item.label}
															aria-label={item.label}
															className={cn(
																"flex size-9 items-center justify-center rounded-control text-lg transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
																selected && "bg-primary-control/15 ring-2 ring-inset ring-ring",
															)}
														>
															{item.emoji}
														</button>
													);
												})}
											</div>
										</div>
									))}

								{filteredCategories.length === 0 && !directInputCandidate ? (
									<div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center text-xs text-muted-foreground">
										<Smile className="size-5 opacity-60" />
										<p>일치하는 이모지가 없어요.</p>
										<p className="text-2xs">원하는 유니코드 이모지를 검색창에 직접 붙여넣을 수 있어요.</p>
									</div>
								) : null}
							</div>

							{trimmedValue ? (
								<div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
									<span className="flex items-center gap-1.5 text-muted-foreground">
										<span>선택됨:</span>
										<span className="text-base leading-none text-foreground">{trimmedValue}</span>
									</span>
									{!required ? (
										<button
											type="button"
											onClick={() => handleSelect(null)}
											className="shrink-0 rounded-control px-1.5 py-0.5 text-xs text-muted-foreground transition-colors duration-fast hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											선택 해제
										</button>
									) : null}
								</div>
							) : null}
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
