// Labels for the Performance filters (safe to import in client components).

export type Device = "desktop" | "mobile" | "tablet";
export type RangeKey = "all" | "today" | "7d" | "30d" | "90d" | "365d";
export type DeviceKey = "all" | Device;

export const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
};
export const DEVICE_LABELS: Record<DeviceKey, string> = { all: "All devices", desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };
