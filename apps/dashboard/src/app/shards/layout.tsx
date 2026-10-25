import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "서버 상태",
  description: "시루봇의 샤드·보이스 서버 실시간 상태를 확인해요.",
  robots: { index: false },
};

export default function ShardsLayout({ children }: { children: ReactNode }) {
  return children;
}
