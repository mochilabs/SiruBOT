import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "봇 관리자 패널",
	description: "시루봇 운영자 전용 데이터·노드·인프라 제어 패널이에요.",
	robots: { index: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
	return children;
}
