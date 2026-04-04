"use client";

import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Home,
  Music,
  Radio,
  Star,
  Server,
  Menu,
  X,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { FaDiscord } from "react-icons/fa";

const baseNavItems = [
  { href: "/", label: "홈", icon: Home },
  { href: "/track", label: "인기 곡", icon: Music },
  { href: "/favorites", label: "즐겨찾기", icon: Star },
  { href: "/servers", label: "서버", icon: Server },
];

const shardNavItem = { href: "/shards", label: "샤드", icon: Radio };

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shardMode, setShardMode] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => setShardMode(data.shardMode))
      .catch(() => setShardMode(false));
  }, []);

  const navItems = shardMode
    ? [...baseNavItems.slice(0, 2), shardNavItem, ...baseNavItems.slice(2)]
    : baseNavItems;

  return (
    <NavigationMenu.Root className="glass-nav sticky top-0 z-50 w-full">
      <NavigationMenu.List className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Logo */}
        <NavigationMenu.Item>
          <NavigationMenu.Link asChild>
            <Link href="/" className="group flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-accent)]/10 to-[var(--color-accent2)]/10 border border-[var(--color-border-accent)] transition-shadow duration-300 group-hover:shadow-md group-hover:shadow-[var(--color-accent-glow)]">
                <span className="text-lg">🎵</span>
              </div>
              <span className="gradient-text text-lg font-bold tracking-tight">
                유하리
              </span>
            </Link>
          </NavigationMenu.Link>
        </NavigationMenu.Item>

        {/* Desktop Nav — pill container */}
        <div className="hidden items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-1.5 py-1 md:flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <NavigationMenu.Item key={item.href}>
                <NavigationMenu.Link asChild>
                  <Link
                    href={item.href}
                    className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] shadow-sm"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                    }`}
                  >
                    <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} />
                    {item.label}
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Item>
            );
          })}
        </div>

        {/* Right: Auth + Mobile */}
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <AuthButton />
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-accent-subtle)] hover:text-[var(--color-text-primary)] md:hidden"
            aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </NavigationMenu.List>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="animate-slide-down border-t border-[var(--color-border)] px-4 pb-5 pt-3 md:hidden">
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-[var(--color-accent)] bg-[var(--color-accent)]/8"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                  }`}
                >
                  <Icon size={16} strokeWidth={isActive ? 2.2 : 1.6} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 border-t border-[var(--color-border)] pt-4">
            <AuthButton mobile />
          </div>
        </div>
      )}
    </NavigationMenu.Root>
  );
}

function AuthButton({ mobile = false }: { mobile?: boolean }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div
        className={`skeleton rounded-2xl ${mobile ? "h-12 w-full" : "h-9 w-28"}`}
      />
    );
  }

  if (session) {
    if (mobile) {
      return (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-3 p-3.5">
            <UserAvatar
              image={session.user?.image}
              name={session.user?.name}
              size={40}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                {session.user?.name}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Discord 연결됨
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-error)]/20 hover:bg-[var(--color-error)]/6 hover:text-[var(--color-error)]"
              aria-label="로그아웃"
            >
              <LogOut size={13} />
              로그아웃
            </button>
          </div>
        </div>
      );
    }

    return <UserDropdown session={session} />;
  }

  return (
    <button
      onClick={() => signIn("discord", { callbackUrl: "/servers" })}
      className={`group flex items-center justify-center gap-2 rounded-full border border-[var(--color-accent2)]/15 bg-gradient-to-r from-[var(--color-accent2)]/10 to-[var(--color-accent)]/10 py-2 text-sm font-medium text-[var(--color-accent2)] transition-all duration-300 hover:from-[var(--color-accent2)]/18 hover:to-[var(--color-accent)]/18 hover:text-[var(--color-accent2-hover)] hover:shadow-md hover:shadow-[var(--color-accent2-glow)] hover:border-[var(--color-accent2)]/25 ${mobile ? "w-full px-4" : "px-4"}`}
      aria-label="Discord로 시작"
    >
      <FaDiscord
        size={16}
        className="transition-transform duration-300 group-hover:scale-110"
      />
      <span>Discord로 시작</span>
    </button>
  );
}

/* ── Avatar helper ── */
function UserAvatar({
  image,
  name,
  size = 28,
}: {
  image?: string | null;
  name?: string | null;
  size?: number;
}) {
  return (
    <div className="relative">
      {image ? (
        <Image
          src={image}
          alt=""
          width={size}
          height={size}
          className="rounded-full ring-[1.5px] ring-[var(--color-accent)]/20"
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-accent)]/15 to-[var(--color-accent2)]/15 font-bold text-[var(--color-accent)]"
          style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
          {name?.charAt(0) ?? "?"}
        </div>
      )}
      <span
        className="absolute -bottom-px -right-px rounded-full border-[1.5px] border-[var(--color-bg-primary)] bg-[var(--color-success)]"
        style={{ width: size * 0.3, height: size * 0.3 }}
      />
    </div>
  );
}

/* ── Dropdown for logged-in user ── */
import type { Session } from "next-auth";

function UserDropdown({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] py-1 pl-1 pr-2.5 transition-all duration-200 hover:border-[var(--color-border-hover)]"
        aria-label="사용자 메뉴 토글"
        aria-expanded={open}
      >
        <UserAvatar
          image={session.user?.image}
          name={session.user?.name}
          size={28}
        />
        <span className="hidden max-w-[100px] truncate text-[13px] font-medium text-[var(--color-text-secondary)] lg:block">
          {session.user?.name}
        </span>
        <ChevronDown
          size={13}
          className={`text-[var(--color-text-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Menu */}
          <div className="animate-slide-down absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-xl shadow-black/20">
            {/* User info header */}
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                {session.user?.name}
              </p>
              {session.user?.email && (
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">
                  {session.user.email}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="p-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/" });
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-error)]/6 hover:text-[var(--color-error)]"
                aria-label="로그아웃"
              >
                <LogOut size={15} />
                로그아웃
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
