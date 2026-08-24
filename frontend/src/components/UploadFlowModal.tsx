import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  Cloud,
  Cpu,
  FileAudio,
  FileText,
  Link2,
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

export interface AttachedNoteItem {
  id: string;
  title: string;
  content: string;
  type: "text" | "url";
}

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
  const [attachedNotes, setAttachedNotes] = useState<AttachedNoteItem[]>([]);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Note/Link input form state
  const [showAddMode, setShowAddMode] = useState<null | "text" | "url">(null);
  const [inputTitle, setInputTitle] = useState("");
  const [inputContent, setInputContent] = useState("");

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

  const handleAddNoteOrLink = () => {
    if (!inputContent.trim()) return;
    const isUrl = showAddMode === "url";
    setAttachedNotes((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        title: inputTitle.trim() || (isUrl ? inputContent.trim() : `Nota ${prev.length + 1}`),
        content: inputContent.trim(),
        type: isUrl ? "url" : "text",
      },
    ]);
    setInputTitle("");
    setInputContent("");
  };

  const handleRemoveNote = (id: string) => {
    setAttachedNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const [uploadStats, setUploadStats] = useState<{ loaded: number; total: number } | null>(null);

  const handleStartUpload = async () => {
    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgress(0);
    setUploadStats({ loaded: 0, total: file.size });
    setUploadStepText(`Enviando áudio principal (0 MB / ${formatBytes(file.size)})…`);

    // Coleta todas as notas + qualquer texto preenchido no input atual
    const allNotes = [...attachedNotes];
    if (inputContent.trim()) {
      const isUrl = showAddMode === "url";
      allNotes.push({
        id: "final-uncommitted",
        title: inputTitle.trim() || (isUrl ? inputContent.trim() : `Nota ${allNotes.length + 1}`),
        content: inputContent.trim(),
        type: isUrl ? "url" : "text",
      });
    }

    try {
      const res = await uploadRecording.mutateAsync({
        file,
        title: title.trim() || undefined,
        deferred: false,
        transcriptionProvider: currentTransProvider as any,
        whisperModel: currentTransProvider === "openrouter" ? "openai/whisper-large-v3-turbo" : currentWhisperModel,
        onProgress: (pct, loaded, total) => {
          setUploadStats({ loaded, total });
          const mappedPct = Math.min(85, Math.max(1, Math.round(pct * 0.85)));
          setUploadProgress(mappedPct);
          if (pct >= 100) {
            setUploadStepText("Áudio enviado! Servidor preparando processamento…");
          } else {
            setUploadStepText(`Enviando áudio principal (${formatBytes(loaded)} de ${formatBytes(total)})…`);
          }
        },
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
        setUploadProgress(90);
      }

      // Anexar notas e links de apoio
      if (allNotes.length > 0) {
        setUploadStepText(`Salvando ${allNotes.length} material(is) e notas de apoio…`);
        for (const noteItem of allNotes) {
          try {
            const isYouTube = noteItem.type === "url" && /youtu\.?be/i.test(noteItem.content);
            const docType = noteItem.type === "url" ? (isYouTube ? "youtube" : "url") : "text";
            await createNote.mutateAsync({
              recordingId,
              docType,
              filename: noteItem.title || (noteItem.type === "url" ? noteItem.content : "Nota de Contexto"),
              contentText: noteItem.content,
            });
          } catch (nErr) {
            console.error("Erro ao anexar nota/link", nErr);
          }
        }
        setUploadProgress(96);
      }

      setUploadProgress(100);
      setUploadStepText("Pronto! Abrindo transcrição…");
      setTimeout(() => {
        onComplete(recordingId);
      }, 250);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMsg(err.message || "Falha ao enviar e processar o áudio.");
    }
  };

  const totalAttachments = attachedFiles.length + attachedNotes.length;

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
              <p className="text-xs text-ink-soft">Defina título, motor e materiais complementares.</p>
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
                  "relative rounded-2xl border p-3.5 space-y-3 transition-all",
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
                    {totalAttachments > 0 && (
                      <span className="rounded-full bg-accent text-white px-2 py-0.5 font-mono text-[10px] font-bold">
                        {totalAttachments}
                      </span>
                    )}
                    <span className="text-[10px] font-normal text-ink-faint">(Opcional)</span>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCameraModalOpen(true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface2 px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface2/80 touch-tap"
                      title="Tirar foto da lousa ou slide com a câmera"
                    >
                      <Camera className="h-3 w-3 text-accent" />
                      <span>Foto</span>
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-surface2 px-2 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface2/80 touch-tap">
                      <UploadCloud className="h-3 w-3 text-accent" />
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
                      onClick={() => setShowAddMode((m) => (m === "url" ? null : "url"))}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors touch-tap",
                        showAddMode === "url"
                          ? "bg-sky-600 text-white border-sky-600"
                          : "border-line bg-surface2 text-ink-soft hover:bg-surface2/80",
                      )}
                      title="Adicionar Link ou Vídeo do YouTube"
                    >
                      <Link2 className="h-3 w-3" />
                      <span>+ Link</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddMode((m) => (m === "text" ? null : "text"))}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors touch-tap",
                        showAddMode === "text"
                          ? "bg-accent text-white border-accent"
                          : "border-line bg-surface2 text-ink-soft hover:bg-surface2/80",
                      )}
                      title="Adicionar Nota de Texto ou Observação"
                    >
                      <Plus className="h-3 w-3" />
                      <span>+ Nota</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-ink-faint leading-relaxed">
                  A IA usará a <strong>transcrição da fala como foco principal</strong> e os anexos (arquivos, múltiplos links e notas) como contexto e material de apoio.
                </p>

                {/* Form to Add Note or Link */}
                {showAddMode && (
                  <div className="space-y-2 rounded-2xl border border-accent/30 bg-accent/5 p-3 animate-fade-in text-xs">
                    <div className="flex items-center justify-between border-b border-line/50 pb-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddMode("text")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all",
                            showAddMode === "text"
                              ? "bg-accent text-white shadow-xs"
                              : "text-ink-soft hover:text-ink",
                          )}
                        >
                          Nota de Texto
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddMode("url")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all",
                            showAddMode === "url"
                              ? "bg-sky-600 text-white shadow-xs"
                              : "text-ink-soft hover:text-ink",
                          )}
                        >
                          Link / Web / YouTube
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddMode(null);
                          setInputTitle("");
                          setInputContent("");
                        }}
                        className="text-ink-faint hover:text-ink p-1 rounded-md"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={inputTitle}
                      onChange={(e) => setInputTitle(e.target.value)}
                      placeholder={showAddMode === "url" ? "Título ou descrição do link (opcional)" : "Título da nota ou tema (opcional)"}
                      className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
                    />

                    {showAddMode === "url" ? (
                      <input
                        type="url"
                        value={inputContent}
                        onChange={(e) => setInputContent(e.target.value)}
                        placeholder="https://exemplo.com/artigo ou link do YouTube…"
                        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent font-mono text-[11px]"
                      />
                    ) : (
                      <textarea
                        rows={3}
                        value={inputContent}
                        onChange={(e) => setInputContent(e.target.value)}
                        placeholder="Digite observações importantes, termos técnicos ou resumo de tópicos…"
                        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent resize-y"
                      />
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleAddNoteOrLink}
                        disabled={!inputContent.trim()}
                        className="h-7 text-xs font-semibold"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        <span>{showAddMode === "url" ? "Adicionar Link" : "Adicionar Nota"}</span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* Attached Items List (Files, Notes, Links) */}
                {totalAttachments > 0 && (
                  <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto">
                    {/* Files */}
                    {attachedFiles.map((af, i) => (
                      <div
                        key={`file-${i}`}
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

                    {/* Notes & Links */}
                    {attachedNotes.map((n) => {
                      const isUrl = n.type === "url";
                      return (
                        <div
                          key={n.id}
                          className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-1.5 text-xs text-ink"
                        >
                          <div className="flex items-center gap-2 truncate min-w-0">
                            {isUrl ? (
                              <Link2 className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                            <span className="truncate font-medium">{n.title}</span>
                            <span className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.2 rounded shrink-0",
                              isUrl ? "bg-sky-500/15 text-sky-600 dark:text-sky-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            )}>
                              {isUrl ? "Link" : "Nota"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveNote(n.id)}
                            className="text-ink-faint hover:text-danger-fg p-1 transition-colors"
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
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
                <span className="truncate pr-2 font-medium">{uploadStepText}</span>
                <span className="font-mono font-semibold tabular-nums text-accent shrink-0">
                  {uploadProgress}%
                </span>
              </div>
              <Progress value={uploadProgress} tone="accent" className="h-2.5 rounded-full" />
              <div className="flex items-center justify-between text-[11px] text-ink-faint">
                <span>
                  {uploadStats && uploadStats.total > 0
                    ? `${formatBytes(uploadStats.loaded)} de ${formatBytes(uploadStats.total)}`
                    : formatBytes(file.size)}
                </span>
                <span>
                  {currentTransProvider === "openrouter"
                    ? "Motor: OpenRouter Whisper Turbo"
                    : `Motor: Whisper Local (${currentWhisperModel})`}
                </span>
              </div>
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
