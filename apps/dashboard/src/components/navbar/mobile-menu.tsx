"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { AnimatePresence,m } from "framer-motion";
import { Music } from "lucide-react";

interface NavLink {
	label: string;
	href: string;
	requireAuth?: boolean;
}

interface MobileMenuProps {
	isOpen: boolean;
	navLinks: NavLink[];
	status: "authenticated" | "unauthenticated" | "loading";
	onClose: () => void;
}

export function MobileMenu({ isOpen, navLinks, status, onClose }: MobileMenuProps) {
	const getNavHref = (link: NavLink) => {
		if (link.requireAuth && status !== "authenticated") {
			return `/api/auth/signin?callbackUrl=${encodeURIComponent(link.href)}`;
		}
		return link.href;
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<m.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.3, ease: "easeInOut" }}
					className="relative w-full md:hidden overflow-hidden"
				>
					<div className="p-6 space-y-4">
						{navLinks.map((link) => (
							<Link
								key={link.label}
								href={getNavHref(link)}
								onClick={onClose}
								className="flex items-center justify-between py-3 text-lg font-bold text-foreground/80 hover:text-primary transition-all"
							>
								{link.label}
								<Music size={14} className="text-primary/40" />
							</Link>
						))}
						<div className="pt-4 border-t border-border">
							{status === "authenticated" ? (
								<button
									onClick={() => signOut()}
									className="flex items-center justify-center gap-2 w-full py-4 bg-red-500/10 text-red-500 font-bold rounded-2xl"
								>
									로그아웃
								</button>
							) : (
								<button
									onClick={() => signIn("discord")}
									className="flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-2xl shadow-lg shadow-primary/20"
								>
									디스코드로 로그인
								</button>
							)}
						</div>
					</div>
				</m.div>
			)}
		</AnimatePresence>
	);
}
