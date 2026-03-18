"use client";

import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import Link from "next/link";

export function Navbar() {
	return (
		<NavigationMenu.Root className="relative z-10 w-full bg-white border-b border-gray-200">
			<NavigationMenu.List className="flex items-center justify-between px-6 py-4">
				{/* 로고/홈 */}
				<NavigationMenu.Item>
					<NavigationMenu.Link asChild>
						<Link href="/" className="flex items-center gap-2 text-xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
							<span className="text-2xl">🎵</span>
							SiruBOT
						</Link>
					</NavigationMenu.Link>
				</NavigationMenu.Item>

				{/* 네비게이션 메뉴 */}
				<div className="flex items-center gap-1">
					<NavigationMenu.Item>
						<NavigationMenu.Link asChild>
							<Link 
								href="/" 
								className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
							>
								홈
							</Link>
						</NavigationMenu.Link>
					</NavigationMenu.Item>

					<NavigationMenu.Item>
						<NavigationMenu.Link asChild>
							<Link 
								href="/track" 
								className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
							>
								인기 곡
							</Link>
						</NavigationMenu.Link>
					</NavigationMenu.Item>

					<NavigationMenu.Item>
						<NavigationMenu.Link asChild>
							<Link 
								href="/shards" 
								className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
							>
								샤드
							</Link>
						</NavigationMenu.Link>
					</NavigationMenu.Item>

					<NavigationMenu.Item>
						<NavigationMenu.Link asChild>
							<Link 
								href="/favorites" 
								className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
							>
								즐겨찾기
							</Link>
						</NavigationMenu.Link>
					</NavigationMenu.Item>

					<NavigationMenu.Item>
						<NavigationMenu.Link asChild>
							<Link 
								href="/servers" 
								className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
							>
								서버 목록
							</Link>
						</NavigationMenu.Link>
					</NavigationMenu.Item>
				</div>
                
                {/* Auth */}
                <div className="flex items-center ml-4">
                    <AuthButton />
                </div>
			</NavigationMenu.List>
		</NavigationMenu.Root>
	);
}

import { signIn, signOut, useSession } from "next-auth/react";

function AuthButton() {
    const { data: session, status } = useSession();

    if (status === "loading") {
        return <div className="px-4 py-2 text-sm text-gray-500">로딩중...</div>;
    }

    if (session) {
        return (
            <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
            >
                로그아웃
            </button>
        );
    }

    return (
        <button
            onClick={() => signIn("discord", { callbackUrl: '/servers' })}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
        >
            Discord 로그인
        </button>
    );
}
