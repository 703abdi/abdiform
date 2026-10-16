// Turns a video link into something embeddable. Only known hosts become iframes.

export type VideoEmbed = { kind: "iframe"; src: string } | { kind: "file"; src: string } | null;

export function videoEmbed(raw: string): VideoEmbed {
  const url = raw.trim();
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1)
        : u.pathname.startsWith("/embed/") || u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/live/")
          ? u.pathname.split("/")[2]
          : u.searchParams.get("v");
    return id && /^[\w-]{6,20}$/.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d+$/.test(p));
    const h = u.searchParams.get("h") ?? u.pathname.split("/").filter(Boolean).find((p, i, a) => i > 0 && /^\d+$/.test(a[i - 1]) && /^[0-9a-f]{6,}$/.test(p));
    return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}${h ? `?h=${h}` : ""}` } : null;
  }
  if (host === "loom.com") {
    const id = u.pathname.split("/").filter(Boolean)[1];
    return id && /^[0-9a-f]{20,}$/.test(id) ? { kind: "iframe", src: `https://www.loom.com/embed/${id}` } : null;
  }
  if (host.endsWith("wistia.com") || host.endsWith("wistia.net")) {
    const id = u.pathname.split("/").filter(Boolean).pop();
    return id && /^[a-z0-9]{6,}$/.test(id) ? { kind: "iframe", src: `https://fast.wistia.net/embed/iframe/${id}` } : null;
  }
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: "file", src: u.toString() };
  return null;
}
