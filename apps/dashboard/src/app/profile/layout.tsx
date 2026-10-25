import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "내 프로필",
  description: "Discord 프로필 정보와 시루봇 이용 통계를 확인해요.",
  robots: { index: false },
};

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
