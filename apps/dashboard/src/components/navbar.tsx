"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { AnimatePresence, m } from "framer-motion";
import { LogOut, Moon, Search, Sun, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUIStore } from "@/store/use-ui-store";

import { getNavHref, navLinks } from "./navbar/links";
import { MobileTabBar } from "./navbar/mobile-tab-bar";

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  // R-32: 열린 프로필 메뉴는 Escape로도 닫혀요 (외부 클릭과 같은 경로).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
    <>
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex flex-col border-b border-transparent transition-colors duration-base ${scrolled
          ? "bg-background/70 backdrop-blur-xl border-border-subtle shadow-sm"
          : "bg-transparent"
        }`}
    >
      <nav className="h-16 w-full shrink-0">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
              <Image
                src="/images/profile.png"
                alt="시루봇"
                fill
                className="object-cover"
              />
            </div>
            <span className="text-2xl font-black tracking-tighter text-foreground">시루봇</span>
          </Link>

          <div className="flex items-center gap-2 lg:gap-4">
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-1 lg:gap-2 relative">
              {indicator && (
                // transform x로만 이동해요 — left/width를 애니메이션하면 backdrop-blur 레이어가
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
              {navLinks.map((link, i) => (
                <Link
                  key={link.label}
                  ref={(el) => { navRefs.current[i] = el; }}
                  href={getNavHref(link, status)}
                  className={`relative px-4 py-2 rounded-menu text-sm lg:text-base font-medium transition-colors duration-fast ${pathname === link.href
                      ? "text-primary-text"
                      : "text-muted-foreground hover:bg-primary-control/5 hover:text-primary-text"
                    }`}
                >
                  <span className="relative z-10">{link.label}</span>
                </Link>
              ))}
            </div>

            {/* divider */}
            <div className="hidden md:block w-px h-6 bg-border"></div>

            {/* Action Buttons — 모바일에서는 하단 탭바가 내비를 대신하므로 액션만 남겨요 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                {/* 검색+테마 토글을 하나의 세그먼트 pill로 묶어요 — 공유 표면/경계로 한 덩어리,
                    CTA만 분리해 헤더에서 유일한 액센트가 되게 해요. 전부 h-11(44px) 정렬. */}
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
                    <kbd className="hidden lg:inline-flex h-5 items-center rounded-md bg-muted px-1.5 text-2xs font-medium text-muted-foreground">
                      ⌘K
                    </kbd>
                  </Button>
                  <div aria-hidden className="h-5 w-px bg-border" />
                  {mounted && (
                    <Button
                      variant="ghost"
                      onClick={toggleTheme}
                      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
                      className="relative h-full w-11 overflow-hidden rounded-none rounded-r-control px-0 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    >
                      <AnimatePresence mode="popLayout" initial={false}>
                        <m.span
                          key={theme}
                          initial={{ y: 20, rotate: -90, opacity: 0 }}
                          animate={{ y: 0, rotate: 0, opacity: 1 }}
                          exit={{ y: -20, rotate: 90, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        >
                          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                        </m.span>
                      </AnimatePresence>
                    </Button>
                  )}
                </div>
                {status === "authenticated" ? (
                  <div className="relative" ref={profileRef}>
                    <Button
                      variant="ghost"
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="h-auto gap-2 px-2 py-1.5 hover:bg-primary-control/5"
                    >
                      {session.user?.image && (
                        <Image
                          width={32}
                          height={32}
                          src={session.user.image}
                          alt={session.user.name || "User"}
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                      <span className="hidden lg:block text-sm font-bold text-foreground/80 pl-1">
                        {session.user?.name}
                      </span>
                    </Button>

                    <AnimatePresence>
                      {profileOpen && (
                        <m.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-menu bg-popover py-1 shadow-2xl z-50"
                        >
                          <Link
                            href="/profile"
                            onClick={() => setProfileOpen(false)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <span>내 프로필</span>
                            <User size={16} />
                          </Link>
                          <div className="h-px bg-border my-1 mx-2" />
                          <button
                            onClick={() => signOut()}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <span>로그아웃</span>
                            <LogOut size={16} />
                          </button>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : status === "loading" ? (
                  // 세션 확인 중 우측 클러스터 자리를 고정해, 로딩 후 로그인 버튼→아바타 교체 시 레이아웃 튐을 막아요
                  <Skeleton.Line width="6rem" height="h-11" className="shrink-0" />
                ) : (
                  <div className="flex items-center gap-2">
                    {/* 네비 링크 "대시보드"와의 이중 표기 방지 — CTA는 시작 동사만 남겨요 */}
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

    {/* 모바일 하단 탭바 — md 이상에서 숨겨져요 */}
    <MobileTabBar status={status} />
    </>
  );
}
