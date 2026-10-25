import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "플레이리스트",
  description: "내 음악 플레이리스트를 만들고 관리해요.",
  robots: { index: false },
};

export default function PlaylistsLayout({ children }: { children: ReactNode }) {
  return children;
}
