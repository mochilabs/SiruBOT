import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "서버 관리",
  description: "시루봇을 사용 중인 Discord 서버를 선택해 관리해요.",
  robots: { index: false },
};

export default function ServersLayout({ children }: { children: ReactNode }) {
  return children;
}
