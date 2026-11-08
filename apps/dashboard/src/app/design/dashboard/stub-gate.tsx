"use client";

import { type ReactNode,useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";

import { installGuildStub } from "@/lib/stub/guild-stub";

const STUB_SESSION = {
	user: { id: "1", name: "데모 관리자", image: null },
	expires: "2999-01-01T00:00:00.000Z"
};

/** fetch 스텁을 설치하고, 가짜 세션을 직접 주입한 SessionProvider 안에서만 자식을 렌더해요 */
export function StubGate({ children }: { children: ReactNode }) {
	const [installed, setInstalled] = useState(false);

	useEffect(() => {
		const restore = installGuildStub();
		setInstalled(true);
		return restore;
	}, []);

	return installed ? <SessionProvider session={STUB_SESSION} refetchOnWindowFocus={false}>{children}</SessionProvider> : null;
}
