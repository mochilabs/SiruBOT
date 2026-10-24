// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type Virtualizer } from "@tanstack/react-virtual";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Playlist, Track } from "@/types/playlist";

import { PlaylistDetail } from "./playlist-detail";

const tracks: Track[] = [0, 1].map((position) => ({
  id: `track-${position}`,
  title: `곡 ${position + 1}`,
  artist: "아티스트",
  duration: 180000,
  thumbnail: null,
  url: "https://youtube.com/watch?v=test",
  source: "youtube",
  playlistTrackId: `pt-${position}`,
  position,
  addedAt: "2026-01-01T00:00:00.000Z",
}));

const activePlaylist: Playlist = {
  id: "playlist-1",
  name: "테스트 플레이리스트",
  description: null,
  isPublic: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const rowVirtualizer = {
  getVirtualItems: () => [
    { index: 0, start: 0, size: 56 },
    { index: 1, start: 56, size: 56 },
  ],
  getTotalSize: () => 112,
  getVirtualItemForOffset: (offset: number) =>
    offset < 56 ? { index: 0 } : { index: 1 },
} as unknown as Virtualizer<HTMLDivElement, Element>;

const dragStart = vi.fn();
const drop = vi.fn();
const dragEnd = vi.fn();

let root: Root;
let host: HTMLDivElement;

function renderDetail(draggedIdx: number | null) {
  return (
    <PlaylistDetail
      activePlaylist={activePlaylist}
      tracks={tracks}
      detailLoading={false}
      stats={{ count: tracks.length, duration: 360000 }}
      formatTotalDuration={(ms) => `${ms}ms`}
      onOpenEdit={() => {}}
      onOpenDelete={() => {}}
      onOpenAddTrack={() => {}}
      onRemoveTrack={() => {}}
      draggedIdx={draggedIdx}
      onDragStart={dragStart}
      onDragOver={() => {}}
      onDrop={drop}
      onDragEnd={dragEnd}
      parentRef={{ current: null }}
      rowVirtualizer={rowVirtualizer}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dragStart.mockReset();
  drop.mockReset();
  dragEnd.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
});

describe("플레이리스트 트랙 키보드 재정렬", () => {
  it("위로/아래로 이동 버튼이 없어요 (드래그/키보드로 대체)", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    expect(document.querySelectorAll('button[aria-label="위로 이동"]')).toHaveLength(0);
    expect(document.querySelectorAll('button[aria-label="아래로 이동"]')).toHaveLength(0);
  });

  it("Alt+ArrowDown을 누르면 부모가 draggedIdx를 세운 뒤 onDrop으로 재정렬을 요청해요", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    const rows = document.querySelectorAll<HTMLDivElement>('[role="listitem"]');
    const firstRow = rows[0];
    await act(async () => {
      firstRow.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
      );
    });

    expect(dragStart).toHaveBeenCalledTimes(1);
    expect(dragStart.mock.calls[0][1]).toBe(0);
    expect(drop).not.toHaveBeenCalled();

    await act(async () => { root.render(renderDetail(0)); });
    expect(drop).toHaveBeenCalledTimes(1);
    expect(drop.mock.calls[0][1]).toBe(1);
    expect(dragEnd).toHaveBeenCalledTimes(1);

    await act(async () => { root.render(renderDetail(0)); });
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it("Alt+ArrowUp/Alt+ArrowDown을 경계에서는 무시해요", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    const rows = document.querySelectorAll<HTMLDivElement>('[role="listitem"]');
    await act(async () => {
      rows[0].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }),
      );
      rows[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
      );
    });
    expect(dragStart).not.toHaveBeenCalled();
    expect(drop).not.toHaveBeenCalled();
  });

  it("트랙 제목이 원본 URL 링크로 렌더돼요", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href="https://youtube.com/watch?v=test"]');
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[0].textContent).toContain("곡 1");
  });

  it("드래그 핸들이 hover 없이도 행에 보여요", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    expect(document.querySelectorAll('[class*="group-hover"]')).toHaveLength(0);
    const handles = document.querySelectorAll('svg[class*="cursor-grab"]');
    expect(handles.length).toBe(2);
  });
});
