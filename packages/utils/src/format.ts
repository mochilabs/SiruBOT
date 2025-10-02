import {
  EMOJI_VOLUME_MUTE,
  EMOJI_VOLUME_SMALL,
  EMOJI_VOLUME_LARGE,
  EMOJI_VOLUME_MEDIUM,
  PROGRESS_BAR_BLACK,
  PROGRESS_BAR_EMOJI_COUNT,
  PROGRESS_BAR_END_BLACK,
  PROGRESS_BAR_END_MIDDLE_WHITE,
  PROGRESS_BAR_END_WHITE,
  PROGRESS_BAR_START_BLACK,
  PROGRESS_BAR_START_SINGLE_WHITE,
  PROGRESS_BAR_START_WHITE,
  PROGRESS_BAR_WHITE,
} from "./constants";
import { Track } from "lavalink-client";
import { formatTime, formatTimeToKorean } from "./time";

const EMOJI_KEYCAP_REGEX = /[\u0023-\u0039]\ufe0f?\u20e3/g;
const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const EMOJI_COMPONENT_REGEX = /\p{Emoji_Component}/gu;
const DIGIT_SYMBOL_REGEX = /[\d*#]/;

export function emojiProgressBar(percent: number): string {
  if (percent < 0 || percent > 1) {
    throw new Error("Percent must be between 0 and 1");
  }

  const p = Math.floor(percent * PROGRESS_BAR_EMOJI_COUNT);
  const progressParts: string[] = [];

  if (p === 0) {
    progressParts.push(PROGRESS_BAR_START_BLACK);
  } else if (p === 1) {
    progressParts.push(PROGRESS_BAR_START_SINGLE_WHITE);
  } else {
    progressParts.push(PROGRESS_BAR_START_WHITE);
  }

  for (let i = 1; i < PROGRESS_BAR_EMOJI_COUNT - 1; i++) {
    if (p > i) {
      progressParts.push(
        p - 1 === i
          ? p === PROGRESS_BAR_EMOJI_COUNT - 1
            ? PROGRESS_BAR_WHITE
            : PROGRESS_BAR_END_MIDDLE_WHITE
          : PROGRESS_BAR_WHITE,
      );
    } else {
      progressParts.push(PROGRESS_BAR_BLACK);
    }
  }

  // 끝 부분 처리
  if (p >= PROGRESS_BAR_EMOJI_COUNT) {
    progressParts.push(PROGRESS_BAR_END_WHITE);
  } else {
    progressParts.push(PROGRESS_BAR_END_BLACK);
  }

  return progressParts.join("");
}

export function getRequesterText(track: Track): string {
  const requesterId = (track.requester as any).id;
  return requesterId ? ` | 신청자: <@${requesterId}>` : "";
}

export function removeEmojis(str: string): string {
  if (!str) return str;

  EMOJI_KEYCAP_REGEX.lastIndex = 0;
  EMOJI_REGEX.lastIndex = 0;
  EMOJI_COMPONENT_REGEX.lastIndex = 0;

  let result = str;

  result = result.replace(EMOJI_KEYCAP_REGEX, "");
  result = result.replace(EMOJI_REGEX, "");
  const emojiComponents = result.match(EMOJI_COMPONENT_REGEX);
  if (emojiComponents) {
    for (const component of emojiComponents) {
      if (!DIGIT_SYMBOL_REGEX.test(component)) {
        result = result.replace(component, "");
      }
    }
  }

  return result.trim();
}

export function volumeToEmoji(volume: number): string {
  if (volume < 1) {
    return EMOJI_VOLUME_MUTE;
  } else if (volume < 33) {
    return EMOJI_VOLUME_SMALL;
  } else if (volume < 66) {
    return EMOJI_VOLUME_MEDIUM;
  } else {
    return EMOJI_VOLUME_LARGE;
  }
}

type FormatTrackOptions = {
  showLength?: boolean;
  withMarkdownURL?: boolean;
  timeType?: "seconds" | "korean";
  cleanTitle?: boolean;
};

const MAX_TRACK_URL_LENGTH = 70;
export function formatTrack(
  track: Track,
  options?: FormatTrackOptions,
): string {
  const {
    title,
    duration,
    isStream,
  }: {
    title?: string;
    duration?: number;
    isStream?: boolean;
  } = track.info;
  const { showLength, withMarkdownURL, streamString, timeType, cleanTitle } = {
    showLength: true,
    streamString: "LIVE",
    withMarkdownURL: false,
    timeType: "seconds",
    cleanTitle: false,
    ...options,
  };
  return `${withMarkdownURL && !(track.info.uri.length > MAX_TRACK_URL_LENGTH) ? "[" : ""}${cleanTitle ? removeEmojis(title.trim()) : title.trim()}${showLength ? `${duration ? (isStream ? streamString : ` [${timeType == "seconds" ? formatTime(duration / 1000) : formatTimeToKorean(duration / 1000)}]`) : "N/A"}` : ""}${withMarkdownURL && !(track.info.uri.length > MAX_TRACK_URL_LENGTH) ? "]" : ""}${withMarkdownURL ? `(${track.info.uri})` : ""}`;
}
