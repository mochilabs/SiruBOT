"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { AnimatePresence, m } from "framer-motion";
import { LogOut, Moon, Search, ShieldCheck, Sun, User } from "lucide-react";

import { motionFast } from "@/components/motion/durations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUIStore } from "@/store/use-ui-store";

import { getNavHref, navLinks } from "./navbar/links";
import { MobileTabBar } from "./navbar/mobile-tab-bar";

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const hideTabBar = /^\/(servers\/[^/]+|design\/dashboard)/.test(pathname);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-tabbar-off", hideTabBar);
    return () => document.documentElement.removeAttribute("data-tabbar-off");
  }, [hideTabBar]);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const currentTheme = resolvedTheme ?? theme;
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);

  const scrolled = useUIStore((s) => s.scrolled);
  const updateScrollState = useUIStore((s) => s.updateScrollState);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handleScroll = () => updateScrollState(window.scrollY);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [updateScrollState]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && profileOpen) {
        setProfileOpen(false);
        profileTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [profileOpen]);

  const toggleTheme = () => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) {
      setTheme(nextTheme);
      return;
    }

    document.startViewTransition(() => {
      setTheme(nextTheme);
    });
  };

  const navContainerRef = useRef<HTMLDivElement>(null);
  const navRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const isActiveLink = useCallback(
    (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)),
    [pathname],
  );

  const updateIndicator = useCallback(() => {
    const activeIndex = navLinks.findIndex((l) => isActiveLink(l.href));
    const el = activeIndex >= 0 ? navRefs.current[activeIndex] : null;
    if (el) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    } else {
      setIndicator(null);
    }
  }, [isActiveLink]);

  useEffect(() => {
    updateIndicator();
    const container = navContainerRef.current;
    const observer = container ? new ResizeObserver(updateIndicator) : null;
    if (container && observer) observer.observe(container);
    window.addEventListener("resize", updateIndicator);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [updateIndicator]);

  return (
    <>
    <div
      className={`sticky top-0 z-(--z-overlay) flex flex-col border-b border-transparent transition-colors duration-base ${scrolled
          ? "bg-background border-border-subtle shadow-sm"
          : "bg-transparent"
        }`}
    >
      <nav className="h-[var(--navbar-h)] w-full shrink-0">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2 group">
            <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
              <Image
                src="/images/siru-profile.png"
                alt="시루봇"
                fill
                sizes="32px"
                className="object-cover"
              />
            </div>
            <span className="text-2xl font-extrabold tracking-tighter text-foreground">시루봇</span>
          </Link>

          <div className="flex flex-1 items-center gap-2 lg:gap-4">
            <div ref={navContainerRef} className="relative ml-6 hidden md:flex items-center gap-1 lg:ml-8 lg:gap-2">
              {indicator && (
                // transform x로만 이동해요 — left/width를 애니메이션하면 레이어가
                // 매 프레임 재계산되며 텍스트가 세로로 겹쳐 보이는 잔상이 생겨요
                <m.div
                  className="absolute top-0 bottom-0 left-0 rounded-menu bg-primary-control/10 will-change-transform"
                  initial={false}
                  animate={{ x: indicator.left, width: indicator.width }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}
              {navLinks.map((link, i) => {
                const active = isActiveLink(link.href);
                return (
                <Link
                  key={link.label}
                  ref={(el) => { navRefs.current[i] = el; }}
                  href={getNavHref(link, status)}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-3.5 py-2 rounded-menu text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active
                      ? "text-primary-text"
                      : "text-muted-foreground hover:bg-primary-control/5 hover:text-primary-text"
                    }`}
                >
                  <span className="relative z-10">{link.label}</span>
                </Link>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-11 items-center overflow-hidden rounded-control bg-surface-1 shadow-control-boundary">
                  <Button
                    variant="ghost"
                    onClick={() => setCommandPaletteOpen(true)}
                    title="명령 팔레트 (⌘K)"
                    aria-label="명령 팔레트 열기"
                    className="h-full gap-2 rounded-none rounded-l-control px-3 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  >
                    <Search size={16} />
                    <span className="hidden lg:inline text-sm">검색</span>
                    <kbd className="hidden lg:inline-flex h-5 items-center rounded-control-inner bg-muted px-1.5 text-2xs font-medium text-muted-foreground">
                      ⌘K
                    </kbd>
                  </Button>
                  <div aria-hidden className="h-5 w-px bg-border" />
                  {/* 하이드레이션 전에도 44px 자리를 미리 그려 토글이 나중에 튀어오르지 않게 해요.
                      테마 아이콘은 localStorage 읽기 전에 확정할 수 없으니 mounted 전엔 비활성화. */}
                  <Button
                    variant="ghost"
                    onClick={toggleTheme}
                    disabled={!mounted}
                    aria-label={mounted ? (currentTheme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환") : "테마 전환"}
                    className="relative h-full w-11 overflow-hidden rounded-none rounded-r-control px-0 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  >
                    {mounted && (
                      <AnimatePresence mode="popLayout" initial={false}>
                        <m.span
                          key={currentTheme}
                          initial={{ y: 20, rotate: -90, opacity: 0 }}
                          animate={{ y: 0, rotate: 0, opacity: 1 }}
                          exit={{ y: -20, rotate: 90, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        >
                          {currentTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                        </m.span>
                      </AnimatePresence>
                    )}
                  </Button>
                </div>
                {status === "authenticated" ? (
                  <div className="relative" ref={profileRef}>
                    <Button
                      ref={profileTriggerRef}
                      variant="ghost"
                      onClick={() => setProfileOpen(!profileOpen)}
                      aria-expanded={profileOpen}
                      aria-haspopup="menu"
                      className="h-auto gap-2 px-2 py-1.5 hover:bg-primary-control/5"
                    >
                      {session.user?.image ? (
                        <Image
                          width={32}
                          height={32}
                          src={session.user.image}
                          alt={session.user.name || "User"}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-muted-foreground"
                        >
                          {(session.user?.name || "U").slice(0, 1)}
                        </span>
                      )}
                      <span className="hidden lg:block text-sm font-bold text-foreground/80 pl-1">
                        {session.user?.name}
                      </span>
                    </Button>

                    <AnimatePresence>
                      {profileOpen && (
                        <m.div
                          role="menu"
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: motionFast }}
                          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-menu bg-popover py-1 shadow-2xl z-(--z-overlay)"
                        >
                          <Link
                            role="menuitem"
                            href="/profile"
                            onClick={() => setProfileOpen(false)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-fast"
                          >
                            <span>내 프로필</span>
                            <User size={16} />
                          </Link>
                          {session.user?.isAdmin && (
                            <Link
                              role="menuitem"
                              href="/admin"
                              onClick={() => setProfileOpen(false)}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-fast"
                            >
                              <span>관리자 패널</span>
                              <ShieldCheck size={16} />
                            </Link>
                          )}
                          <div className="h-px bg-border my-1 mx-2" />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => signOut()}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-fast"
                          >
                            <span>로그아웃</span>
                            <LogOut size={16} />
                          </button>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : status === "loading" ? (
                  <Skeleton.Line width="6rem" height="h-11" className="shrink-0" />
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => signIn("discord")}
                      className="h-11 px-4 sm:px-6 bg-surface-1 font-bold text-foreground/80 hover:bg-primary-control/10 hover:text-primary-text duration-base"
                    >
                      시작하기
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </div>

    {!hideTabBar && <MobileTabBar status={status} />}
    </>
  );
}
