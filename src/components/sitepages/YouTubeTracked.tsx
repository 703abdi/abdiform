"use client";

// A YouTube embed that reports how much of the video has actually been watched.
// "Watched %" counts the distinct parts played (1% slices), so skipping to the end doesn't count.

import { useEffect, useRef } from "react";

type YTPlayer = { getCurrentTime(): number; getDuration(): number; destroy(): void };
type YTNamespace = { Player: new (el: HTMLIFrameElement, opts: { events: { onStateChange: (e: { data: number }) => void } }) => YTPlayer };

let ytReady: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  ytReady ??= new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT!);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return ytReady;
}

const MILESTONES = [0, 25, 50, 75, 90, 100];

export function YouTubeTracked({ src, title, onProgress }: { src: string; title: string; onProgress: (pct: number, seconds: number) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const report = useRef(onProgress);
  useEffect(() => {
    report.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let player: YTPlayer | null = null;
    let tick: ReturnType<typeof setInterval> | null = null;
    let dead = false;
    const seen = new Set<number>(); // 1% slices that have been played
    let watchedSeconds = 0;
    let lastT = -1;
    let reported = -1;

    const pctNow = () => seen.size;
    const flush = (force = false) => {
      const p = pctNow();
      const next = [...MILESTONES].reverse().find((m) => p >= m) ?? 0;
      if (force ? p > reported : next > reported) {
        reported = force ? p : next;
        report.current(reported, watchedSeconds);
      }
    };

    loadYouTubeApi().then((YT) => {
      if (dead) return;
      player = new YT.Player(el, {
        events: {
          onStateChange: (e) => {
            if (e.data === 1) {
              // playing
              if (reported < 0) {
                reported = 0;
                report.current(0, 0);
              }
              if (!tick)
                tick = setInterval(() => {
                  if (!player) return;
                  const d = player.getDuration();
                  const t = player.getCurrentTime();
                  if (!(d > 0)) return;
                  // only count continuous playback, not jumps
                  if (lastT >= 0 && t > lastT && t - lastT < 3) {
                    watchedSeconds += t - lastT;
                    for (let s = Math.floor((lastT / d) * 100); s <= Math.floor((t / d) * 100); s++) seen.add(Math.min(99, s));
                  }
                  lastT = t;
                  if (d - t < 1.5) seen.add(99);
                  flush();
                }, 1000);
            } else {
              lastT = -1;
              if (tick) {
                clearInterval(tick);
                tick = null;
              }
              if (e.data === 0) {
                // ended
                flush(true);
              } else if (e.data === 2) flush(true); // paused: save exact progress
            }
          },
        },
      });
    });
    const onHide = () => document.visibilityState === "hidden" && flush(true);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onHide);
      if (tick) clearInterval(tick);
      try {
        player?.destroy();
      } catch {
        // already gone
      }
    };
  }, [src]);

  return <iframe ref={ref} src={src} title={title} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen />;
}
