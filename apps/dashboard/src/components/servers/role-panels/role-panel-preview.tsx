import type {
  RolePanelButton,
  RolePanelImageLayout,
  RolePanelImagePosition,
  RolePanelMode,
} from "@sirubot/utils/rolePanel";

import type { useGuildRoles } from "@/hooks/use-guild-settings";
import { cn } from "@/lib/utils";

import { BUTTON_STYLE_META, DEFAULT_ACCENT_COLOR_HEX } from "./role-panel-meta";

/** How the panel looks once posted: a Components V2 container with the image placed per layout and position. */
export function RolePanelPreview({
  title,
  description,
  imageUrl,
  imageLayout,
  imagePosition,
  accentColor,
  mode,
  buttons,
  roles,
}: {
  title: string;
  description: string;
  imageUrl: string | null;
  imageLayout: RolePanelImageLayout;
  imagePosition: RolePanelImagePosition;
  accentColor: string | null;
  mode: RolePanelMode;
  buttons: RolePanelButton[];
  roles: ReturnType<typeof useGuildRoles>["roles"];
}) {
  const galleryPosition =
    imageUrl && imageLayout === "gallery" ? imagePosition : null;
  const galleryPreview = imageUrl ? (
    <div className="overflow-hidden rounded-control bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="패널 이미지"
        className="max-h-52 w-full object-cover"
      />
    </div>
  ) : null;

  return (
    <div className="rounded-card bg-discord-embed p-4">
  <div
          className="space-y-3 rounded-control border-l-4 bg-surface-1 p-4"
          style={{ borderColor: accentColor ?? DEFAULT_ACCENT_COLOR_HEX }}
        >
    {galleryPosition === "top" ? galleryPreview : null}
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-base font-bold text-foreground">
          {title.trim() || "역할 패널"}
        </p>
        {description.trim() ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {imageUrl && imageLayout === "thumbnail" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="패널 섬네일"
          className="h-16 w-16 shrink-0 rounded-control object-cover"
        />
      ) : null}
    </div>
    {galleryPosition === "middle" ? galleryPreview : null}
    {buttons.length > 0 ? (
      <div className="flex flex-wrap gap-1.5 pt-1">
        {buttons.map((button) => {
          const roleName =
            roles?.find((r) => r.id === button.roleId)?.name ??
            "역할 미선택";
          const labelText = button.label.trim() || roleName;
          const styleMeta =
            BUTTON_STYLE_META[button.style] ??
            BUTTON_STYLE_META.secondary;

          if (mode === "reaction") {
            return (
              <span
                key={button.id}
                className="inline-flex items-center gap-1.5 rounded-control bg-surface-2 px-2 py-1 text-xs text-foreground"
              >
                <span className="text-sm leading-none">
                  {button.emoji || "❔"}
                </span>
                <span className="text-muted-foreground">
                  {labelText}
                </span>
              </span>
            );
          }

          return (
            <span
              key={button.id}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-xs font-medium",
                styleMeta.previewClass,
              )}
            >
              {button.emoji ? (
                <span className="text-sm leading-none">
                  {button.emoji}
                </span>
              ) : null}
              <span>{labelText}</span>
            </span>
          );
        })}
      </div>
    ) : null}
    {galleryPosition === "bottom" ? galleryPreview : null}
  </div>

    </div>
  );
}
