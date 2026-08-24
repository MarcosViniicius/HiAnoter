import { useRef, useState } from "react";
import { AlertTriangle, BookOpen, Mic, UploadCloud, X } from "lucide-react";
import { useHealth } from "@/hooks/queries";
import { useLiveRecording } from "@/context/LiveRecordingContext";
import { UploadFlowModal } from "./UploadFlowModal";
import { MaterialsStudioModal } from "./MaterialsStudioModal";
import { cn } from "@/lib/utils";

const AUDIO_EXTS = [".mp3", ".m4a", ".wav", ".ogg", ".webm", ".mp4", ".flac", ".aac", ".wma"];

export function UploadZone({ onCreated }: { onCreated?: (id: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const health = useHealth();
  const { openStudio } = useLiveRecording();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [droppedMaterials, setDroppedMaterials] = useState<File[]>([]);
  const [materialsStudioOpen, setMaterialsStudioOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const maxMb = health.data?.max_upload_mb ?? 300;

  const pickFile = (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) {
      setLocalError(`Arquivo acima do limite de ${maxMb} MB.`);
      return;
    }
    setLocalError(null);
    const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
    const isAudio = AUDIO_EXTS.includes(ext) || f.type.startsWith("audio/") || f.type.startsWith("video/");

    if (isAudio) {
      setSelectedFile(f);
    } else {
      setDroppedMaterials([f]);
      setMaterialsStudioOpen(true);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleMultipleFiles = (files: FileList | null | undefined) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const hasOnlyAudio = fileArray.every((f) => {
      const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
      return AUDIO_EXTS.includes(ext) || f.type.startsWith("audio/");
    });

    if (fileArray.length === 1 && hasOnlyAudio) {
      pickFile(fileArray[0]);
    } else {
      setDroppedMaterials(fileArray);
      setMaterialsStudioOpen(true);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        accept="*/*"
        onChange={(e) => handleMultipleFiles(e.target.files)}
      />

      {/* 1. Button: Live Recording (Microphone) */}
      <button
        type="button"
        onClick={openStudio}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-center text-white shadow-soft transition-all duration-200 hover:bg-accent-deep active:scale-[0.99]"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
          <Mic className="h-3.5 w-3.5" />
        </span>
        <span className="text-[13px] font-semibold">Gravar Áudio</span>
      </button>

      {/* 2. Dropzone: Audio File Upload */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleMultipleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-3 py-2.5 text-center transition-all duration-200",
          dragging
            ? "scale-[1.02] border-accent bg-accent/15"
            : "border-night-line bg-night-soft hover:border-accent/60 hover:bg-night-soft/80",
        )}
      >
        <UploadCloud
          className={cn(
            "h-4 w-4 transition-colors",
            dragging ? "text-accent-onDark" : "text-night-muted group-hover:text-accent-onDark",
          )}
        />
        <span className="text-[11px] font-medium text-night-text">Importar áudio ou documentos</span>
        <span className="text-[9px] text-night-faint">
          {dragging ? "solte para enviar" : `Áudios · PDFs · Fotos · Docs`}
        </span>
      </button>

      {/* 3. Button: Materials Study Session (YouTube, Web, PDFs, Text) */}
      <button
        type="button"
        onClick={() => setMaterialsStudioOpen(true)}
        className="group flex w-full items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-center text-accent-onDark transition-all duration-200 hover:bg-accent/20 active:scale-[0.99]"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20">
          <BookOpen className="h-3.5 w-3.5 text-accent-onDark" />
        </span>
        <span className="text-[12px] font-semibold">Criar por Materiais</span>
      </button>

      {localError && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-danger-line bg-danger-bg/10 px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-fg" />
          <span className="flex-1 text-[11px] leading-relaxed text-danger-fg">
            {localError}
          </span>
          <button
            onClick={() => setLocalError(null)}
            className="text-danger-fg/70 hover:text-danger-fg"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Upload Flow Modal for Audio */}
      {selectedFile && (
        <UploadFlowModal
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onComplete={(id: string) => {
            setSelectedFile(null);
            onCreated?.(id);
          }}
        />
      )}

      {/* Materials Studio Modal (YouTube, Web, PDF, Notes) */}
      <MaterialsStudioModal
        open={materialsStudioOpen}
        initialFiles={droppedMaterials}
        onClose={() => {
          setMaterialsStudioOpen(false);
          setDroppedMaterials([]);
        }}
        onCreated={(id) => {
          setMaterialsStudioOpen(false);
          setDroppedMaterials([]);
          onCreated?.(id);
        }}
      />
    </div>
  );
}