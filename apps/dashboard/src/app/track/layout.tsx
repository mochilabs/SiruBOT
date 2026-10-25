import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "음악 차트",
  description: "Discord에서 인기 있는 음악 차트를 확인하고 바로 재생해요.",
};

export default function TrackLayout({ children }: { children: ReactNode }) {
  return children;
}
