import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Cloud,
  Cpu,
  FileAudio,
  FileText,
  Paperclip,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useUploadRecording, useUploadDocumentsBatch, useCreateDocumentNote } from "@/hooks/queries";
import { useSettings } from "@/hooks/useSettings";
import { CameraCaptureModal } from "./CameraCaptureModal";
import { QuickTranscriptionSettingsModal } from "./QuickTranscriptionSettingsModal";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UploadFlowModal({
  file,
  onClose,
  onComplete,
  onOpenSettings: _onOpenSettings,
}: {
  file: File;
  onClose: () => void;
  onComplete: (recordingId: string) => void;
  onOpenSettings?: () => void;
}) {
  const { data: settingsData } = useSettings();
  const defaultTitle = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();

  // Obtém configurações padrão centralizadas
  const currentTransProvider = (settingsData?.settings.find((s) => s.key === "transcription_provider")?.value as string) || "local";
  const currentWhisperModel = (settingsData?.settings.find((s) => s.key === "whisper_model")?.value as string) || "large-v3";
  const currentLanguage = (settingsData?.settings.find((s) => s.key === "whisper_language")?.value as string) || "";

  const [title, setTitle] = useState(defaultTitle);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStepText, setUploadStepText] = useState("Enviando gravação…");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const uploadRecording = useUploadRecording();
  const uploadBatch = useUploadDocumentsBatch();
  const createNote = useCreateDocumentNote();

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      newFiles.push(files[i]);
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const handleFilesBatch = (files: FileList | File[]) => {
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      newFiles.push(files[i]);
    }
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  };

  // Clipboard Paste support for screenshots and copied files
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const filesToUpload: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) filesToUpload.push(f);
        }
      }
      if (filesToUpload.length > 0) {
        e.preventDefault();
        handleFilesBatch(filesToUpload);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleCameraCapture = (capturedFile: File) => {
    setAttachedFiles((prev) => [...prev, capturedFile]);
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleStartUpload = async () => {
    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgress(10);
    setUploadStepText("Enviando arquivo de áudio principal…");

    try {
      const res = await uploadRecording.mutateAsync({
        file,
        title: title.trim() || undefined,
        deferred: false,
        transcriptionProvider: currentTransProvider as any,
        whisperModel: currentTransProvider === "openrouter" ? "openai/whisper-large-v3-turbo" : currentWhisperModel,
        onProgress: (pct) => setUploadProgress(Math.max(10, Math.round(pct * 0.7))),
      });

      const recordingId = res.id;

      // Anexar documentos selecionados em lote
      if (attachedFiles.length > 0) {
        setUploadStepText(`Anexando ${attachedFiles.length} documento(s) de apoio…`);
        try {
          await uploadBatch.mutateAsync({ recordingId, files: attachedFiles });
        } catch (docErr) {
          console.error("Erro ao enviar lote de documentos", docErr);
        }
        setUploadProgress(85);
      }

      // Anexar nota rápida se houver
      if (noteContent.trim()) {
        setUploadStepText("Salvando notas contextuais de apoio…");
        try {
          await createNote.mutateAsync({
            recordingId,
            docType: "text",
            filename: noteTitle.trim() || "Nota de Contexto",
            contentText: noteContent.trim(),
          });
        } catch {}
      }

      setUploadProgress(100);
      setUploadStepText("Pronto! Abrindo transcrição…");
      setTimeout(() => {
        onComplete(recordingId);
      }, 300);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMsg(err.message || "Falha ao enviar e processar o áudio.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-fade-in"
    >
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-paper/95 px-5 py-4 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 id="modal-title" className="text-sm sm:text-base font-semibold text-ink">
                Importar e Configurar Transcrição
              </h2>
              <p className="text-xs text-ink-soft">Defina título, motor e anexos complementares.</p>
            </div>
          </div>
          {!isUploading && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink touch-tap"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body scrollable */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-bg p-3.5 text-xs text-danger-fg">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 leading-relaxed">{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="opacity-80 hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Title Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink flex items-center justify-between">
              <span>Título / Nome da Transcrição:</span>
              <span className="text-[11px] text-ink-faint">Ajuda a IA a compreender o contexto</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Aula de Matemática - Geometria Analítica"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
              disabled={isUploading}
            />
          </div>

          {/* File Card */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <FileAudio className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">{file.name}</p>
              <p className="font-mono text-[10px] text-ink-faint">{formatBytes(file.size)}</p>
            </div>
          </div>

          {!isUploading ? (
            <>
              {/* Supporting Documents & Notes Section */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFilesBatch(e.dataTransfer.files);
                  }
                }}
                className={cn(
                  "relative rounded-2xl border p-3.5 space-y-2.5 transition-all",
                  isDragging ? "border-accent bg-accent/5 ring-2 ring-accent/30" : "border-line bg-surface",
                )}
              >
                {isDragging && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-paper/95 border-2 border-dashed border-accent p-4 text-center">
                    <UploadCloud className="h-6 w-6 text-accent animate-bounce mb-1" />
                    <p className="text-xs font-bold text-ink">Solte os documentos aqui para anexar</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Paperclip className="h-3.5 w-3.5 text-accent" />
                    <span>Documentos de Apoio & Contexto</span>
                    {attachedFiles.length > 0 && (
                      <span className="rounded-full bg-accent text-white px-2 py-0.5 font-mono text-[10px] font-bold">
                        {attachedFiles.length}
                      </span>
                    )}
                    <span className="text-[10px] font-normal text-ink-faint">(Opcional)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCameraModalOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface2 px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface2/80"
                      title="Tirar foto da lousa ou slide com a câmera"
                    >
                      <Camera className="h-3 w-3 text-accent" />
                      <span>Foto</span>
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-surface2 px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface2/80 touch-tap">
                      <UploadCloud className="h-3 w-3" />
                      <span>Anexar</span>
                      <input
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={handleAddFiles}
                        accept="*/*"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowNoteInput((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium transition-colors",
                        showNoteInput || noteContent.trim()
                          ? "bg-accent text-white border-accent"
                          : "bg-surface2 text-ink-soft hover:bg-surface2/80",
                      )}
                    >
                      <Plus className="h-3 w-3" />
                      <span>{noteContent.trim() ? "Nota Anexada" : "Nota"}</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-ink-faint leading-relaxed">
                  A IA usará a <strong>transcrição da fala como foco principal</strong> e os anexos como material de apoio. Cole imagens com <strong>Ctrl+V</strong> ou arraste arquivos aqui.
                </p>

                {/* Attached Files List */}
                {attachedFiles.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {attachedFiles.map((af, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-1.5 text-xs text-ink"
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <FileText className="h-3.5 w-3.5 text-accent shrink-0" />
                          <span className="truncate font-medium">{af.name}</span>
                          <span className="text-[10px] font-mono text-ink-faint shrink-0">
                            {formatBytes(af.size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(i)}
                          className="text-ink-faint hover:text-danger-fg p-1 transition-colors"
                          title="Remover anexo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick note form */}
                {showNoteInput && (
                  <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft/30 p-2.5 animate-fade-in text-xs">
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Título da nota ou tema (opcional)"
                      className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <textarea
                      rows={2}
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Digite observações importantes, nomes de termos técnicos ou links de slides…"
                      className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                )}
              </div>

              {/* Transcription Engine */}
              {/* Motor de Transcrição Padrão Centralizado */}
              <div className="rounded-2xl border border-line bg-surface p-4 space-y-2 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {currentTransProvider === "openrouter" ? (
                      <Cloud className="h-4 w-4 text-accent" />
                    ) : (
                      <Cpu className="h-4 w-4 text-accent" />
                    )}
                    <span className="text-xs font-bold text-ink">
                      Motor de transcrição: {currentTransProvider === "openrouter" ? "Whisper via OpenRouter" : `Whisper Local (${currentWhisperModel})`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuickSettingsOpen(true)}
                    className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1 touch-tap"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    <span>Alterar configuração</span>
                  </button>
                </div>
                <p className="text-[11.5px] text-ink-soft leading-relaxed">
                  Esta transcrição será processada usando sua <strong>configuração padrão</strong> do sistema ({currentTransProvider === "openrouter" ? "Nuvem OpenRouter" : `Whisper Local ${currentWhisperModel}`} · {currentLanguage ? currentLanguage : "Auto-detect"}).
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-3 py-4 text-center">
              <div className="flex items-center justify-between text-xs text-ink-soft">
                <span>{uploadStepText}</span>
                <span className="font-mono font-semibold tabular-nums text-accent">
                  {uploadProgress}%
                </span>
              </div>
              <Progress value={uploadProgress} tone="accent" className="h-2.5 rounded-full" />
              <p className="text-[11px] text-ink-faint">
                {currentTransProvider === "openrouter"
                  ? "Motor: OpenRouter (openai/whisper-large-v3-turbo)"
                  : `Motor: Whisper Local (${currentWhisperModel})`}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isUploading && (
          <div className="flex items-center justify-end gap-2.5 border-t border-line bg-surface2/30 px-5 py-3.5 shrink-0">
            <Button variant="surface" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartUpload}
              className="shadow-soft"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Iniciar Transcrição
            </Button>
          </div>
        )}
      </div>

      <CameraCaptureModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* Modal de Configuração Rápida In-Place */}
      <QuickTranscriptionSettingsModal
        open={quickSettingsOpen}
        onClose={() => setQuickSettingsOpen(false)}
        defaultTab="transcription"
      />
    </div>
  );
}
