import { useEffect, useRef, useState } from "react";

interface RecordingWaveformProps {
  stream: MediaStream | null;
}

const MAX_BARS = 32;
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 24;
const SAMPLE_INTERVAL_MS = 70; // how often a new bar is pushed in

export default function RecordingWaveform({ stream }: RecordingWaveformProps) {
  const [levels, setLevels] = useState<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Attack/release envelope — this is the actual fix. The old version
  // scaled loudness relative to a rolling "peak" that only ever decayed,
  // so one loud syllable pulled the ceiling up and every bar after that
  // looked maxed out (the flat, uniform bars you're seeing). This version
  // just tracks instantaneous loudness directly: it jumps up FAST when
  // sound hits (attack) and eases back down SLOWLY (release), which is
  // the classic VU-meter behavior that makes WhatsApp/Instagram bars feel
  // reactive and alive instead of flat or laggy.
  const smoothedRef = useRef(0);

  useEffect(() => {
    if (!stream) {
      setLevels([]);
      smoothedRef.current = 0;
      return;
    }

    const AudioContextCtor =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext: AudioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;

    let lastSampleAt = 0;

    function tick(timestamp: number) {
      rafRef.current = requestAnimationFrame(tick);
      if (timestamp - lastSampleAt < SAMPLE_INTERVAL_MS) return;
      lastSampleAt = timestamp;

      const analyserNode = analyserRef.current;
      const dataArray = dataArrayRef.current;
      if (!analyserNode || !dataArray) return;

      analyserNode.getByteTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);

      // Absolute loudness, NOT relative to a rolling ceiling — this is
      // what keeps quiet words short and loud words tall instead of
      // everything converging to "tall" over time.
      const amplitude = Math.min(1, rms * 7);
      // Soft curve: lifts quiet-but-audible speech off the floor a bit
      // without letting genuinely loud moments get flattened.
      const shaped = Math.pow(amplitude, 0.6);

      const prev = smoothedRef.current;
      const smoothed =
        shaped > prev
          ? prev + (shaped - prev) * 0.65 // fast attack — snaps up almost instantly
          : prev + (shaped - prev) * 0.2; // slower release — eases back down
      smoothedRef.current = smoothed;

      // A touch of organic per-bar texture, scaled by the level itself —
      // silence stays calm, sustained loud speech gets a little natural
      // "wobble" instead of looking like a flat plateau of identical bars.
      const jitter = 1 + (Math.random() - 0.5) * 0.3 * smoothed;
      const level = Math.max(0.04, Math.min(1, smoothed * jitter));

      setLevels((prev) => {
        const next = [...prev, level];
        if (next.length > MAX_BARS) next.shift();
        return next;
      });
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
    };
  }, [stream]);

  return (
    <div className="flex h-6 flex-1 items-center gap-[3px] overflow-hidden">
      {levels.map((level, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full bg-whispr-coral transition-[height] duration-100 ease-out dark:bg-whispr-petal"
          style={{
            height: `${MIN_BAR_HEIGHT + level * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT)}px`,
          }}
        />
      ))}
    </div>
  );
}
