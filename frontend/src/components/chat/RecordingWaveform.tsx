import { useEffect, useRef, useState } from "react";
// useState → stores data.
// useRef → stores values without re-rendering.
// useEffect → runs code after rendering.


// Defines the props this component receives.
// it except a microphone stream  or  null
interface RecordingWaveformProps { 
  stream: MediaStream | null;
}

const MAX_BARS = 32;//Maximum number of waveform bars to display.
const MIN_BAR_HEIGHT = 3;//Smallest height of a waveform bar (3px).
const MAX_BAR_HEIGHT = 24;//Largest height of a waveform bar (24px).
const SAMPLE_INTERVAL_MS = 70; // how often a new bar is pushed in
// Every 70 milliseconds, create a new waveform bar.

export default function RecordingWaveform({ stream }: RecordingWaveformProps) {
  // this componenet receieve the microphone stream as a prop
  const [levels, setLevels] = useState<number[]>([]);
  // Stores the heights of all waveform bars.
  const audioContextRef = useRef<AudioContext | null>(null);
  // Stores the AudioContext. and it survive the rerender 
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Stores the AnalyserNode. => this analyse the microphone  audio
  const rafRef = useRef<number | null>(null);
  // Stores the ID returned by requestAnimationFrame().=> use to stop the animation later
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  // Stores the audio sample data.

  // Attack/release envelope — this is the actual fix. The old version
  // scaled loudness relative to a rolling "peak" that only ever decayed,
  // so one loud syllable pulled the ceiling up and every bar after that
  // looked maxed out (the flat, uniform bars you're seeing). This version
  // just tracks instantaneous loudness directly: it jumps up FAST when
  // sound hits (attack) and eases back down SLOWLY (release), which is
  // the classic VU-meter behavior that makes WhatsApp/Instagram bars feel
  // reactive and alive instead of flat or laggy.
  const smoothedRef = useRef(0);//Stores the smoothed loudness value.

  useEffect(() => {//it runs whenever the stream chnages 
    if (!stream) {//Checks whether there is a microphone stream.
      setLevels([]);//Clears the waveform.
      smoothedRef.current = 0;//Resets the loudness.
      return;
    }

    const AudioContextCtor =//Gets the browser's AudioContext.=> is a lib use to understand the audio
      window.AudioContext || (window as any).webkitAudioContext;
      // modern browser || old safari browswer
    if (!AudioContextCtor) return;

    // Creates a new audio processing environment.
    const audioContext: AudioContext = new AudioContextCtor();
    // Connects the microphone stream to the audio system.
    const source = audioContext.createMediaStreamSource(stream);

    const analyser = audioContext.createAnalyser();
    // Creates an analyzer.=>  and its job is to measure the sound 
    analyser.fftSize = 1024;//Sets how much audio data is analyzed each time.
    analyser.smoothingTimeConstant = 0.35;//Smooths sudden changes. and waves looks smother
    source.connect(analyser);//Connects the microphone to the analyzer.

    audioContextRef.current = audioContext;//Save the AudioContext.
    analyserRef.current = analyser;//Save the analyzer.
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    // Create an array to hold audio samples.

    let lastSampleAt = 0;//Remembers when the last waveform bar was created.

    // Runs repeatedly (about 60 times every second).as 60 milisec 
    function tick(timestamp: number) {
      // Schedule the next animation frame.
      rafRef.current = requestAnimationFrame(tick);
      // Don't create a new bar too quickly.
      if (timestamp - lastSampleAt < SAMPLE_INTERVAL_MS) return;
      lastSampleAt = timestamp;//Save the current time.

      const analyserNode = analyserRef.current;//Get the analyzer.
      const dataArray = dataArrayRef.current;//Get the audio data array.
      if (!analyserNode || !dataArray) return;

      analyserNode.getByteTimeDomainData(dataArray);////Fill the array with microphone sound samples.

      let sumSquares = 0;//Variable used to calculate loudness.
      for (let i = 0; i < dataArray.length; i++) {//Loop through every audio sample.
        // Convert values into a range around 0.
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;//Square each sample and add it.
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);//Calculate the RMS.

      // Absolute loudness, NOT relative to a rolling ceiling — this is
      // what keeps quiet words short and loud words tall instead of
      // everything converging to "tall" over time.
      const amplitude = Math.min(1, rms * 7);
      // Convert loudness into a value between 0 and 1.
      // Soft curve: lifts quiet-but-audible speech off the floor a bit
      // without letting genuinely loud moments get flattened.
      const shaped = Math.pow(amplitude, 0.6);//Make quiet sounds a little more visible.


      // This makes the waveform feel natural.________
      const prev = smoothedRef.current;//Get the previous loudness.
      const smoothed =//alculate a smoother loudness.
        shaped > prev
        // If sound became louder...raise quickly
          ? prev + (shaped - prev) * 0.65 // fast attack — snaps up almost instantly
          // If sound became quite...fall quickly
          : prev + (shaped - prev) * 0.2; // slower release — eases back down
      smoothedRef.current = smoothed;//saved the smoth sound 

      // A touch of organic per-bar texture, scaled by the level itself —
      // silence stays calm, sustained loud speech gets a little natural
      // "wobble" instead of looking like a flat plateau of identical bars.

      // Add a tiny random variation.=> looks more nautural => basically it add ups and down
      const jitter = 1 + (Math.random() - 0.5) * 0.3 * smoothed;
      // Final waveform height (between 0 and 1).
      const level = Math.max(0.04, Math.min(1, smoothed * jitter));


      // Update the waveform bars.
      setLevels((prev) => {
        const next = [...prev, level];//Add the newest bar.
        if (next.length > MAX_BARS) next.shift();//If there are too many bars remove the oldest one
        return next;// 
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
