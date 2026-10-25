import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인",
  description: "Discord로 시루봇 대시보드에 로그인해요.",
  robots: { index: false },
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
