/** 곡 제목에서 "Official Music Video" 같은 부가 표기를 제거해요 */
export function cleanYoutubeTitle(title: string): string {
	return title.replace(/\s*[\(\[][Oo]fficial\s*([Mm]usic\s*)?[Vv]ideo[\)\]]\s*/g, "");
}
