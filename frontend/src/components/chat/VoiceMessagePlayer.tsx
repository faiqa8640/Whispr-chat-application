import { useEffect, useMemo, useRef, useState } from "react";

interface VoiceMessagePlayerProps {
  /** Signed S3 URL, or the temporary local-stream URL while a voice
   *  message is still mid-upload. Can change mid-session (see the
   *  messageEdited subscription in ChatWindow) — the player keeps
   *  playing smoothly through that swap instead of restarting. */
  url: string;
  /** Duration hint from the server (seconds). Falls back to whatever
   *  the browser reports once the audio's metadata loads. */
  duration: number | null;
  /** "mine" = sent bubble (coral/crimson gradient), "theirs" = received
   *  bubble (white / dark charcoal) — controls the color scheme. */
  variant: "mine" | "theirs";
  /** Anything stable per-message (message id works great) — used to
   *  deterministically generate the waveform so it doesn't reshuffle
   *  on every re-render. */
  seed: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const BAR_COUNT = 28;
const SPEEDS = [1, 1.5, 2] as const;

// Small deterministic PRNG so the same message always renders the same
// "waveform" shape instead of looking different on every render/reload.
function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return () => {
    h = (h * 1664525 + 1013904223) | 0;
    return ((h >>> 0) % 1000) / 1000;
  };
}

