import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProfileView, type ProfileViewProps } from "./profile-view";

vi.mock("@/components/motion/reveal", () => ({
  RevealGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RevealItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/use-count-up", () => ({ useCountUp: ({ end }: { end: number }) => ({ value: end, ref: null }) }));
vi.mock("@/components/data/stat-card", () => ({ StatCard: () => null }));
vi.mock("@/hooks/use-playlists", () => ({ formatTotalDuration: () => "0분" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("./tts-voice-card", () => ({ TtsVoiceCard: () => null }));

const props: ProfileViewProps = {
  user: { id: "fixture", name: "검증용 프로필", image: null },
  birthday: { month: 10, day: 14, zodiac: { ko: "천칭자리", code: "07" } },
  fortune: { date: "20261014", rank: 1, content: "검증용 운세", ko: "천칭자리", translated: true },
  music: { playlistCount: 0, requestedCount: 0, listenMs: 0, listenSampled: false, topTracks: [], recentTracks: [] },
  games: { rps: null, guessBest: null },
  attendance: { streak: 0, checkedInToday: false, lastDay: null },
};

describe("profile copy", () => {
  it("formats the compact fortune date as a readable Korean date", () => {
    const html = renderToStaticMarkup(<ProfileView {...props} />);
    expect(html).toContain("2026년 10월 14일 기준");
    expect(html).not.toContain("20261014 기준");
  });

  it("shows the attendance command without literal Markdown backticks", () => {
    const html = renderToStaticMarkup(<ProfileView {...props} />);
    expect(html).toContain("오늘 미출석 · /출석");
    expect(html).not.toContain("`/출석`");
  });

  it("shows the saved birthday with an edit button instead of a bot command hint", () => {
    const html = renderToStaticMarkup(<ProfileView {...props} />);
    expect(html).toContain("10월 14일 · 천칭자리");
    expect(html).toContain("수정");
    expect(html).not.toContain("/프로필 생일 등록");
  });

  it("offers registration when no birthday is saved", () => {
    const html = renderToStaticMarkup(<ProfileView {...props} birthday={{ month: null, day: null, zodiac: null }} fortune={null} />);
    expect(html).toContain("등록");
    expect(html).toContain("생일을 등록하면 오늘의 운세가 표시돼요.");
  });

  it("also formats the documented hyphenated date without leading zeroes", () => {
    const html = renderToStaticMarkup(<ProfileView {...props} fortune={{ ...props.fortune!, date: "2026-01-04" }} />);
    expect(html).toContain("2026년 1월 4일 기준");
  });
});
