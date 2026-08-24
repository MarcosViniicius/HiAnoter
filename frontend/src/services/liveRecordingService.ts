/**
 * Singleton service for continuous background audio recording.
 * Features:
 * - MediaRecorder with timeslice chunking
 * - AudioContext Analyser for real-time volume/waveform levels
 * - MediaSession API for OS lockscreen and notification center controls
 * - Screen WakeLock API to prevent CPU throttling
 * - IndexedDB backup to protect recorded audio against crashes/refreshes
 */

export type LiveRecordingStatus = "idle" | "starting" | "recording" | "paused" | "finishing";

export interface LiveRecordingEventMap {
  statusChange: LiveRecordingStatus;
  durationChange: number;
  volumeChange: number;
  error: string;
}

class LiveRecordingService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private wakeLock: any = null;
  private chunks: Blob[] = [];
  private elapsedSeconds = 0;
  private timerInterval: number | null = null;
  private animationFrameId: number | null = null;
  private status: LiveRecordingStatus = "idle";
  private listeners: { [K in keyof LiveRecordingEventMap]?: Array<(data: any) => void> } = {};

  // Silent audio element to keep MediaSession & background active
  private silentAudio: HTMLAudioElement | null = null;

  constructor() {
    this.initIndexedDB().catch(() => {});
  }

  // --- Event Subscription ---
  public on<K extends keyof LiveRecordingEventMap>(event: K, cb: (data: LiveRecordingEventMap[K]) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(cb);
    return () => this.off(event, cb);
  }

  public off<K extends keyof LiveRecordingEventMap>(event: K, cb: (data: LiveRecordingEventMap[K]) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter((fn) => fn !== cb);
  }

  private emit<K extends keyof LiveRecordingEventMap>(event: K, data: LiveRecordingEventMap[K]) {
    this.listeners[event]?.forEach((fn) => fn(data));
  }

  public getStatus(): LiveRecordingStatus {
    return this.status;
  }

  public getDuration(): number {
    return this.elapsedSeconds;
  }

  // --- IndexedDB Helper ---
  private dbPromise: Promise<IDBDatabase> | null = null;

  private initIndexedDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        return reject("IndexedDB not supported");
      }
      const req = window.indexedDB.open("hinoter_live_db", 1);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("chunks")) {
          db.createObjectStore("chunks", { autoIncrement: true });
        }
      };
      req.onsuccess = (e: any) => resolve(e.target.result);
      req.onerror = (e) => reject(e);
    });
    return this.dbPromise;
  }

  private async saveChunkToDB(chunk: Blob) {
    try {
      const db = await this.initIndexedDB();
      const tx = db.transaction("chunks", "readwrite");
      tx.objectStore("chunks").add(chunk);
    } catch {
      // IndexedDB fallback silent
    }
  }

  private async clearDBChunks() {
    try {
      const db = await this.initIndexedDB();
      const tx = db.transaction("chunks", "readwrite");
      tx.objectStore("chunks").clear();
    } catch {}
  }

  // --- MediaSession & WakeLock ---
  private initSilentAudio() {
    if (this.silentAudio) return;
    try {
      // 1-second silent WAV base64
      const silentWav =
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      this.silentAudio = new Audio(silentWav);
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.001;
    } catch {}
  }

  private setupMediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Gravação Contínua em Andamento",
        artist: "HiNoter-Lite",
        album: "Sessão de Áudio ao Vivo",
      });

      navigator.mediaSession.playbackState = "playing";

      navigator.mediaSession.setActionHandler("pause", () => {
        this.pause();
      });

      navigator.mediaSession.setActionHandler("play", () => {
        this.resume();
      });

      navigator.mediaSession.setActionHandler("stop", () => {
        this.stop();
      });
    } catch {}
  }

  private async requestWakeLock() {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      this.wakeLock = await (navigator as any).wakeLock.request("screen");
    } catch {}
  }

  private releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
    }
  }

  // Cancellation token — set to true by cancel() to abort an in-flight start()
  private startAborted = false;
  private recordingStartTime = 0;
  private accumulatedSeconds = 0;

  // --- Start Recording ---
  public async start(deviceId?: string): Promise<void> {
    if (this.status === "recording" || this.status === "paused") {
      return;
    }

    // Pre-validation: check secure context & browser support
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.protocol === "https:");

    if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      const msg = !isLocalhost
        ? "A captura de áudio no navegador exige HTTPS ou localhost. Verifique se o endereço é seguro."
        : "Seu navegador (ou configurações do Brave Shields) bloqueou o acesso ao microfone. Verifique as permissões do site.";
      this.emit("error", msg);
      throw new Error(msg);
    }

    this.startAborted = false;
    this.status = "starting";
    this.emit("statusChange", "starting");
    this.elapsedSeconds = 0;
    this.accumulatedSeconds = 0;
    this.recordingStartTime = 0;
    this.emit("durationChange", 0);

    try {
      this.chunks = [];
      void this.clearDBChunks();

      // Check permissions proactively if supported by browser
      if (typeof navigator !== "undefined" && navigator.permissions && navigator.permissions.query) {
        try {
          const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (perm.state === "denied") {
            throw new Error(
              "Permissão do microfone bloqueada no navegador. Clique no ícone de cadeado ou escudo do Brave na barra de endereço (ao lado de localhost:8000) e altere Microfone para 'Permitir'.",
            );
          }
        } catch (e: any) {
          if (e.message?.includes("bloqueada")) throw e;
        }
      }

      // 1. Get user media stream directly (instantaneous native browser prompt)
      let stream: MediaStream | null = null;
      try {
        const constraints: MediaStreamConstraints = deviceId
          ? { audio: { deviceId: { ideal: deviceId } } }
          : { audio: true };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        if (deviceId && !this.startAborted) {
          // Fallback to generic audio
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw err;
        }
      }

      if (!stream) {
        throw new Error("Falha ao obter fluxo de áudio do microfone.");
      }

      // Check if cancel() was called while we were waiting for permission
      if (this.startAborted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      this.mediaStream = stream;

      // 2. Setup MediaRecorder with cross-browser mime fallback
      let recorderOptions: MediaRecorderOptions = {};
      if (typeof MediaRecorder !== "undefined") {
        for (const m of [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/ogg;codecs=opus",
          "audio/mp4",
          "audio/aac",
        ]) {
          try {
            if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
              recorderOptions = { mimeType: m };
              break;
            }
          } catch {}
        }
      }

      try {
        this.mediaRecorder = new MediaRecorder(this.mediaStream, recorderOptions);
      } catch {
        // Fallback without mime options
        this.mediaRecorder = new MediaRecorder(this.mediaStream);
      }

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
          this.saveChunkToDB(e.data);
        }
      };

      this.mediaRecorder.onerror = (e) => {
        console.error("[MediaRecorder error]", e);
      };

      // Start capturing 1-second chunks
      this.mediaRecorder.start(1000);

      // 3. IMMEDIATELY transition to RECORDING status
      this.status = "recording";
      this.emit("statusChange", "recording");
      this.startTimer();
      this.emit("durationChange", 0);

      // 4. Audio Context Volume Monitoring (isolated & non-blocking)
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          if (!this.audioContext || this.audioContext.state === "closed") {
            this.audioContext = new AudioCtx();
          }
          if (this.audioContext.state === "suspended") {
            void this.audioContext.resume();
          }
          const source = this.audioContext.createMediaStreamSource(this.mediaStream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);
          this.startVolumeMonitoring();
        }
      } catch {
        // Volume visualizer is optional — don't break recording
      }

      // 5. Background services (all optional)
      try { this.initSilentAudio(); this.silentAudio?.play().catch(() => {}); } catch {}
      try { this.setupMediaSession(); } catch {}
      try { void this.requestWakeLock(); } catch {}
    } catch (err: any) {
      if (this.startAborted) return;

      this.cleanup();
      this.status = "idle";
      this.emit("statusChange", "idle");
      const msg =
        err.name === "NotAllowedError" || err.name === "PermissionDeniedError"
          ? "Permissão do microfone negada. Clique no ícone de cadeado/escudo do Brave na barra de endereço e autorize o microfone."
          : err.name === "NotFoundError" || err.name === "DevicesNotFoundError"
          ? "Nenhum microfone encontrado. Conecte um microfone e tente novamente."
          : err.name === "OverconstrainedError"
          ? "Configuração de microfone incompatível com o dispositivo. Tentando modo padrão."
          : err.message?.includes("timed out")
          ? "Tempo esgotado aguardando autorização do microfone no navegador. Autorize o microfone e tente novamente."
          : `Erro ao acessar microfone: ${err.message || err.name || "Falha desconhecida"}`;
      this.emit("error", msg);
      throw new Error(msg);
    }
  }

  public pause(): void {
    if (this.status !== "recording" || !this.mediaRecorder) return;
    try {
      this.mediaRecorder.pause();
      if (this.audioContext && this.audioContext.state === "running") {
        this.audioContext.suspend();
      }
      this.stopTimer();
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      this.status = "paused";
      this.emit("statusChange", "paused");
    } catch {}
  }

  public resume(): void {
    if (this.status !== "paused" || !this.mediaRecorder) return;
    try {
      this.mediaRecorder.resume();
      if (this.audioContext && this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }
      this.startTimer();
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      this.status = "recording";
      this.emit("statusChange", "recording");
    } catch {}
  }

  public async stop(): Promise<File | null> {
    if (this.status === "idle") return null;

    this.status = "finishing";
    this.emit("statusChange", "finishing");
    this.stopTimer();
    this.stopVolumeMonitoring();

    return new Promise<File | null>((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        const file = this.compileAudioFile();
        this.cleanup();
        resolve(file);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const file = this.compileAudioFile();
        this.cleanup();
        resolve(file);
      };

      try {
        this.mediaRecorder.stop();
      } catch {
        const file = this.compileAudioFile();
        this.cleanup();
        resolve(file);
      }
    });
  }

  public cancel(): void {
    this.startAborted = true;
    this.cleanup();
    this.clearDBChunks();
    this.status = "idle";
    this.elapsedSeconds = 0;
    this.accumulatedSeconds = 0;
    this.recordingStartTime = 0;
    this.emit("statusChange", "idle");
    this.emit("durationChange", 0);
  }

  private compileAudioFile(): File | null {
    if (this.chunks.length === 0) return null;
    const mimeType = this.mediaRecorder?.mimeType || "audio/webm";
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
      now.getHours(),
    )}-${pad(now.getMinutes())}`;
    const filename = `gravacao_ao_vivo_${dateStr}.${ext}`;
    return new File([blob], filename, { type: mimeType });
  }

  private startTimer() {
    this.stopTimer();
    this.recordingStartTime = Date.now();
    this.timerInterval = window.setInterval(() => {
      if (this.recordingStartTime > 0) {
        const currentSegment = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        this.elapsedSeconds = this.accumulatedSeconds + currentSegment;
        this.emit("durationChange", this.elapsedSeconds);
      }
    }, 500);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.recordingStartTime > 0) {
      this.accumulatedSeconds += Math.floor((Date.now() - this.recordingStartTime) / 1000);
      this.elapsedSeconds = this.accumulatedSeconds;
      this.recordingStartTime = 0;
      this.emit("durationChange", this.elapsedSeconds);
    }
  }

  private startVolumeMonitoring() {
    this.stopVolumeMonitoring();
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const updateVolume = () => {
      if (this.status !== "recording" || !this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const normalized = Math.min(100, Math.round((avg / 128) * 100));
      this.emit("volumeChange", normalized);

      this.animationFrameId = requestAnimationFrame(updateVolume);
    };

    this.animationFrameId = requestAnimationFrame(updateVolume);
  }

  private stopVolumeMonitoring() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.emit("volumeChange", 0);
  }

  private cleanup() {
    this.stopTimer();
    this.stopVolumeMonitoring();
    this.releaseWakeLock();

    if (this.silentAudio) {
      this.silentAudio.pause();
      this.silentAudio = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.analyser = null;
    this.mediaRecorder = null;

    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = "none";
    }

    this.status = "idle";
    this.emit("statusChange", "idle");
  }
}

export const liveRecordingService = new LiveRecordingService();