function generateWaveform(seed: string, count = BAR_COUNT) {
  const rand = seededRandom(seed || "voice");
  const raw: number[] = [];
  for (let i = 0; i < count; i++) raw.push(0.25 + rand() * 0.9);
  // Light smoothing so it doesn't look like pure noise — averages each
  // bar with its neighbors, WhatsApp/Instagram-style rolling waveform.
  return raw.map((v, i) => {
    const prev = raw[i - 1] ?? v;
    const next = raw[i + 1] ?? v;
    return (prev + v + next) / 3;
  });
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function VoiceMessagePlayer({ url, duration, variant, seed }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [total, setTotal] = useState(duration && duration > 0 ? duration : 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);

  // Skeleton loading state — WhatsApp-style: a disabled play button,
  // flat grey shimmering bars, and a duration placeholder show until the
  // audio has enough data to actually play. Tracked with a ref alongside
  // the state so that once we've been ready once, a later `url` swap
  // (local temp stream -> permanent S3 link, see the effect below) never
  // flips this back to the skeleton and causes an ugly flash — that swap
  // already resumes playback in place, it doesn't need a loading state.
  const [isReady, setIsReady] = useState(false);
  const hasBeenReadyRef = useRef(false);

  const bars = useMemo(() => generateWaveform(seed), [seed]);
  const mine = variant === "mine";

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const markReady = () => {
      hasBeenReadyRef.current = true;
      setIsReady(true);
    };

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setTotal(audio.duration);
      markReady();
    };
    const onCanPlay = () => markReady();
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    // Already buffered enough before this effect even attached its
    // listeners (e.g. served from browser cache) — don't wait for an
    // event that already happened.
    if (audio.readyState >= 1) markReady();

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The URL can flip from the local temp stream to the permanent S3 link
  // once background upload finishes — reload the source but keep playing
  // from the same position instead of restarting from 0.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const wasPlaying = !audio.paused;
    const resumeAt = audio.currentTime;
    audio.load();
    if (resumeAt > 0) audio.currentTime = resumeAt;
    audio.playbackRate = SPEEDS[speedIndex];
    if (wasPlaying) audio.play().catch(() => {});
    // If we've already shown the real UI once, keep showing it through
    // this swap instead of flashing back to the skeleton.
    if (hasBeenReadyRef.current) setIsReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !isReady) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = SPEEDS[speedIndex];
      audio.play().catch(() => {});
      setIsPlaying(true);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!isReady) return;
    const audio = audioRef.current;
    const el = waveformRef.current;
    if (!audio || !el || !total) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setCurrentTime(ratio * total);
  }

  function cycleSpeed(e: React.MouseEvent) {
    e.stopPropagation();
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    setIsDownloading(true);
    try {
      const filename = `whispr-voice-${Date.now()}.webm`;
      const proxyUrl = `${API_BASE}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
      const res = await fetch(proxyUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed.");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Silent — a failed voice-note download isn't worth a modal/toast;
      // the person can just tap the icon again.
    } finally {
      setIsDownloading(false);
    }
  }

  const progress = total > 0 ? Math.min(1, currentTime / total) : 0;
  // While playing, show the live counter ticking down/up-ish (current
  // position); at rest, just show the total length — Instagram-style,
  // no "0:00 / 0:02" clutter.
  const displayTime = isPlaying || currentTime > 0 ? currentTime : total;

  return (
    <div className="flex w-[218px] max-w-full items-center gap-2">
      <audio ref={audioRef} src={url} preload="metadata" />

      {/* Play / pause — disabled + muted while loading */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={!isReady}
        aria-label={!isReady ? "Loading voice message" : isPlaying ? "Pause voice message" : "Play voice message"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${
          !isReady
            ? mine
              ? "bg-white/25 text-white/60"
              : "bg-whispr-linen text-whispr-mauve/50 dark:bg-whispr-onyx dark:text-whispr-fog/40"
            : mine
            ? "bg-white text-whispr-crimson hover:bg-white/90"
            : "bg-gradient-to-br from-whispr-coral to-whispr-crimson text-white hover:brightness-110"
        }`}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4.5" height="16" rx="1.5" />
            <rect x="13.5" y="4" width="4.5" height="16" rx="1.5" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="ml-0.5">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {isReady ? (
        <>
          {/* Waveform */}
          <div
            ref={waveformRef}
            onClick={handleSeek}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(currentTime)}
            className="flex h-6 flex-1 cursor-pointer items-center gap-[2px]"
          >
            {bars.map((h, i) => {
              const barPos = (i + 0.5) / bars.length;
              const played = barPos <= progress;
              return (
                <span
                  key={i}
                  className="w-[2px] shrink-0 rounded-full transition-[background-color] duration-150"
                  style={{
                    height: `${Math.max(3, h * 18)}px`,
                    backgroundColor: mine
                      ? played
                        ? "#FFFFFF"
                        : "rgba(255,255,255,0.38)"
                      : played
                      ? "#A06CD5"
                      : "rgba(160,108,213,0.3)",
                  }}
                />
              );
            })}
          </div>

          {/* Duration / speed */}
          {isPlaying ? (
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label="Change playback speed"
              className={`shrink-0 rounded-full px-1.5 py-[1px] text-center font-body text-[10px] font-bold leading-[15px] transition active:scale-95 ${
                mine
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-whispr-linen text-whispr-coral hover:bg-whispr-petal dark:bg-whispr-onyx dark:text-whispr-petal dark:hover:bg-whispr-ash"
              }`}
            >
              {SPEEDS[speedIndex]}x
            </button>
          ) : (
            <span
              className={`shrink-0 font-body text-[10.5px] tabular-nums ${
                mine ? "text-white/80" : "text-whispr-mauve dark:text-whispr-fog"
              }`}
            >
              {formatTime(displayTime)}
            </span>
          )}

          {/* Download */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            aria-label="Download voice message"
            className={`flex h-4 w-4 shrink-0 items-center justify-center transition disabled:opacity-50 ${
              mine
                ? "text-white/75 hover:text-white"
                : "text-whispr-mauve hover:text-whispr-coral dark:text-whispr-fog dark:hover:text-whispr-petal"
            }`}
          >
            {isDownloading ? (
              <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3v11.5m0 0l-3.5-3.5M12 14.5l3.5-3.5M5 18h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </>
      ) : (
        <>
          {/* Waveform skeleton — straight flat bars with a shimmer sweep,
              same color language as the real bars but muted/neutral so
              it reads as "loading" rather than "quiet audio". */}
          <div className="relative flex h-6 flex-1 items-center gap-[2px] overflow-hidden">
            {Array.from({ length: BAR_COUNT }).map((_, i) => (
              <span
                key={i}
                className={`h-[7px] w-[2px] shrink-0 rounded-full ${
                  mine ? "bg-white/25" : "bg-whispr-mauve/20 dark:bg-whispr-fog/20"
                }`}
              />
            ))}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent to-transparent ${
                mine ? "via-white/50" : "via-white/70 dark:via-white/15"
              }`}
            />
          </div>

          {/* Duration placeholder */}
          <span
            className={`h-2.5 w-6 shrink-0 animate-pulse rounded-full ${
              mine ? "bg-white/25" : "bg-whispr-mauve/20 dark:bg-whispr-fog/20"
            }`}
          />
        </>
      )}
    </div>
  );
}
