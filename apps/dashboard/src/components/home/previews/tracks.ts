/** 프리뷰(플레이어·보관함)가 공유하는 더미 트랙 — 실제 서비스하는 곡 데이터와 같은 형태 */
export interface PreviewTrack {
	title: string;
	artist: string;
	duration: string;
	thumbnail: string;
}

export const PLAYLIST_TRACKS: PreviewTrack[] = [
	{
		title: 'I wish I had been midnight. "Justice" MV',
		artist: "ずっと真夜中でいいのに。",
		duration: "4:40",
		thumbnail: "https://i.ytimg.com/vi/7kUbX4DoZoc/hqdefault.jpg",
	},
	{ title: "Gurenge", artist: "LiSA", duration: "3:58", thumbnail: "https://i.ytimg.com/vi/MpYy6wwqxoo/hqdefault.jpg" },
	{ title: "아이돌 (Idol)", artist: "YOASOBI", duration: "3:33", thumbnail: "https://i.ytimg.com/vi/ZRtdQ81jPUQ/hqdefault.jpg" },
	{ title: "Night Dancer", artist: "imase", duration: "3:30", thumbnail: "https://i.ytimg.com/vi/kagoEGKHZvU/hqdefault.jpg" },
	{ title: "Blinding Lights", artist: "The Weeknd", duration: "3:22", thumbnail: "https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg" },
];

/** mm:ss 문자열 → 초 (프리뷰 진행도 계산용) */
export const toSeconds = (stamp: string) => {
	const [minutes, seconds] = stamp.split(":");
	return Number(minutes) * 60 + Number(seconds);
};

/** 초 → mm:ss (한 자리 초는 0을 채워요) */
export const fmtTime = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

/** 프리뷰에서 곡을 처음부터 틀면 진행도가 몇 %에서 멈춰요 — 곡 마무리 24초만 흘려 '끝나고 다음 곡' 흐름을 보여줘요 */
export const PREVIEW_TAIL_SECONDS = 24;