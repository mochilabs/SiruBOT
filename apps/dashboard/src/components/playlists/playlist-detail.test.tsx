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
  url: "",
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
  it("행마다 위로/아래로 이동 버튼을 aria-label과 함께 두고 경계에서는 비활성화해요", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    const up = document.querySelectorAll<HTMLButtonElement>('button[aria-label="위로 이동"]');
    const down = document.querySelectorAll<HTMLButtonElement>('button[aria-label="아래로 이동"]');
    expect(up).toHaveLength(2);
    expect(down).toHaveLength(2);
    expect(up[0].disabled).toBe(true);
    expect(up[1].disabled).toBe(false);
    expect(down[0].disabled).toBe(false);
    expect(down[1].disabled).toBe(true);
  });

  it("아래로 이동을 누르면 부모가 draggedIdx를 세운 뒤 onDrop으로 재정렬을 요청해요", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    const down = document.querySelectorAll<HTMLButtonElement>('button[aria-label="아래로 이동"]')[0];
    await act(async () => { down.click(); });

    // 클릭 시점에는 부모 상태가 아직 비어 있어서 drop을 바로 부르지 않아요
    expect(dragStart).toHaveBeenCalledTimes(1);
    expect(dragStart.mock.calls[0][1]).toBe(0);
    expect(drop).not.toHaveBeenCalled();

    // 부모가 draggedIdx=0으로 다시 그린 다음 렌더에서 재정렬이 요청돼요
    await act(async () => { root.render(renderDetail(0)); });
    expect(drop).toHaveBeenCalledTimes(1);
    expect(drop.mock.calls[0][1]).toBe(1);
    expect(dragEnd).toHaveBeenCalledTimes(1);

    // 같은 draggedIdx로 그려도 한 번만 요청돼요
    await act(async () => { root.render(renderDetail(0)); });
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it("드래그 핸들이 hover 없이도 행에 보여요", async () => {
    await act(async () => { root.render(renderDetail(null)); });
    // hover로만 나타나는 group-hover 규칙이 남아 있지 않아야 해요
    expect(document.querySelectorAll('[class*="group-hover"]')).toHaveLength(0);
    const cells = document.querySelectorAll<HTMLDivElement>('div[class*="justify-center gap-1"]');
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0].querySelector("svg")).not.toBeNull();
    expect(cells[0].textContent).toContain("1");
  });
});
