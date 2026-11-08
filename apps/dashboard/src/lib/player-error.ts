export function playerErrorMessage(message: string | null | undefined, fallback: string): string {
  return message?.trim() || fallback;
}
