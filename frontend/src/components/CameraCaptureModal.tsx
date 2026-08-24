import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  RefreshCw,
  SwitchCamera,
  VideoOff,
  X,
} from "lucide-react";
import { Button } from "./ui/button";

export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileFallbackRef = useRef<HTMLInputElement>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (deviceId?: string) => {
    stopStream();
    setError(null);
    setIsLoading(true);
    setCapturedDataUrl(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Enumerate available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setCameras(videoDevices);
      if (videoDevices.length > 0 && !deviceId) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    } catch (err: any) {
      setError(
        err.name === "NotAllowedError"
          ? "Permissão de acesso à câmera foi negada. Permita nas configurações do navegador."
          : "Não foi possível iniciar a câmera do dispositivo.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void startCamera();
    } else {
      stopStream();
      setCapturedDataUrl(null);
    }
    return () => stopStream();
  }, [open]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedDataUrl(dataUrl);
    stopStream();
  };

  const handleConfirm = () => {
    if (!capturedDataUrl) return;

    // Convert dataUrl to File
    const arr = capturedDataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = new File([u8arr], `foto-lousa-${timestamp}.jpg`, { type: mime });

    onCapture(file);
    onClose();
  };

  const handleRetake = () => {
    setCapturedDataUrl(null);
    void startCamera(selectedCameraId);
  };

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIdx = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIdx = (currentIdx + 1) % cameras.length;
    const nextCamera = cameras[nextIdx];
    setSelectedCameraId(nextCamera.deviceId);
    void startCamera(nextCamera.deviceId);
  };

  const handleNativeFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative flex flex-col w-full max-w-xl rounded-3xl border border-line bg-paper shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface/80">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
              <Camera className="h-4 w-4" />
            </span>
            <span className="font-serif text-base font-bold text-ink">
              Tirar Foto da Lousa / Slide
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-ink-faint hover:bg-subtle hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewport */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
          {capturedDataUrl ? (
            <img
              src={capturedDataUrl}
              alt="Foto capturada"
              className="w-full h-full object-contain"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white gap-2 text-xs font-semibold">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  Iniciando câmera…
                </div>
              )}
            </>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center text-white space-y-3">
              <VideoOff className="h-8 w-8 text-rose-400" />
              <p className="text-xs sm:text-sm text-neutral-300 max-w-sm">{error}</p>
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="surface"
                  size="sm"
                  onClick={() => fileFallbackRef.current?.click()}
                  className="text-xs"
                >
                  Abrir Câmera do Sistema
                </Button>
                <input
                  ref={fileFallbackRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleNativeFileFallback}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-line bg-surface/80">
          <div>
            {cameras.length > 1 && !capturedDataUrl && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface2 px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink transition-colors"
                title="Alternar câmera frontal/traseira"
              >
                <SwitchCamera className="h-3.5 w-3.5" />
                <span>Trocar Câmera</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {capturedDataUrl ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleRetake} className="text-xs">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Tirar Novamente
                </Button>
                <Button variant="primary" size="sm" onClick={handleConfirm} className="text-xs">
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Usar Esta Foto
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleCaptureFrame}
                disabled={isLoading || Boolean(error)}
                className="px-6 rounded-2xl shadow-soft font-semibold"
              >
                <Camera className="h-4 w-4 mr-2" />
                Capturar Foto
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
