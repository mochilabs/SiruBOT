import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "디자인 시스템",
  description: "시루봇 대시보드의 디자인 토큰과 UI 컴포넌트를 확인해요.",
  robots: { index: false },
};

export default function DesignLayout({ children }: { children: ReactNode }) {
  return children;
}
