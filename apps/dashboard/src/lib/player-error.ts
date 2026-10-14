export function playerErrorMessage(message: string | null | undefined, fallback: string): string {
  return message?.replace(/<a?:[a-zA-Z0-9_]{2,32}:\d+>/g, "")
    .replace(/<#\d+>/g, "다른 음성 채널")
    .replace(/\s{2,}/g, " ").trim() || fallback;
}
