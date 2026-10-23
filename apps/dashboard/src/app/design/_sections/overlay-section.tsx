"use client";

import { useState } from "react";
import { ChevronDown, Command, Home, RadioTower, Search, Server, Settings, Trash2, Users } from "lucide-react";

import { SaveBar } from "@/components/servers/settings-shared";
import { Button } from "@/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

import { SectionHeader, Showcase, ShowcaseRow } from "./shared";

function ToastDemo() {
	const toast = useToast();

	return (
		<ShowcaseRow label="토스트 트리거">
			<Button variant="ghost" size="sm" onClick={() => toast.success("저장 완료!", "변경사항이 저장되었어요.")}>
				성공
			</Button>
			<Button variant="ghost" size="sm" onClick={() => toast.error("오류 발생", "네트워크 에러입니다.")}>
				에러
			</Button>
			<Button variant="ghost" size="sm" onClick={() => toast.info("안내", "새로운 업데이트가 있어요.")}>
				정보
			</Button>
			<Button variant="ghost" size="sm" onClick={() => toast.warning("주의", "쿨타임이 거의 끝났어요.")}>
				경고
			</Button>
		</ShowcaseRow>
	);
}

export function OverlaySection() {
	const [modalOpen, setModalOpen] = useState(false);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [cmdOpen, setCmdOpen] = useState(false);
	const [selectValue, setSelectValue] = useState<string>("");
	const [saveBarDemo, setSaveBarDemo] = useState(false);
	const [drawerVolume, setDrawerVolume] = useState(80);
	const [menuAction, setMenuAction] = useState<string | null>(null);

	const commandItems = [
		{ id: "home", label: "홈으로 이동", icon: <Home size={16} />, group: "페이지", onSelect: () => setCmdOpen(false) },
		{ id: "shards", label: "샤드 상태", icon: <Server size={16} />, group: "페이지", onSelect: () => setCmdOpen(false) },
		{ id: "track", label: "재생 순위", icon: <RadioTower size={16} />, group: "페이지", onSelect: () => setCmdOpen(false) },
		{ id: "settings", label: "설정 열기", icon: <Settings size={16} />, group: "명령어", shortcut: "⌘,", onSelect: () => setCmdOpen(false) },
		{ id: "search", label: "검색", icon: <Search size={16} />, group: "명령어", shortcut: "⌘F", onSelect: () => setCmdOpen(false) },
	];

	return (
		<>
			<SectionHeader
				id="overlay"
				title="Overlay"
				description="모달, 드로어, 메뉴, 토스트, 커맨드 팔레트"
			/>
			<Showcase className="space-y-8">
				<ShowcaseRow label="Modal (Dialog)">
					<Dialog open={modalOpen} onOpenChange={setModalOpen}>
						<DialogTrigger render={<Button variant="ghost" size="sm">모달 열기</Button>} />
						<DialogContent>
							<DialogHeader>
								<DialogTitle>설정 저장</DialogTitle>
								<DialogDescription>변경된 서버 설정을 저장하시겠어요? 이 작업은 즉시 적용됩니다.</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
									취소
								</Button>
								<Button size="sm" onClick={() => setModalOpen(false)}>
									저장하기
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</ShowcaseRow>

				<ShowcaseRow label="Drawer (Sheet)">
					<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
						<SheetTrigger render={<Button variant="ghost" size="sm">드로어 열기</Button>} />
						<SheetContent>
							<SheetHeader>
								<SheetTitle>서버 설정</SheetTitle>
								<SheetDescription>서버 설정 내용이 여기에 표시됩니다.</SheetDescription>
							</SheetHeader>
							<div className="space-y-6 px-4">
								<Switch checked disabled={false} label="자동 DJ 모드" />
								<Switch checked={false} label="24시간 재생" />
								<Slider value={drawerVolume} onChange={setDrawerVolume} label="기본 볼륨" showValue formatValue={(v) => `${v}%`} />
							</div>
							<SheetFooter>
								<Button size="sm" onClick={() => setSheetOpen(false)}>
									닫기
								</Button>
							</SheetFooter>
						</SheetContent>
					</Sheet>
				</ShowcaseRow>

				<ShowcaseRow label="DropdownMenu">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button variant="secondary" size="sm" icon={<ChevronDown size={14} />}>
									메뉴
								</Button>
							}
						/>
						<DropdownMenuContent>
							<DropdownMenuGroup>
								<DropdownMenuLabel>일반</DropdownMenuLabel>
								<DropdownMenuItem onClick={() => setMenuAction("서버 설정")}>
									<Settings size={14} />
									서버 설정
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setMenuAction("멤버 관리")}>
									<Users size={14} />
									멤버 관리
								</DropdownMenuItem>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem variant="destructive" onClick={() => setMenuAction("서버 나가기")}>
									<Trash2 size={14} />
									서버 나가기
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
					<p className="w-full text-xs text-muted-foreground">
						{menuAction ? `${menuAction} 항목을 선택했어요.` : "메뉴 항목을 선택하면 여기에 표시돼요."}
					</p>
				</ShowcaseRow>

				<ShowcaseRow label="Select">
					<Select value={selectValue} onValueChange={(value) => setSelectValue(value ?? "")}>
						<SelectTrigger className="w-56">
							<SelectValue placeholder="언어 선택" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectLabel>아시아</SelectLabel>
								<SelectItem value="kr">한국어</SelectItem>
								<SelectItem value="jp">日本語</SelectItem>
							</SelectGroup>
							<SelectGroup>
								<SelectLabel>유럽</SelectLabel>
								<SelectItem value="en">English</SelectItem>
								<SelectItem value="de">Deutsch</SelectItem>
								<SelectItem value="fr">Français</SelectItem>
							</SelectGroup>
						</SelectContent>
					</Select>
				</ShowcaseRow>

				<ShowcaseRow label="Command dialog">
					<Button variant="ghost" size="sm" icon={<Command size={14} />} onClick={() => setCmdOpen(true)}>
						커맨드 팔레트 열기
					</Button>
					<CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
						<CommandInput placeholder="명령어 검색..." />
						<CommandList>
							<CommandEmpty>결과가 없어요</CommandEmpty>
							{["페이지", "명령어"].map((group) => (
								<CommandGroup key={group} heading={group}>
									{commandItems
										.filter((item) => item.group === group)
										.map((item) => (
											<CommandItem key={item.id} onSelect={item.onSelect}>
												<span className="inline-flex items-center gap-2">
													{item.icon}
													{item.label}
												</span>
												{item.shortcut && <span className="text-xs text-muted-foreground">{item.shortcut}</span>}
											</CommandItem>
										))}
								</CommandGroup>
							))}
							</CommandList>
						</CommandDialog>
					</ShowcaseRow>

				<ShowcaseRow label="SaveBar (설정 저장 바)" block>
					<div className="space-y-3">
						<div className="flex gap-2">
							<Button variant="secondary" size="sm" onClick={() => setSaveBarDemo(true)}>
								저장 바 보기
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setSaveBarDemo(false)}>
								숨기기
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							실제 설정 페이지에서는 저장하지 않은 변경이 있을 때 화면 하단에 플로팅으로 떠요.
						</p>
					</div>
					<SaveBar dirty={saveBarDemo} saving={false} onSave={() => setSaveBarDemo(false)} />
				</ShowcaseRow>

				<ToastDemo />
			</Showcase>
		</>
	);
}
