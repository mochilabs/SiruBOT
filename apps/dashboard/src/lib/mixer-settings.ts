type MixerTogglePatch = { crossfadeEnabled?: boolean; automixEnabled?: boolean };

export function normalizeMixerToggles<T extends MixerTogglePatch>(patch: T): T & MixerTogglePatch {
  if (patch.crossfadeEnabled === false) return { ...patch, automixEnabled: false };
  if (patch.automixEnabled === true) return { ...patch, crossfadeEnabled: true };
  return patch;
}

export const MIXER_SETTING_KEYS = [
  "gaplessEnabled", "crossfadeEnabled", "crossfadeMs", "normalizationEnabled",
  "automixEnabled", "automixMaxTempoChange", "automixMinConfidence",
];
