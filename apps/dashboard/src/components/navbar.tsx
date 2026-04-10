"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Music, Sun, Moon, Menu, X, LogOut } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import Image from "next/image";

export function Navbar() {
	const { data: session, status } = useSession();
	const pathname = usePathname();
	const { theme, setTheme } = useTheme();
	const [scrolled, setScrolled] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	useEffect(() => setMounted(true), []);

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 20);
		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	const toggleTheme = () => {
		if (!document.startViewTransition) {
			setTheme(theme === "dark" ? "light" : "dark");
			return;
		}

		document.startViewTransition(() => {
			setTheme(theme === "dark" ? "light" : "dark");
		});
	};

	const navLinks = [
		{ label: "기능", href: "/#features" },
		{ label: "상태", href: "/shards" },
		{ label: "차트", href: "/track" },
		{ label: "서버", href: "/servers" },
	];

	return (
		<div
			className={`fixed top-0 left-0 right-0 z-50 flex flex-col transition-all duration-300 border-b ${
				scrolled || mobileMenuOpen
					? "bg-background/40 backdrop-blur-3xl border-border shadow-lg" 
					: "bg-transparent border-transparent"
			}`}
		>
			<nav className="w-full h-[10vh] flex items-center shrink-0">
			<div className="w-full max-w-7xl mx-auto px-6 lg:px-20 xl:px-6 2xl:px-0 items-center">
				<div className="flex items-center justify-between">
					{/* Logo */}
					<Link href="/" className="flex items-center gap-3 group">
						<div className={`relative transition-all duration-300 ${scrolled ? "scale-90" : "scale-100"}`}>
							<Music size={28} className="text-primary relative z-10" />
						</div>
						<span className="text-2xl font-black tracking-tighter bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
							시루봇
						</span>
					</Link>

					<div className="flex items-center gap-2 lg:gap-4">
						{/* Desktop Menu */}
						<div className="hidden md:flex items-center gap-1 lg:gap-2">
							{navLinks.map((link) => (
								<Link
									key={link.label}
									href={link.href}
									className={`px-4 py-2 rounded-xl text-sm lg:text-base font-medium transition-all duration-300 ${
										pathname === link.href 
											? "bg-primary/10 text-primary shadow-sm" 
											: "text-foreground/70 hover:bg-white/5 hover:text-primary"
									} hover:scale-[1.05] active:scale-[0.95]`}
								>
									{link.label}
								</Link>
							))}
						</div>
						
						{/* divider */}
						<div className="hidden md:block w-px h-6 bg-white/10"></div>
						
						{/* Action Buttons */}
						<div className="flex items-center gap-2">
							{mounted && (
								<button
									onClick={toggleTheme}
									className="relative flex items-center justify-center w-11 h-11 rounded-xl glass-overlay text-foreground/70 hover:text-primary hover:border-primary/30 transition-all duration-300 overflow-hidden group"
								>
									<AnimatePresence mode="wait" initial={false}>
										<motion.div
											key={theme}
											initial={{ y: 20, x: -10, rotate: -90, opacity: 0 }}
											animate={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
											exit={{ y: -20, x: 10, rotate: 90, opacity: 0 }}
											transition={{ 
												type: "spring", 
												stiffness: 260, 
												damping: 20 
											}}
											className="flex items-center justify-center pointer-events-none"
										>
											{theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
										</motion.div>
									</AnimatePresence>
								</button>
							)}
							
							<div className="hidden md:flex items-center gap-2">
								{status === "authenticated" ? (
									<div className="flex items-center gap-1 pl-2 border-l border-white/10">
										<div className="flex items-center gap-2 px-1">
											<Image
												width={32}
												height={32} 
												src={session.user?.image || ""} 
												alt={session.user?.name || "User"} 
												className="w-8 h-8 rounded-full border border-primary/20"
											/>
											<span className="hidden lg:block text-sm font-bold text-foreground/80 pl-1">
												{session.user?.name}
											</span>
										</div>
										<button 
											onClick={() => signOut()}
											className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-red-500/10 text-foreground/70 hover:text-red-500"
											title="로그아웃"
										>
											<LogOut size={18} />
										</button>
									</div>
								) : (
									<button 
										onClick={() => signIn("discord")}
										className="h-11 px-6 flex items-center justify-center glass-overlay text-foreground/80 text-sm font-bold rounded-xl hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-scale duration-300"
									>
										디스코드로 로그인
									</button>
								)}
							</div>

							<button
								className="md:hidden p-2.5 rounded-xl glass-overlay text-foreground/70"
								onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
							>
								{mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
							</button>
						</div>
					</div>
				</div>
			</div>
		</nav>

			{/* Mobile Menu */}
			<AnimatePresence>
				{mobileMenuOpen && (
					<motion.div
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
									href={link.href}
									onClick={() => setMobileMenuOpen(false)}
									className="flex items-center justify-between py-3 text-lg font-bold text-foreground/80 hover:text-primary transition-all"
								>
									{link.label}
									<Music size={14} className="text-primary/40" />
								</Link>
							))}
							<div className="pt-4 border-t border-white/10">
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
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
