/** KST(Asia/Seoul) 기준 날짜 키 — "YYYY-MM-DD". 일별 통계·출석이 KST 하루 단위로 묶는 기준이에요. */
export function kstDateString(date: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Seoul",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}