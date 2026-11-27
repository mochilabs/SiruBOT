export function cleanYoutubeTitle(title: string): string {
	return title.replace(/\s*[\(\[][Oo]fficial\s*([Mm]usic\s*)?[Vv]ideo[\)\]]\s*/g, "");
}
