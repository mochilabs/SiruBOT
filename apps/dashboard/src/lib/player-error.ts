export function playerErrorMessage(message: string | null | undefined, fallback: string): string {
  return message?.replace(/<#\d+>/g, "다른 음성 채널")
    .replace(/\s{2,}/g, " ").trim() || fallback;
}
