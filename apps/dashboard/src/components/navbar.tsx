"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Menu, Moon, Music, Sun, X } from "lucide-react";

import { useUIStore } from "@/store/use-ui-store";

import { MobileMenu } from "./navbar/mobile-menu";

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const scrolled = useUIStore((s) => s.scrolled);
  const mobileMenuOpen = useUIStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useUIStore((s) => s.setMobileMenuOpen);
  const toggleMobileMenu = useUIStore((s) => s.toggleMobileMenu);
  const updateScrollState = useUIStore((s) => s.updateScrollState);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleScroll = () => updateScrollState(window.scrollY);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [updateScrollState]);

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
    // { label: "기능", href: "/#features" },
    { label: "상태", href: "/shards" },
    { label: "차트", href: "/track" },
    { label: "즐겨찾기", href: "/favorites" },
    { label: "대시보드", href: "/servers" },
  ];

  const navRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const updateIndicator = useCallback(() => {
    const activeIndex = navLinks.findIndex((l) => l.href === pathname);
    const el = activeIndex >= 0 ? navRefs.current[activeIndex] : null;
    if (el) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    } else {
      setIndicator(null);
    }
  }, [pathname]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex flex-col transition-all duration-300 border-b ${
        scrolled || mobileMenuOpen
          ? "bg-background/40 backdrop-blur-3xl border-border shadow-lg"
          : "bg-transparent border-transparent"
      }`}
    >
      <nav className="h-20 w-full shrink-0">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className={`relative transition-all duration-300 scale-100`}>
              <Music size={28} className="text-primary relative z-10" />
            </div>
            <span className="text-2xl font-black tracking-tighter bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent bg-[length:200%_auto] transition-all duration-500 group-hover:bg-[position:100%_center]">
              시루봇
            </span>
          </Link>

          <div className="flex items-center gap-2 lg:gap-4">
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-1 lg:gap-2 relative">
              {indicator && (
                <motion.div
                  className="absolute top-0 bottom-0 rounded-xl bg-primary/10 shadow-sm"
                  animate={{ left: indicator.left, width: indicator.width }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}
              {navLinks.map((link, i) => (
                <Link
                  key={link.label}
                  ref={(el) => { navRefs.current[i] = el; }}
                  href={link.href}
                  className={`relative px-4 py-2 rounded-xl text-sm lg:text-base font-medium transition-colors duration-200 ${
                    pathname === link.href
                      ? "text-primary"
                      : "text-foreground/70 hover:text-primary"
                  } hover:scale-[1.05] active:scale-[0.95] transition-transform`}
                >
                  <span className="relative z-10">{link.label}</span>
                </Link>
              ))}
            </div>

            {/* divider */}
            <div className="hidden md:block w-px h-6 bg-border"></div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {mounted && (
                <button
                  onClick={toggleTheme}
                  className="relative flex items-center justify-center w-11 h-11 rounded-xl glass-overlay text-foreground/70 hover:text-primary hover:border-primary/30 transition-all duration-300 overflow-hidden group"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={theme}
                      initial={{ y: 20, rotate: -90, opacity: 0 }}
                      animate={{ y: 0, rotate: 0, opacity: 1 }}
                      exit={{ y: -20, rotate: 90, opacity: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 25,
                      }}
                      className="absolute flex items-center justify-center pointer-events-none"
                    >
                      {theme === "dark" ? (
                        <Sun size={20} />
                      ) : (
                        <Moon size={20} />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </button>
              )}

              <div className="hidden md:flex items-center gap-2">
                {status === "authenticated" ? (
                  <div className="flex items-center gap-1 pl-2 border-l border-border">
                    <div className="flex items-center gap-2 px-1">
                      {session.user?.image && (
                        <Image
                          width={32}
                          height={32}
                          src={session.user.image}
                          alt={session.user.name || "User"}
                          className="w-8 h-8 rounded-full border border-primary/20"
                        />
                      )}
                      <span className="hidden lg:block text-sm font-bold text-foreground/80 pl-1">
                        {session.user?.name}
                      </span>
                    </div>
                    <button
                      onClick={() => signOut()}
                      className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-red-500/10 text-foreground/70 hover:text-red-500"
                      title="로그아웃하기"
                    >
                      <LogOut size={18} />
                    </button>
                  </div>
                ) : (
                  <></>
                  // <button
                  // 	onClick={() => signIn("discord")}
                  // 	className="h-11 px-6 flex items-center justify-center glass-overlay text-foreground/80 text-sm font-bold rounded-xl hover:bg-primary/10 hover:text-primary hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-scale duration-300"
                  // >
                  // 	대시보드 시작하기
                  // </button>
                )}
              </div>

              <button
                className="md:hidden p-2.5 rounded-xl glass-overlay text-foreground/70"
                onClick={toggleMobileMenu}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={mobileMenuOpen}
        navLinks={navLinks}
        status={status}
        onClose={() => setMobileMenuOpen(false)}
      />
    </div>
  );
}
