"use client";

import { useState } from "react";
import { Home, Search, Settings } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { SectionLabel } from "@/components/primitives/section-label";
import { StatusDot } from "@/components/primitives/status-dot";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { SkeletonCard, SkeletonCircle, SkeletonLine } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { SectionHeader, Showcase, ShowcaseRow } from "./shared";

const tabItems = [
	{ value: "overview", label: "개요", icon: <Home size={14} /> },
	{ value: "settings", label: "설정", icon: <Settings size={14} /> },
	{ value: "logs", label: "로그", badge: <Badge size="sm">3</Badge> },
];

export function PrimitivesSection() {
	const [switchVal, setSwitchVal] = useState(true);
	const [sliderVal, setSliderVal] = useState(60);
	const [cooldownVal, setCooldownVal] = useState(30);
	const [dismissableDemo, setDismissableDemo] = useState(true);
	const [accentColor, setAccentColor] = useState("#ffdaff");

	return (
		<>
			<SectionHeader
				id="primitives"
				title="Primitives"
				description="shadcn 기반 UI 컴포넌트"
			/>
			<Showcase className="space-y-8">
				<ShowcaseRow label="Button variants">
					<Button>default</Button>
					<Button variant="primary">primary</Button>
					<Button variant="secondary">secondary</Button>
					<Button variant="ghost">ghost</Button>
					<Button variant="danger">danger</Button>
					<Button variant="outline">outline</Button>
					<Button variant="icon" icon={<Settings size={18} />} />
					<Button variant="state-toggle" active>
						active
					</Button>
					<Button variant="cta">cta</Button>
					<Button variant="link">link</Button>
				</ShowcaseRow>

				<ShowcaseRow label="Button sizes">
					<Button size="sm">sm</Button>
					<Button size="md">md</Button>
					<Button size="lg">lg</Button>
				</ShowcaseRow>

				<ShowcaseRow label="Card" block>
					{/* 카드는 실제 페이지처럼 page background 위에서 보여줘요 — 쇼케이스 카드와 같은 색이면 경계가 안 보여요 */}
					<div className="flex flex-wrap items-start gap-4 rounded-card bg-background p-4">
						<Card className="max-w-xs">
							<CardHeader>
								<CardTitle>Card title</CardTitle>
								<CardDescription>Card description</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">카드 콘텐츠 영역</p>
							</CardContent>
							<CardFooter>
								<Button size="sm">확인</Button>
							</CardFooter>
						</Card>
						<Card variant="muted" className="max-w-xs">
							<CardHeader>
								<CardTitle>Muted</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">bg-muted</p>
							</CardContent>
						</Card>
						<Card variant="raised" className="max-w-xs">
							<CardHeader>
								<CardTitle>Raised</CardTitle>
							</CardHeader>
							<CardContent>
								<p className="text-sm text-muted-foreground">shadow-sm</p>
							</CardContent>
						</Card>
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="Input / Textarea">
					<Input placeholder="텍스트 입력" className="max-w-xs" />
					<Input placeholder="비활성화" disabled className="max-w-xs" />
					<Input defaultValue="잘못된 값" aria-invalid className="max-w-xs" />
					<Textarea placeholder="여러 줄 입력" className="max-w-md" />
				</ShowcaseRow>

				<ShowcaseRow label="ColorPicker" block>
					<div className="grid items-start gap-4 sm:grid-cols-2">
						<Field label="강조색" description="팔레트를 드래그하거나 HEX로 입력해요.">
							<ColorPicker value={accentColor} label="강조색" onChange={setAccentColor} />
						</Field>
						<Field label="비활성화">
							<ColorPicker value="#a3416f" label="비활성 색" onChange={() => {}} disabled />
						</Field>
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="Field" block>
					{/* 설명/오류 문구가 달라도 인풋 라인이 일직선이 되도록 위 정렬 */}
					<div className="grid items-start gap-4 sm:grid-cols-3">
						<Field label="기본 필드" description="설명 문구가 아래에 표시돼요.">
							{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} placeholder="값 입력" />}
						</Field>
						<Field label="필수 필드" required>
							{({ id, invalid }) => <Input id={id} aria-invalid={invalid || undefined} placeholder="반드시 입력" />}
						</Field>
						<Field label="오류 필드" error="값이 올바르지 않아요.">
							{({ id, describedBy, invalid }) => (
								<Input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} defaultValue="오류" />
							)}
						</Field>
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="Badge">
					<Badge>default</Badge>
					<Badge variant="primary">primary</Badge>
					<Badge variant="success" dot>
						success
					</Badge>
					<Badge variant="warning" dot>
						warning
					</Badge>
					<Badge variant="danger" dot>
						danger
					</Badge>
					<Badge variant="info">info</Badge>
					<Badge variant="discord">BOT</Badge>
					{dismissableDemo ? (
						<Badge variant="primary" dismissible onDismiss={() => setDismissableDemo(false)}>
							dismissible
						</Badge>
					) : (
						<Button size="sm" variant="ghost" onClick={() => setDismissableDemo(true)}>
							배지 되돌리기
						</Button>
					)}
				</ShowcaseRow>

				<ShowcaseRow label="StatusDot">
					<StatusDot status="ready" label="READY" />
					<StatusDot status="idle" label="IDLE" />
					<StatusDot status="connecting" label="CONNECTING" />
					<StatusDot status="disconnected" label="DISCONNECTED" />
					<StatusDot status="errored" label="ERRORED" />
					<div className="flex items-center gap-2">
						<StatusDot size="sm" status="ready" />
						<StatusDot size="md" status="ready" />
						<StatusDot size="lg" status="ready" />
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="SectionLabel">
					<SectionLabel as="p">최근 재생</SectionLabel>
					<SectionLabel as="p">플레이리스트</SectionLabel>
					<SectionLabel as="p" className="px-0">
						패딩 없음
					</SectionLabel>
				</ShowcaseRow>

				<ShowcaseRow label="EmptyState" block>
					<div className="grid items-start gap-4 md:grid-cols-2">
						<EmptyState title="아직 곡이 없어요." description="플레이리스트를 채워보세요." />
						<EmptyState
							size="sm"
							icon={Search}
							title="검색 결과가 없어요."
							description="다른 키워드로 다시 검색해보세요."
							action={<Button size="sm">다시 검색</Button>}
							secondaryAction={<Button size="sm" variant="ghost">초기화</Button>}
						/>
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="Avatar">
					<Avatar fallback="시" size="xs" />
					<Avatar fallback="시" size="sm" />
					<Avatar fallback="시" size="md" ring />
					<Avatar fallback="시" size="lg" ring />
					<Avatar fallback="A" size="md" status="online" />
					<Avatar fallback="B" size="md" status="idle" />
					<Avatar fallback="C" size="md" status="dnd" />
					<Avatar fallback="D" size="md" status="offline" />
				</ShowcaseRow>

				<ShowcaseRow label="Skeleton" block>
					{/* 스켈레톤은 실제 페이지처럼 page background 위에서 — 쇼케이스 표면과 같은 색이면 대비가 없어요 */}
					<div className="rounded-card bg-background p-4">
						<div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
							<SkeletonCard lines={3} avatar />
							<SkeletonCard lines={2} avatar={false} />
						</div>
						<div className="mt-4 flex items-center gap-3">
							<SkeletonLine width="200px" />
							<SkeletonCircle size="h-12 w-12" />
						</div>
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="Tabs">
					<Tabs defaultValue="overview">
						<TabsList>
							{tabItems.map((item) => (
								<TabsTrigger key={item.value} value={item.value}>
									<span className="inline-flex items-center gap-1.5">
										{item.icon}
										{item.label}
										{item.badge}
									</span>
								</TabsTrigger>
							))}
						</TabsList>
						<TabsContent value="overview">
							<p className="text-sm text-muted-foreground">개요 패널 내용입니다.</p>
						</TabsContent>
						<TabsContent value="settings">
							<p className="text-sm text-muted-foreground">설정 패널 내용입니다.</p>
						</TabsContent>
						<TabsContent value="logs">
							<p className="text-sm text-muted-foreground">로그 패널 내용입니다.</p>
						</TabsContent>
					</Tabs>
				</ShowcaseRow>

				<ShowcaseRow label="Slider" block>
					<div className="w-full max-w-sm space-y-6">
						<Slider value={sliderVal} onChange={setSliderVal} label="볼륨" showValue formatValue={(v) => `${v}%`} />
						<Slider value={cooldownVal} onChange={setCooldownVal} min={0} max={60} step={5} label="쿨다운" showValue formatValue={(v) => `${v}초`} />
						<Slider value={50} onChange={() => {}} disabled label="비활성" />
					</div>
				</ShowcaseRow>

				<ShowcaseRow label="Switch">
					<Switch checked={switchVal} onChange={setSwitchVal} label="알림 받기" />
					<Switch checked={!switchVal} onChange={(v) => setSwitchVal(!v)} label="자동 재생" />
					<Switch checked disabled label="활성화" size="sm" />
					<Switch checked={false} disabled label="비활성화" size="sm" />
				</ShowcaseRow>
			</Showcase>
		</>
	);
}
