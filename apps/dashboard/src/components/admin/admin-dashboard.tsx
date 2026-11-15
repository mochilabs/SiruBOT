"use client";

import { useState } from "react";
import { Activity, Bell, RadioTower, Server, UserRound } from "lucide-react";

import { GuildsDataPanel } from "@/components/admin/guilds-data-panel";
import { NodesAndControlPanel } from "@/components/admin/nodes-control-panel";
import { OverviewPanel } from "@/components/admin/overview-panel";
import { SocialSubscriptionsPanel } from "@/components/admin/social-subscriptions-panel";
import { UsersDataPanel } from "@/components/admin/users-data-panel";
import { ServerFeatureSidebar } from "@/components/servers/server-feature-sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ADMIN_TABS = [
	{ key: "overview", label: "전체 현황", icon: <Activity size={16} /> },
	{ key: "nodes", label: "노드·봇 제어", icon: <RadioTower size={16} /> },
	{ key: "guilds", label: "길드 데이터", icon: <Server size={16} /> },
	{ key: "users", label: "유저·기억 데이터", icon: <UserRound size={16} /> },
	{ key: "social", label: "소셜 알림 구독", icon: <Bell size={16} /> },
] as const;

type AdminTabKey = (typeof ADMIN_TABS)[number]["key"];

export function AdminDashboard() {
	const [activeTab, setActiveTab] = useState<AdminTabKey>("overview");

	function renderActivePanel() {
		switch (activeTab) {
			case "overview":
				return <OverviewPanel />;
			case "nodes":
				return <NodesAndControlPanel />;
			case "guilds":
				return <GuildsDataPanel />;
			case "users":
				return <UsersDataPanel />;
			case "social":
				return <SocialSubscriptionsPanel />;
		}
	}

	return (
		<div className="space-y-6">
			{/* 모바일/태블릿 가로 탭 */}
			<div className="lg:hidden">
				<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminTabKey)}>
					<TabsList className="w-full justify-start overflow-x-auto scrollbar-none">
						{ADMIN_TABS.map((tab) => (
							<TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
								{tab.icon}
								<span>{tab.label}</span>
							</TabsTrigger>
						))}
					</TabsList>
					{ADMIN_TABS.map((tab) => (
						<TabsContent key={tab.key} value={tab.key} className="mt-4">
							{activeTab === tab.key ? renderActivePanel() : null}
						</TabsContent>
					))}
				</Tabs>
			</div>

			{/* 데스크톱 사이드바 + 본문 */}
			<div className="hidden lg:flex lg:items-start lg:gap-8">
				<ServerFeatureSidebar
					items={ADMIN_TABS}
					active={activeTab}
					onSelect={(key) => setActiveTab(key as AdminTabKey)}
				/>
				<div className="min-w-0 flex-1">{renderActivePanel()}</div>
			</div>
		</div>
	);
}
