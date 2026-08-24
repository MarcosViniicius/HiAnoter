import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Gauge,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLAYBACK_SPEEDS = [0.8, 1, 1.25, 1.5, 1.75, 2];

export function Player({
  recordingId,
  duration,
}: {
  recordingId: string;
  duration: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play().catch(() => undefined);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const skipSeconds = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Math.min(totalDuration, audio.currentTime + seconds));
    audio.currentTime = target;
    setCurrentTime(target);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    audio.muted = nextMute;
  };

  const progressPct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface/90 p-4 sm:p-5 shadow-soft transition-all hover:border-line/80">
      <audio
        ref={audioRef}
        preload="metadata"
        data-player="main-recording-player"
        src={api.audioUrl(recordingId)}
      />

      {/* Scrubber track */}
      <div className="flex items-center gap-3">
        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-soft min-w-[42px]">
          {formatDuration(currentTime)}
        </span>

        <div className="relative flex-1 flex items-center h-5">
          <input
            type="range"
            min={0}
            max={totalDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            aria-label="Controle de tempo da gravação"
          />
          {/* Visual Track */}
          <div className="w-full h-2 rounded-full bg-subtle overflow-hidden relative">
            <div
              className="h-full bg-accent transition-all duration-75"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Thumb indicator */}
          <div
            className="absolute h-3.5 w-3.5 rounded-full bg-accent border-2 border-white dark:border-paper shadow-sm pointer-events-none transition-all duration-75"
            style={{ left: `calc(${progressPct}% - 7px)` }}
          />
        </div>

        <span className="shrink-0 font-mono text-xs tabular-nums text-ink-faint min-w-[42px] text-right">
          {formatDuration(totalDuration || duration)}
        </span>
      </div>

      {/* Control buttons */}
      <div className="flex items-center justify-between pt-1">
        {/* Left controls: Skip -10, Play/Pause, Skip +10 */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => skipSeconds(-10)}
            className="flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl p-2 text-ink-soft hover:bg-subtle hover:text-ink transition-colors touch-tap active:scale-95"
            title="Voltar 10 segundos"
            aria-label="Voltar 10 segundos"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="flex h-11 w-11 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-accent text-white shadow-soft hover:bg-accent-deep active:scale-95 transition-all touch-tap"
            title={isPlaying ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="h-5 w-5 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => skipSeconds(10)}
            className="flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-xl p-2 text-ink-soft hover:bg-subtle hover:text-ink transition-colors touch-tap active:scale-95"
            title="Avançar 10 segundos"
            aria-label="Avançar 10 segundos"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        {/* Right controls: Speed, Mute / Volume */}
        <div className="flex items-center gap-2 relative">
          {/* Speed Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSpeedMenu((v) => !v)}
              className="flex items-center gap-1 rounded-xl border border-line bg-surface2 px-2.5 py-1.5 font-mono text-xs font-semibold text-ink hover:bg-surface2/80 transition-colors touch-tap"
              title="Velocidade de reprodução"
            >
              <Gauge className="h-3.5 w-3.5 text-accent" />
              <span>{playbackRate}x</span>
            </button>

            {showSpeedMenu && (
              <div className="absolute right-0 bottom-full mb-2 z-20 flex flex-col rounded-xl border border-line bg-paper p-1 shadow-2xl animate-fade-in min-w-[90px]">
                {PLAYBACK_SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSpeedChange(s)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-left font-mono text-xs transition-colors",
                      playbackRate === s
                        ? "bg-accent text-white font-semibold"
                        : "text-ink-soft hover:bg-subtle hover:text-ink",
                    )}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded-xl p-2 text-ink-soft hover:bg-subtle hover:text-ink transition-colors touch-tap"
              title={isMuted ? "Desmutar" : "Mutar"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-danger-fg" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const newVol = Number(e.target.value);
                setVolume(newVol);
                setIsMuted(newVol === 0);
                if (audioRef.current) {
                  audioRef.current.volume = newVol;
                  audioRef.current.muted = newVol === 0;
                }
              }}
              className="w-16 h-1.5 accent-accent rounded-full bg-subtle cursor-pointer"
              title="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}