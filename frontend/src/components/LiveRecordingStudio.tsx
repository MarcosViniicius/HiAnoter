import { useState } from "react";
import {
  AlertTriangle,
  Cloud,
  Cpu,
  FileText,
  Mic,
  Minimize2,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useLiveRecording } from "@/context/LiveRecordingContext";
import { useUploadRecording, useUploadDocument, useCreateDocumentNote } from "@/hooks/queries";
import { useSettings } from "@/hooks/useSettings";
import { SummaryStyleSelector } from "./SummaryStyleSelector";
import { QuickTranscriptionSettingsModal } from "./QuickTranscriptionSettingsModal";
import { Button } from "./ui/button";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LiveRecordingStudio({
  onCompleted,
  onOpenSettings: _onOpenSettings,
}: {
  onCompleted: (recordingId: string) => void;
  onOpenSettings?: () => void;
}) {
  const { data: settingsData } = useSettings();
  const currentTransProvider = (settingsData?.settings.find((s) => s.key === "transcription_provider")?.value as string) || "local";
  const currentWhisperModel = (settingsData?.settings.find((s) => s.key === "whisper_model")?.value as string) || "large-v3";
  const currentLanguage = (settingsData?.settings.find((s) => s.key === "whisper_language")?.value as string) || "";

  const {
    status,
    durationSeconds,
    volumeLevel,
    attachedDocuments,
    sessionNotes,
    selectedStyle,
    isStudioOpen,
    errorMessage,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopAndFinalize,
    cancelRecording,
    addLiveNote,
    removeLiveNote,
    attachLiveDocument,
    removeLiveDocument,
    setSelectedStyle,
    closeStudio,
    clearError,
  } = useLiveRecording();

  const [activeTab, setActiveTab] = useState<"notes" | "docs" | "style" | "motor">("notes");
  const [customTitle, setCustomTitle] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishStep, setFinishStep] = useState<string>("");

  const uploadRecording = useUploadRecording();
  const uploadDoc = useUploadDocument();
  const createNote = useCreateDocumentNote();

  if (!isStudioOpen) return null;

  const isIdle = status === "idle";
  const isStarting = status === "starting";
  const isRecording = status === "recording";
  const isPaused = status === "paused";

  const handleStart = async () => {
    try {
      await startRecording();
    } catch {
      // Error handled in context
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    addLiveNote(noteInput.trim());
    setNoteInput("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      attachLiveDocument(files[i]);
    }
    e.target.value = "";
  };

  const handleFinalize = async (processImmediately = true) => {
    setIsFinishing(true);
    setFinishStep("Compilando arquivo de áudio…");

    try {
      const sessionData = await stopAndFinalize();
      if (!sessionData) {
        setIsFinishing(false);
        return;
      }

      setFinishStep("Enviando gravação e iniciando transcrição…");
      const uploadRes = await uploadRecording.mutateAsync({
        file: sessionData.audioFile,
        title: customTitle.trim() || undefined,
        deferred: !processImmediately,
        summaryStyle: selectedStyle,
        transcriptionProvider: currentTransProvider as any,
        whisperModel: currentTransProvider === "openrouter" ? "openai/whisper-large-v3-turbo" : currentWhisperModel,
      });

      const recordingId = uploadRes.id;

      // Anexa documentos coletados
      if (sessionData.documents.length > 0) {
        setFinishStep(`Vinculando ${sessionData.documents.length} documento(s) de apoio…`);
        for (const docFile of sessionData.documents) {
          try {
            await uploadDoc.mutateAsync({ recordingId, file: docFile });
          } catch {}
        }
      }

      // Anexa notas coletadas com timestamps
      if (sessionData.notes.length > 0) {
        setFinishStep(`Salvando ${sessionData.notes.length} anotação(ões) com timestamps…`);
        const formattedNotesText = sessionData.notes
          .map((n) => `[${formatDuration(n.timestamp)}] ${n.text}`)
          .join("\n\n");

        try {
          await createNote.mutateAsync({
            recordingId,
            docType: "text",
            filename: "Anotações da Sessão ao Vivo",
            contentText: formattedNotesText,
          });
        } catch {}
      }

      setIsFinishing(false);
      onCompleted(recordingId);
    } catch (err: any) {
      setIsFinishing(false);
      alert(`Falha ao finalizar gravação: ${err.message || "Erro desconhecido"}`);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-0 sm:p-4 animate-fade-in"
    >
      <div className="relative flex flex-col h-full sm:h-[90vh] sm:max-h-[780px] w-full max-w-3xl overflow-hidden rounded-none sm:rounded-3xl border-0 sm:border border-line bg-paper shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6 sm:py-4 pt-safe sm:pt-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-colors",
                isIdle
                  ? "bg-accent"
                  : isStarting
                  ? "bg-accent animate-pulse"
                  : isRecording
                  ? "bg-red-500 animate-pulse"
                  : "bg-amber-500",
              )}
            >
              <Mic className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="studio-title" className="text-sm sm:text-base font-semibold text-ink truncate">
                {isIdle
                  ? "Estúdio de Gravação ao Vivo"
                  : isStarting
                  ? "Inicializando Microfone…"
                  : isRecording
                  ? "Gravando Áudio ao Vivo"
                  : "Gravação Pausada"}
              </h2>
              <span className="text-[11px] sm:text-xs text-ink-faint truncate block">
                {isIdle
                  ? "Pronto para iniciar · Escolha quando começar a gravação"
                  : isStarting
                  ? "Conectando ao dispositivo de áudio…"
                  : isRecording
                  ? "Gravando em segundo plano · Tela protegida"
                  : "Áudio pausado temporariamente"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
            {!isIdle && !isStarting && (
              <button
                type="button"
                onClick={closeStudio}
                className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 sm:px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface2 hover:text-ink touch-tap"
                title="Minimizar para barra flutuante (gravação continua)"
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Minimizar</span>
              </button>
            )}
            <button
              type="button"
              onClick={isIdle ? closeStudio : cancelRecording}
              className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 sm:px-2.5 py-1.5 text-xs font-medium text-danger-fg hover:bg-danger-bg hover:border-danger-line touch-tap"
              title={isIdle ? "Fechar janela" : "Cancelar e descartar gravação"}
            >
              <X className="h-3.5 w-3.5" />
              <span>{isIdle ? "Fechar" : "Cancelar"}</span>
            </button>
          </div>
        </div>

        {/* Studio Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-danger-line bg-danger-bg p-3.5 text-xs text-danger-fg">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 leading-relaxed">{errorMessage}</span>
              <button onClick={clearError} className="opacity-80 hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Title Input Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink flex items-center justify-between">
              <span>Título da Transcrição / Aula:</span>
              <span className="text-[11px] text-ink-faint">Ajuda a IA a contextualizar o assunto</span>
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Ex: Aula de Matemática - Geometria Analítica"
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
              disabled={isFinishing}
            />
          </div>

          {/* Setup Card: Ready to Start */}
          {isIdle && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-surface2/60 p-8 text-center shadow-soft">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-white shadow-soft mb-4">
                <Mic className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-ink">Pronto para Gravar</h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ink-soft">
                Clique no botão abaixo para iniciar a captura de áudio pelo microfone. Você poderá pausar,
                adicionar anotações em tempo real e anexar documentos a qualquer momento.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleStart}
                  className="rounded-2xl px-6 py-3 text-sm font-semibold shadow-soft"
                >
                  <Play className="h-4 w-4 mr-2 fill-current" />
                  Iniciar Gravação Agora
                </Button>

                <Button
                  variant="surface"
                  size="md"
                  onClick={closeStudio}
                  className="rounded-2xl px-4 py-3 text-xs"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Active Recording or Paused State */}
          {!isIdle && (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-line bg-surface2/60 p-6 text-center shadow-soft">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3.5 w-3.5">
                  {(isRecording || isStarting) && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  )}
                  <span
                    className={cn(
                      "relative inline-flex h-3.5 w-3.5 rounded-full",
                      isStarting
                        ? "bg-accent animate-pulse"
                        : isRecording
                        ? "bg-red-500"
                        : "bg-amber-500",
                    )}
                  />
                </span>
                <span className="font-mono text-3xl font-bold tracking-tight tabular-nums text-ink">
                  {isStarting ? "00:00" : formatDuration(durationSeconds)}
                </span>
              </div>

              {isStarting && (
                <div className="space-y-1.5 mt-2">
                  <p className="text-xs font-medium text-accent animate-pulse">
                    Solicitando autorização e conectando microfone…
                  </p>
                  <div className="max-w-sm mx-auto rounded-xl border border-accent/30 bg-accent-soft/40 p-2.5 text-center text-[11px] text-ink-soft">
                    <p className="font-semibold text-accent">Autorização do Navegador</p>
                    <p className="mt-0.5">Se o Brave/Chrome exibir um diálogo no topo ou no ícone de cadeado 🔒/escudo 🦁, clique em <strong>Permitir</strong>.</p>
                  </div>
                </div>
              )}

              {/* Dynamic Waveform Visualizer */}
              <div className="mt-5 flex items-center justify-center gap-1.5 h-14 w-full max-w-md">
                {Array.from({ length: 24 }).map((_, i) => {
                  const waveFactor = Math.sin((i / 24) * Math.PI) * 1.5;
                  const heightPct = isStarting
                    ? 20 + Math.sin(i + Date.now() / 200) * 15
                    : isRecording
                    ? Math.min(100, Math.max(10, Math.round(volumeLevel * waveFactor + (i % 3) * 8)))
                    : 12;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "w-1.5 rounded-full transition-all duration-75",
                        isStarting ? "bg-accent/60" : isRecording ? "bg-red-500" : "bg-ink-faint",
                      )}
                      style={{ height: `${heightPct}%` }}
                    />
                  );
                })}
              </div>

              {/* Controls */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {isStarting ? (
                  <Button
                    variant="surface"
                    size="sm"
                    onClick={cancelRecording}
                    className="rounded-xl"
                  >
                    <X className="h-4 w-4 mr-1 text-danger-fg" />
                    Cancelar
                  </Button>
                ) : isRecording ? (
                  <Button
                    variant="surface"
                    size="sm"
                    onClick={pauseRecording}
                    className="rounded-xl"
                  >
                    <Pause className="h-4 w-4 mr-1 text-amber-600" />
                    Pausar Gravação
                  </Button>
                ) : isPaused ? (
                  <Button
                    variant="surface"
                    size="sm"
                    onClick={resumeRecording}
                    className="rounded-xl"
                  >
                    <Play className="h-4 w-4 mr-1 text-emerald-600 fill-current" />
                    Retomar Gravação
                  </Button>
                ) : null}

                {!isStarting && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleFinalize(true)}
                      disabled={isFinishing}
                      className="rounded-xl shadow-soft"
                    >
                      <Square className="h-4 w-4 mr-1 fill-current" />
                      Finalizar e Processar
                    </Button>

                    <Button
                      variant="surface"
                      size="sm"
                      onClick={() => handleFinalize(false)}
                      disabled={isFinishing}
                      className="rounded-xl text-xs"
                      title="Salva o áudio como rascunho para processar depois"
                    >
                      Salvar como Rascunho
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Deseja realmente cancelar e descartar a gravação atual?")) {
                          cancelRecording();
                        }
                      }}
                      disabled={isFinishing}
                      className="rounded-xl text-danger-fg hover:bg-danger-bg hover:text-danger-fg"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Descartar
                    </Button>
                  </>
                )}
              </div>

              {isFinishing && (
                <p className="mt-3 text-xs font-medium text-accent animate-pulse">
                  {finishStep}
                </p>
              )}
            </div>
          )}

          {/* Multimodal Context Tabs During Recording */}
          <div className="space-y-3">
            <div className="border-b border-line pb-2">
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("notes")}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-colors touch-tap",
                    activeTab === "notes"
                      ? "bg-accent text-white"
                      : "bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  Anotações ({sessionNotes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("docs")}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-colors touch-tap",
                    activeTab === "docs"
                      ? "bg-accent text-white"
                      : "bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  Documentos ({attachedDocuments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("motor")}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-colors touch-tap flex items-center gap-1.5",
                    activeTab === "motor"
                      ? "bg-accent text-white"
                      : "bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Motor: {currentTransProvider === "openrouter" ? "Nuvem" : "Local"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("style")}
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-colors touch-tap",
                    activeTab === "style"
                      ? "bg-accent text-white"
                      : "bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  Estilo do Resumo
                </button>
              </div>
            </div>

            {/* TAB 1: NOTES */}
            {activeTab === "notes" && (
              <div className="space-y-3 animate-fade-in">
                <form onSubmit={handleAddNote} className="flex flex-col sm:flex-row gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="flex items-center rounded-lg bg-surface2 px-2.5 py-2 font-mono text-xs text-ink-faint shrink-0">
                      [{formatDuration(durationSeconds)}]
                    </span>
                    <input
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Pontos importantes ou decisões…"
                      className="flex-1 min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <Button type="submit" variant="primary" size="sm" className="w-full sm:w-auto shrink-0 justify-center">
                    <Plus className="h-3.5 w-3.5" />
                    Anotar
                  </Button>
                </form>

                {sessionNotes.length === 0 ? (
                  <p className="text-xs text-ink-faint italic py-2">
                    Nenhuma anotação registrada ainda. Digite acima para criar marcadores de tempo durante a fala.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1.5 overflow-y-auto">
                    {sessionNotes.map((note) => (
                      <div
                        key={note.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-2.5 text-xs"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-deep">
                            {formatDuration(note.timestamp)}
                          </span>
                          <span className="text-ink leading-relaxed break-words">{note.text}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLiveNote(note.id)}
                          className="text-ink-faint hover:text-danger-fg p-1 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: DOCUMENTS */}
            {activeTab === "docs" && (
              <div className="space-y-3 animate-fade-in">
                <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-surface2/40 p-4 text-center cursor-pointer hover:border-accent/60">
                  <UploadCloud className="h-5 w-5 text-ink-faint" />
                  <span className="text-xs font-semibold text-accent">
                    Clique para anexar PDFs, imagens ou slides
                  </span>
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={handleFileUpload}
                    accept="*/*"
                  />
                </label>

                {attachedDocuments.length > 0 && (
                  <div className="max-h-40 space-y-1.5 overflow-y-auto">
                    {attachedDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-xl border border-line bg-surface p-2.5 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="h-3.5 w-3.5 text-accent shrink-0" />
                          <span className="truncate font-medium text-ink">{doc.name}</span>
                          <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
                            {doc.type}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLiveDocument(doc.id)}
                          className="text-ink-faint hover:text-danger-fg p-1 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TRANSCRIPTION ENGINE */}
            {activeTab === "motor" && (
              <div className="space-y-3 animate-fade-in">
                <div className="rounded-2xl border border-line bg-surface p-4 space-y-2.5 shadow-soft">
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
            </div>
          )}

          {/* TAB 4: SUMMARY STYLE */}
          {activeTab === "style" && (
            <div className="animate-fade-in pt-1">
              <SummaryStyleSelector value={selectedStyle} onChange={setSelectedStyle} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-6 bg-surface2/50 text-[11px] sm:text-xs text-ink-faint pb-safe sm:pb-3">
        <button
          type="button"
          onClick={() => {
            if (confirm("Deseja realmente cancelar e descartar a gravação atual?")) {
              cancelRecording();
            }
          }}
          className="text-danger-fg/80 hover:text-danger-fg font-medium transition-colors touch-tap py-1 sm:py-0"
        >
          Descartar Gravação
        </button>
        <span className="text-center sm:text-right">A gravação continua ativa se você minimizar esta janela</span>
      </div>

      {/* Modal de Configuração Rápida In-Place */}
      <QuickTranscriptionSettingsModal
        open={quickSettingsOpen}
        onClose={() => setQuickSettingsOpen(false)}
        defaultTab="transcription"
      />
    </div>
  </div>
);
}
