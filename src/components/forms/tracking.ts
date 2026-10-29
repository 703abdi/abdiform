// Ad tracking on public forms: Meta Pixel and Google Tag Manager, loaded only when the form
// has an id set, never in previews, and never when the browser sends Global Privacy Control.

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[][]; loaded: boolean; version: string; push: unknown };
type Win = Window & { fbq?: Fbq; _fbq?: Fbq; dataLayer?: Record<string, unknown>[] };

export const PIXEL_ID = /^\d{6,20}$/;
export const GTM_ID = /^GTM-[A-Z0-9]{4,12}$/;

let pixel = false;
let gtm = false;

function addScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export function loadTrackers(s: { meta_pixel_id?: string; gtm_id?: string }) {
  const w = window as Win;
  if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  const pid = s.meta_pixel_id?.trim() ?? "";
  if (!pixel && PIXEL_ID.test(pid)) {
    pixel = true;
    if (!w.fbq) {
      // Meta's standard loader: queue calls until fbevents.js arrives
      const f = function (...args: unknown[]) {
        if (f.callMethod) f.callMethod(...args);
        else f.queue.push(args);
      } as Fbq;
      f.push = f;
      f.loaded = true;
      f.version = "2.0";
      f.queue = [];
      w.fbq = f;
      w._fbq = f;
      addScript("https://connect.facebook.net/en_US/fbevents.js");
    }
    w.fbq!("init", pid);
    w.fbq!("track", "PageView");
  }
  const gid = s.gtm_id?.trim().toUpperCase() ?? "";
  if (!gtm && GTM_ID.test(gid)) {
    gtm = true;
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    addScript(`https://www.googletagmanager.com/gtm.js?id=${gid}`);
  }
}

const PIXEL_EVENT = { start: ["trackCustom", "StartApplication"], submit: ["track", "Lead"], booked: ["track", "Schedule"] } as const;

/** form_view / form_start / form_submit / call_booked; Lead and Schedule are Meta's standard events. */
export function track(event: "view" | "start" | "submit" | "booked", form: string) {
  const w = window as Win;
  if (pixel && w.fbq && event !== "view") {
    const [method, name] = PIXEL_EVENT[event];
    w.fbq(method, name, { content_name: form });
  }
  if (gtm) w.dataLayer?.push({ event: event === "booked" ? "call_booked" : `form_${event}`, form_slug: form });
}
