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

export const toSeconds = (stamp: string) => {
	const [minutes, seconds] = stamp.split(":");
	return Number(minutes) * 60 + Number(seconds);
};

export const fmtTime = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

export const PREVIEW_TAIL_SECONDS = 24;