import type {
  RolePanelButton,
  RolePanelImageLayout,
  RolePanelImagePosition,
  RolePanelMode,
} from "@sirubot/utils/rolePanel";

export interface RolePanelWithButtons {
  id: string;
  guildId: string;
  name: string;
  title: string;
  description: string;
  imageUrl: string | null;
  imageLayout: RolePanelImageLayout;
  imagePosition: RolePanelImagePosition;
  accentColor: string | null;
  mode: RolePanelMode;
  clickCount: number;
  channelId: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
  buttons: RolePanelButton[];
}


export const MODE_LABELS: Record<RolePanelMode, string> = {
  button: "버튼 (클릭해서 받기)",
  reaction: "반응 (이모지로 받기)",
};

export const IMAGE_LAYOUT_LABELS: Record<RolePanelImageLayout, string> = {
  gallery: "미디어 갤러리 (큰 이미지)",
  thumbnail: "섬네일 (제목·안내문 옆)",
};

export const IMAGE_POSITION_LABELS: Record<RolePanelImagePosition, string> = {
  top: "제목 위",
  middle: "안내문 아래",
  bottom: "버튼 아래",
};

export const DEFAULT_ACCENT_COLOR_HEX = "#ffdaff";

export const BUTTON_STYLES = ["secondary", "primary", "success", "danger"] as const;

export const BUTTON_STYLE_META: Record<
  RolePanelButton["style"],
  { label: string; dotClass: string; previewClass: string }
> = {
  secondary: {
    label: "회색 (기본)",
    dotClass: "bg-muted-foreground/70",
    previewClass: "bg-surface-3 text-foreground",
  },
  primary: {
    label: "파랑 (강조)",
    dotClass: "bg-[#5865F2]",
    previewClass: "bg-[#5865F2] text-white",
  },
  success: {
    label: "초록 (긍정)",
    dotClass: "bg-success",
    previewClass: "bg-success text-white",
  },
  danger: {
    label: "빨강 (주의)",
    dotClass: "bg-destructive",
    previewClass: "bg-destructive text-destructive-foreground",
  },
};
