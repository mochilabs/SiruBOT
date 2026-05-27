"use client";

import { createContext, useContext, useState } from "react";
import { m } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ─────────────────────────── types ─────────────────────────── */

interface SidebarContextValue {
	collapsed: boolean;
	setCollapsed: (v: boolean) => void;
	toggle: () => void;
}

interface SidebarProps {
	defaultCollapsed?: boolean;
	children: React.ReactNode;
	className?: string;
}

interface SidebarItemProps {
	icon: React.ReactNode;
	label: string;
	active?: boolean;
	badge?: string | number;
	onClick?: () => void;
	className?: string;
}

interface SidebarGroupProps {
	label?: string;
	children: React.ReactNode;
}

interface SidebarSectionProps {
	children: React.ReactNode;
	className?: string;
}

/* ─────────────────────────── context ─────────────────────────── */

const SidebarContext = createContext<SidebarContextValue>({
	collapsed: false,
	setCollapsed: () => {},
	toggle: () => {},
});

export function useSidebar() {
	return useContext(SidebarContext);
}

/* ─────────────────────────── sub-components ─────────────────────────── */

export function SidebarHeader({ children, className = "" }: SidebarSectionProps) {
	return (
		<div className={`px-4 py-4 border-b border-border/40 shrink-0 ${className}`}>
			{children}
		</div>
	);
}

export function SidebarContent({ children, className = "" }: SidebarSectionProps) {
	return (
		<div className={`flex-1 overflow-y-auto px-3 py-3 space-y-1 ${className}`}>
			{children}
		</div>
	);
}

export function SidebarFooter({ children, className = "" }: SidebarSectionProps) {
	return (
		<div className={`px-4 py-4 border-t border-border/40 shrink-0 ${className}`}>
			{children}
		</div>
	);
}

export function SidebarGroup({ label, children }: SidebarGroupProps) {
	const { collapsed } = useSidebar();

	return (
		<div className="space-y-1">
			{label && !collapsed && (
				<p className="px-3 py-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground/40">
					{label}
				</p>
			)}
			{label && collapsed && (
				<div className="mx-auto my-2 h-px w-6 bg-border/40" />
			)}
			{children}
		</div>
	);
}

export function SidebarItem({
	icon,
	label,
	active = false,
	badge,
	onClick,
	className = "",
}: SidebarItemProps) {
	const { collapsed } = useSidebar();

	return (
		<button
			type="button"
			onClick={onClick}
			title={collapsed ? label : undefined}
			className={`
				w-full flex items-center gap-3 rounded-xl transition-all duration-200 cursor-pointer relative
				${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"}
				${active
					? "bg-primary/10 text-primary font-bold"
					: "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
				}
				${className}
			`}
		>
			{/* Active indicator bar */}
			{active && (
				<m.span
					layoutId="sidebar-active"
					className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary"
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
				/>
			)}

			<span className="shrink-0 h-5 w-5 flex items-center justify-center">
				{icon}
			</span>

			{!collapsed && (
				<>
					<span className="flex-1 text-left text-sm font-medium truncate">
						{label}
					</span>
					{badge !== undefined && (
						<span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/10 text-xs font-black text-primary">
							{badge}
						</span>
					)}
				</>
			)}
		</button>
	);
}

export function SidebarToggle() {
	const { collapsed, toggle } = useSidebar();

	return (
		<button
			type="button"
			onClick={toggle}
			className="p-2 rounded-xl hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
			aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
		>
			{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
		</button>
	);
}

/* ─────────────────────────── main component ─────────────────────────── */

export function Sidebar({
	defaultCollapsed = false,
	children,
	className = "",
}: SidebarProps) {
	const [collapsed, setCollapsed] = useState(defaultCollapsed);
	const toggle = () => setCollapsed((v) => !v);

	return (
		<SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
			<m.aside
				animate={{ width: collapsed ? 64 : 256 }}
				transition={{ type: "spring", stiffness: 400, damping: 35 }}
				className={`
					h-full flex flex-col bg-card border-r border-border shrink-0 overflow-hidden
					${className}
				`}
			>
				{children}
			</m.aside>
		</SidebarContext.Provider>
	);
}

/* ─────────────────────────── compound export ─────────────────────────── */

Sidebar.Header = SidebarHeader;
Sidebar.Content = SidebarContent;
Sidebar.Footer = SidebarFooter;
Sidebar.Group = SidebarGroup;
Sidebar.Item = SidebarItem;
Sidebar.Toggle = SidebarToggle;
