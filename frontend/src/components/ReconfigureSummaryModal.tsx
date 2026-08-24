import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  X,
  FileText,
  Image as ImageIcon,
  Link2,
  File,
  Plus,
  Trash2,
  Check,
  Camera,
  UploadCloud,
  Layers,
  Wand2,
  HelpCircle,
} from "lucide-react";
import { SUMMARY_STYLES } from "./SummaryStyleSelector";
import { CameraCaptureModal } from "./CameraCaptureModal";
import { Button } from "./ui/button";
import { useSummarizeRecording, useUploadDocumentsBatch, useCreateDocumentNote, useRecordingDocuments } from "@/hooks/queries";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Recording, SummaryStyle } from "@/types";

interface NewNoteItem {
  id: string;
  title: string;
  content: string;
  type: "text" | "url";
}

export function ReconfigureSummaryModal({
  open,
  onClose,
  recording,
  initialTranscriptionId,
}: {
  open: boolean;
  onClose: () => void;
  recording: Recording;
  initialTranscriptionId?: string;
}) {
  const { data: liveDocs } = useRecordingDocuments(recording.id);
  const existingDocs = liveDocs ?? recording.documents ?? [];

  const [selectedStyle, setSelectedStyle] = useState<SummaryStyle>(
    (recording.summary_style as SummaryStyle) || "ABSTRACT",
  );
  const [selectedTvId, setSelectedTvId] = useState<string>(
    initialTranscriptionId || recording.active_transcription_id || "",
  );
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(
    new Set(existingDocs.map((d) => d.id)),
  );
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newNotes, setNewNotes] = useState<NewNoteItem[]>([]);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState<"text" | "url">("text");
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const summarizeMutation = useSummarizeRecording();
  const uploadBatch = useUploadDocumentsBatch();
  const createNote = useCreateDocumentNote();

  // Reset and synchronize state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedStyle((recording.summary_style as SummaryStyle) || "ABSTRACT");
      setSelectedTvId(initialTranscriptionId || recording.active_transcription_id || "");
      setSelectedDocIds(new Set(existingDocs.map((d) => d.id)));
      setNewFiles([]);
      setNewNotes([]);
      setShowNoteForm(false);
      setErrorMessage(null);
    }
  }, [open, recording.id, existingDocs.length]);

  if (!open) return null;

  const transcriptions = recording.transcription_versions ?? [];
  const nextVersionNum = (recording.summary_versions?.length || 0) + 1;

  const toggleDocSelection = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllDocs = () => {
    setSelectedDocIds(new Set(existingDocs.map((d) => d.id)));
  };

  const handleDeselectAllDocs = () => {
    setSelectedDocIds(new Set());
  };

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setNewFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = "";
  };

  const handleRemoveNewFile = (idx: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    setNewNotes((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        title: noteTitle.trim() || (noteType === "url" ? noteContent.trim() : "Nota Adicional"),
        content: noteContent.trim(),
        type: noteType,
      },
    ]);

    setNoteTitle("");
    setNoteContent("");
    setShowNoteForm(false);
  };

  const handleRemoveNewNote = (id: string) => {
    setNewNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const handleCameraCapture = (file: File) => {
    setNewFiles((prev) => [...prev, file]);
  };

  const getDocIcon = (docType: string) => {
    switch (docType?.toLowerCase()) {
      case "pdf":
        return <FileText className="h-4 w-4 text-red-500" />;
      case "image":
        return <ImageIcon className="h-4 w-4 text-emerald-500" />;
      case "url":
      case "youtube":
        return <Link2 className="h-4 w-4 text-sky-500" />;
      default:
        return <File className="h-4 w-4 text-amber-500" />;
    }
  };

  const handleGenerate = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Upload any new files first
      let createdNewDocIds: string[] = [];
      if (newFiles.length > 0) {
        const uploaded = await uploadBatch.mutateAsync({
          recordingId: recording.id,
          files: newFiles,
        });
        createdNewDocIds.push(...uploaded.map((u) => u.id));
      }

      // 2. Create any new notes
      for (const n of newNotes) {
        const noteDoc = await createNote.mutateAsync({
          recordingId: recording.id,
          docType: n.type,
          filename: n.title,
          contentText: n.content,
        });
        createdNewDocIds.push(noteDoc.id);
      }

      // 3. Aggregate final list of included document IDs
      const finalDocIds = [...Array.from(selectedDocIds), ...createdNewDocIds];

      // 4. Trigger new summary generation
      await summarizeMutation.mutateAsync({
        id: recording.id,
        style: selectedStyle,
        transcription_version_id: selectedTvId || undefined,
        additional_instructions: additionalInstructions.trim() || undefined,
        selected_document_ids: finalDocIds,
      });

      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(
        err?.message || "Ocorreu um erro ao reconfigurar e gerar o novo resumo.",
      );
    }
  };

  const activeExistingCount = Array.from(selectedDocIds).filter((id) =>
    existingDocs.some((d) => d.id === id),
  ).length;
  const totalActiveDocsCount = activeExistingCount + newFiles.length + newNotes.length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 animate-fade-in"
    >
      <div
        className="fixed inset-0 bg-ink/50 backdrop-blur-xs"
        onClick={!isSubmitting ? onClose : undefined}
        aria-hidden="true"
      />

      <div className="relative flex flex-col w-full max-w-3xl rounded-3xl border border-line bg-paper shadow-depth overflow-hidden max-h-[92vh] z-10 animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface/80">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent text-white shadow-soft">
              <Wand2 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-serif text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                <span>Reconfigurar Resumo</span>
                <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-[11px] font-bold text-accent">
                  v{nextVersionNum}
                </span>
              </h2>
              <p className="text-xs text-ink-soft">
                Altere o modelo, documentos e observações para gerar uma nova versão sem perder as anteriores.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full p-1.5 text-ink-faint hover:bg-subtle hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="rounded-xl border border-danger-line bg-danger-bg p-3 text-xs text-danger-fg animate-fade-in">
              {errorMessage}
            </div>
          )}

          {/* Seção 1: Escolha do Modelo de Resumo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>1. Formato & Metodologia do Resumo</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {SUMMARY_STYLES.map((st) => {
                const isSelected = selectedStyle === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStyle(st.id)}
                    className={cn(
                      "flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all relative overflow-hidden",
                      isSelected
                        ? "border-accent bg-accent/10 shadow-soft ring-1 ring-accent/40"
                        : "border-line bg-surface hover:border-accent/40 hover:bg-surface2/60",
                    )}
                  >
                    {isSelected && (
                      <span className="absolute top-2.5 right-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                    <span className="text-xs font-bold text-ink">{st.title}</span>
                    <span className="font-mono text-[10px] text-accent font-semibold mt-0.5">
                      {st.badge}
                    </span>
                    <p className="mt-1.5 text-[11px] text-ink-soft line-clamp-2">
                      {st.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seção 2: Transcrição Base (se houver múltiplas) */}
          {transcriptions.length > 1 && (
            <div className="space-y-2 pt-2 border-t border-line/60">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-faint">
                2. Transcrição Base do Áudio
              </label>
              <select
                value={selectedTvId}
                onChange={(e) => setSelectedTvId(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {transcriptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    Versão {t.version_number} ({t.engine === "openrouter" ? "Nuvem" : "Local"} ·{" "}
                    {formatDate(t.created_at)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Seção 3: Documentos e Anexos de Contexto */}
          <div className="space-y-3 pt-2 border-t border-line/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-accent" />
                  <span>3. Documentos de Apoio & Contexto</span>
                </label>
                <p className="text-[11px] text-ink-faint mt-0.5">
                  {totalActiveDocsCount} anexo(s) serão enviados à IA para este resumo.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {existingDocs.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleSelectAllDocs}
                      className="text-[11px] font-medium text-accent hover:underline px-1.5 py-0.5"
                    >
                      Marcar Todos
                    </button>
                    <span className="text-ink-faint text-xs">·</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllDocs}
                      className="text-[11px] font-medium text-danger-fg hover:underline px-1.5 py-0.5"
                    >
                      Desmarcar Todos
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Ações de Inserção de Novos Documentos */}
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl border border-dashed border-accent/40 bg-accent-soft/20">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm hover:border-accent hover:bg-surface2 transition-all">
                <UploadCloud className="h-4 w-4 text-accent" />
                <span>+ Importar Novos PDFs / Imagens</span>
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
                onClick={() => setCameraModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm hover:border-accent hover:bg-surface2 transition-all"
              >
                <Camera className="h-4 w-4 text-emerald-500" />
                <span>+ Foto da Lousa</span>
              </button>

              <button
                type="button"
                onClick={() => setShowNoteForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-sm hover:border-accent hover:bg-surface2 transition-all"
              >
                <Plus className="h-4 w-4 text-accent" />
                <span>+ Nota / Link</span>
              </button>
            </div>

            {/* Subformulário de Nova Nota */}
            {showNoteForm && (
              <form
                onSubmit={handleAddNoteSubmit}
                className="space-y-2 rounded-2xl border border-accent/30 bg-surface p-3.5 animate-fade-in shadow-soft"
              >
                <div className="flex items-center gap-2 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setNoteType("text")}
                    className={cn(
                      "rounded-lg px-2.5 py-1 font-medium transition-colors",
                      noteType === "text" ? "bg-accent text-white" : "bg-surface2 text-ink-soft",
                    )}
                  >
                    Texto / Observação
                  </button>
                  <button
                    type="button"
                    onClick={() => setNoteType("url")}
                    className={cn(
                      "rounded-lg px-2.5 py-1 font-medium transition-colors",
                      noteType === "url" ? "bg-accent text-white" : "bg-surface2 text-ink-soft",
                    )}
                  >
                    Link / YouTube
                  </button>
                </div>

                <input
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder={noteType === "url" ? "Título do link (opcional)" : "Título da anotação"}
                  className="w-full rounded-xl border border-line bg-surface2/60 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
                />

                <textarea
                  rows={2}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder={
                    noteType === "url"
                      ? "https://exemplo.com/artigo-ou-documento"
                      : "Digite ou cole anotações, ementa ou fórmulas..."
                  }
                  className="w-full rounded-xl border border-line bg-surface2/60 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
                  required
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="surface"
                    size="sm"
                    onClick={() => setShowNoteForm(false)}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" size="sm" className="text-xs">
                    Adicionar aos Documentos
                  </Button>
                </div>
              </form>
            )}

            {/* Lista Unificada de Documentos Existentes e Novos */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {/* Documentos Anteriores */}
              {existingDocs.map((doc) => {
                const isSelected = selectedDocIds.has(doc.id);
                return (
                  <div
                    key={doc.id}
                    onClick={() => toggleDocSelection(doc.id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-2.5 text-xs transition-colors cursor-pointer select-none",
                      isSelected
                        ? "border-accent/40 bg-surface2"
                        : "border-line/60 bg-subtle/40 opacity-50 line-through hover:opacity-75",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-line text-accent focus:ring-accent"
                      />
                      <span className="shrink-0">{getDocIcon(doc.doc_type)}</span>
                      <span className="truncate font-medium text-ink">{doc.filename}</span>
                      <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                        {doc.doc_type}
                      </span>
                      {doc.token_count ? (
                        <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                          ≈ {doc.token_count} tok
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] font-semibold text-ink-faint">
                      {isSelected ? "Incluído" : "Desmarcado"}
                    </span>
                  </div>
                );
              })}

              {/* Novos Arquivos Adicionados nesta Sessão */}
              {newFiles.map((file, idx) => (
                <div
                  key={`new-file-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-ink"
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0">
                    <span className="shrink-0">
                      <FileText className="h-4 w-4 text-emerald-600" />
                    </span>
                    <span className="truncate font-medium text-emerald-950">{file.name}</span>
                    <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-700 uppercase">
                      Novo Anexo
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveNewFile(idx)}
                    className="text-emerald-700 hover:text-danger-fg p-1 transition-colors"
                    title="Remover arquivo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              {/* Novas Notas Adicionadas nesta Sessão */}
              {newNotes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-ink"
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0">
                    <span className="shrink-0">
                      {note.type === "url" ? (
                        <Link2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <FileText className="h-4 w-4 text-emerald-600" />
                      )}
                    </span>
                    <span className="truncate font-medium text-emerald-950">{note.title}</span>
                    <span className="shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-700 uppercase">
                      Nova Nota
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveNewNote(note.id)}
                    className="text-emerald-700 hover:text-danger-fg p-1 transition-colors"
                    title="Remover nota"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Seção 4: Observações e Instruções Personalizadas para a IA */}
          <div className="space-y-2 pt-2 border-t border-line/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-accent" />
                <span>4. Instruções e Foco Adicional para a IA (Opcional)</span>
              </label>
              {additionalInstructions.trim() && (
                <button
                  type="button"
                  onClick={() => setAdditionalInstructions("")}
                  className="text-[11px] text-ink-faint hover:text-danger-fg transition-colors"
                >
                  Limpar
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="Ex: 'Focar na demonstração de adição de vetores e fórmulas de norma', 'Explicar de forma bem didática com exemplos práticos', 'Dar destaque para a decisão sobre o orçamento'..."
              className="w-full rounded-2xl border border-line bg-surface p-3.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent leading-relaxed"
            />
          </div>
        </div>

        <CameraCaptureModal
          open={cameraModalOpen}
          onClose={() => setCameraModalOpen(false)}
          onCapture={handleCameraCapture}
        />

        {/* Footer com Status da Reconfiguração e Botões */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-t border-line bg-surface/90">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span className="font-semibold text-ink">Configuração:</span>
            <span className="rounded-md bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink font-medium">
              {SUMMARY_STYLES.find((s) => s.id === selectedStyle)?.title}
            </span>
            <span className="text-ink-faint">·</span>
            <span>{totalActiveDocsCount} doc(s)</span>
            {additionalInstructions.trim() && (
              <>
                <span className="text-ink-faint">·</span>
                <span className="text-accent font-medium">+ Instruções customizadas</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 justify-end">
            <Button
              type="button"
              variant="surface"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              loading={isSubmitting}
              className="shadow-soft font-semibold"
            >
              <Wand2 className="h-4 w-4 mr-1.5" />
              Gerar Novo Resumo
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
