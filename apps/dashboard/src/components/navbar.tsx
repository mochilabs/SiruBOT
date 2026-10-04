"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { AnimatePresence, m } from "framer-motion";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { useUIStore } from "@/store/use-ui-store";

import { MobileMenu } from "./navbar/mobile-menu";

const navLinks = [
  // { label: "기능", href: "/#features" },
  { label: "상태", href: "/shards" },
  { label: "차트", href: "/track" },
  { label: "플레이리스트", href: "/playlists", requireAuth: true },
  { label: "대시보드", href: "/servers", requireAuth: true },
];

export function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const getNavHref = (link: { href: string; requireAuth?: boolean }) => {
    if (link.requireAuth && status !== "authenticated") {
      return `/api/auth/signin?callbackUrl=${encodeURIComponent(link.href)}`;
    }
    return link.href;
  };

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex flex-col transition-colors duration-base border-b ${scrolled || mobileMenuOpen
          ? "bg-background/70 backdrop-blur-xl border-border shadow-sm"
          : "bg-transparent border-transparent"
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
                <m.div
                  className="absolute top-0 bottom-0 rounded-menu bg-primary/10"
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
                  href={getNavHref(link)}
                  className={`relative px-4 py-2 rounded-menu text-sm lg:text-base font-medium transition-colors duration-fast ${pathname === link.href
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/70 hover:bg-primary/5 hover:text-primary"
                    }`}
                >
                  <span className="relative z-10">{link.label}</span>
                </Link>
              ))}
            </div>

            {/* divider */}
            <div className="hidden md:block w-px h-6 bg-border"></div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2">
                {status === "authenticated" ? (
                  <div className="relative" ref={profileRef}>
                    <Button
                      variant="ghost"
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="h-auto gap-2 px-2 py-1.5 hover:bg-primary/5"
                    >
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
                    </Button>

                    <AnimatePresence>
                      {profileOpen && (
                        <m.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-menu border border-border bg-popover py-1 shadow-2xl z-50"
                        >
                          {mounted && (
                            <button
                              onClick={toggleTheme}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              <span>{theme === "dark" ? "라이트 모드" : "다크 모드"}</span>
                              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                            </button>
                          )}
                          <div className="h-px bg-border/50 my-1 mx-2" />
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
                ) : (
                  <div className="flex items-center gap-2">
                    {mounted && (
                      <Button
                        variant="icon"
                        size="lg"
                        onClick={toggleTheme}
                        className="relative w-11 h-11 overflow-hidden group border-border-subtle bg-surface-1 hover:border-primary/30 hover:bg-surface-1 hover:text-primary duration-base"
                      >
                        <AnimatePresence mode="popLayout" initial={false}>
                          <m.div
                            key={theme}
                            initial={{ y: 20, rotate: -90, opacity: 0 }}
                            animate={{ y: 0, rotate: 0, opacity: 1 }}
                            exit={{ y: -20, rotate: 90, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className="absolute flex items-center justify-center pointer-events-none"
                          >
                            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                          </m.div>
                        </AnimatePresence>
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => signIn("discord")}
                      className="h-11 px-6 border-border-subtle bg-surface-1 font-bold text-foreground/80 hover:border-primary/30 hover:bg-primary/10 hover:text-primary duration-base"
                    >
                      대시보드 시작하기
                    </Button>
                  </div>
                )}
              </div>

              <Button
                variant="icon"
                size="md"
                className="md:hidden h-11 w-11 border-border-subtle bg-surface-1 p-2.5"
                onClick={toggleMobileMenu}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </Button>
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
