import type { CSSProperties } from "react";

// Names = files in /public/icons (original Figma SVGs, unedited; drag.svg, moon.svg, truck.svg and upload.svg were added,
// not from Figma).
export type IconName =
  | "activity" | "active" | "add" | "add-circle" | "arrow-right" | "assign" | "bitcoin-card"
  | "calculator" | "calendar" | "caret-down" | "close" | "calendar-pending" | "calendar-remove" | "call" | "chart"
  | "colorfilter" | "converted" | "converted-value" | "delete" | "dollar-circle" | "download" | "drag"
  | "edit" | "element-4" | "eye" | "filter" | "followup" | "followups-nav" | "global"
  | "location" | "logout" | "loss" | "mail" | "mark" | "moon" | "more" | "note" | "notification-bing"
  | "profile-2user" | "profile-tick" | "reminder" | "search" | "setting" | "settings-nav"
  | "shopping-bag" | "sun" | "team" | "truck" | "upload" | "user-square" | "user-tick" | "warning" | "won";

export function Icon({ name, size = 24, className = "", style }: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`icon ${className}`}
      style={{ width: size, height: size, "--icon": `url(/icons/${name}.svg)`, ...style } as CSSProperties}
    />
  );
}
