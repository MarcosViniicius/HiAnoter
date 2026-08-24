import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { normalizeMathMarkdown } from "@/lib/math";
import { api } from "@/lib/api";
import {
  Camera,
  FileText,
  File,
  Image as ImageIcon,
  Link2,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Layers,
  Sigma,
  Table as TableIcon,
  Eye,
} from "lucide-react";
import {
  useUploadDocument,
  useUploadDocumentsBatch,
  useCreateDocumentNote,
  useDeleteDocument,
  useRecordingDocuments,
} from "@/hooks/queries";
import { CameraCaptureModal } from "./CameraCaptureModal";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { RecordingDocument } from "@/types";

export function ContextDocumentsPanel({
  recordingId,
  documents: initialDocuments = [],
  readOnly = false,
  className,
}: {
  recordingId: string;
  documents?: RecordingDocument[];
  readOnly?: boolean;
  className?: string;
}) {
  const { data: fetchedDocs } = useRecordingDocuments(recordingId);
  const documents = fetchedDocs ?? initialDocuments;

  const [filterType, setFilterType] = useState<"all" | "pdf" | "image" | "text" | "url">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [noteType, setNoteType] = useState<"text" | "url">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  const uploadDoc = useUploadDocument();
  const uploadBatch = useUploadDocumentsBatch();
  const createNote = useCreateDocumentNote();
  const deleteDoc = useDeleteDocument();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    if (fileList.length === 1) {
      uploadDoc.mutate({ recordingId, file: fileList[0] });
    } else {
      uploadBatch.mutate({ recordingId, files: fileList });
    }
    e.target.value = "";
  };

  const handleFilesBatch = (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 1) {
      uploadDoc.mutate({ recordingId, file: fileList[0] });
    } else if (fileList.length > 1) {
      uploadBatch.mutate({ recordingId, files: fileList });
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesBatch(e.dataTransfer.files);
    }
  };

  // Clipboard Paste handler (Screenshots, Copied files)
  useEffect(() => {
    if (readOnly) return;

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
          const file = item.getAsFile();
          if (file) {
            filesToUpload.push(file);
          }
        }
      }

      if (filesToUpload.length > 0) {
        e.preventDefault();
        handleFilesBatch(filesToUpload);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [recordingId, readOnly]);

  const handleCameraCapture = (file: File) => {
    uploadDoc.mutate({ recordingId, file });
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    createNote.mutate(
      {
        recordingId,
        docType: noteType,
        filename: title.trim() || (noteType === "url" ? content.trim() : "Nota Rápida"),
        contentText: content.trim(),
      },
      {
        onSuccess: () => {
          setTitle("");
          setContent("");
          setShowAddForm(false);
        },
      },
    );
  };

  const totalTokens = useMemo(() => {
    return documents.reduce((sum, doc) => sum + (doc.token_count || 0), 0);
  }, [documents]);

  const counts = useMemo(() => {
    const pdf = documents.filter((d) => d.doc_type?.toLowerCase() === "pdf").length;
    const image = documents.filter((d) => d.doc_type?.toLowerCase() === "image").length;
    const text = documents.filter((d) => d.doc_type?.toLowerCase() === "text").length;
    const url = documents.filter((d) => ["url", "youtube"].includes(d.doc_type?.toLowerCase())).length;
    return { all: documents.length, pdf, image, text, url };
  }, [documents]);

  const filteredDocs = useMemo(() => {
    let list = documents;
    if (filterType !== "all") {
      if (filterType === "url") {
        list = list.filter((d) => ["url", "youtube"].includes(d.doc_type?.toLowerCase()));
      } else {
        list = list.filter((d) => d.doc_type?.toLowerCase() === filterType);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.filename.toLowerCase().includes(q) ||
          (d.content_text && d.content_text.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [documents, filterType, searchQuery]);

  const getDocIcon = (docType: string) => {
    switch (docType?.toLowerCase()) {
      case "pdf":
        return <FileText className="h-4 w-4 text-red-400" />;
      case "image":
        return <ImageIcon className="h-4 w-4 text-emerald-400" />;
      case "url":
      case "youtube":
        return <Link2 className="h-4 w-4 text-sky-400" />;
      default:
        return <File className="h-4 w-4 text-amber-400" />;
    }
  };

  const isUploading = uploadDoc.isPending || uploadBatch.isPending;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative space-y-3.5 rounded-2xl border bg-surface p-4 sm:p-5 shadow-soft transition-all",
        isDragging ? "border-accent bg-accent/5 ring-2 ring-accent/30" : "border-line",
        className,
      )}
    >
      {/* Dragging Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-paper/95 backdrop-blur-xs border-2 border-dashed border-accent p-6 text-center animate-fade-in">
          <UploadCloud className="h-10 w-10 text-accent animate-bounce mb-2" />
          <h4 className="font-serif text-base font-bold text-ink">Solte múltiplos arquivos aqui</h4>
          <p className="text-xs text-ink-soft">Suporte a dezenas de PDFs, imagens, notas e slides simultâneos.</p>
        </div>
      )}

      {/* Header com Informações e Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
              <span>Documentos & Anexos de Apoio</span>
              <span className="rounded-full bg-subtle px-2 py-0.5 font-mono text-[11px] font-medium text-ink-soft">
                {documents.length}
              </span>
            </h3>
            {totalTokens > 0 && (
              <p className="text-[11px] text-ink-faint">
                ≈ {totalTokens.toLocaleString()} tokens indexados para a IA
              </p>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="surface"
              size="sm"
              onClick={() => setCameraModalOpen(true)}
              className="text-[12px]"
              title="Tirar foto da lousa ou slide com a câmera"
            >
              <Camera className="h-3.5 w-3.5 mr-1 text-accent" />
              Tirar Foto
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface2 px-2.5 py-1 text-[12px] font-medium text-ink-soft transition-colors hover:bg-surface2/80 touch-tap">
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Anexar Arquivos (PDFs/Fotos)</span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={handleFileUpload}
                accept="*/*"
              />
            </label>
            <Button
              variant="surface"
              size="sm"
              onClick={() => setShowAddForm((v) => !v)}
              className="text-[12px]"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Nota / Link
            </Button>
          </div>
        )}
      </div>

      <CameraCaptureModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* Formulário de Adicionar Nota/Link */}
      {showAddForm && (
        <form onSubmit={handleAddNote} className="space-y-2.5 rounded-xl border border-accent/30 bg-accent-soft/40 p-3 animate-fade-in">
          <div className="flex items-center gap-2 text-[12px]">
            <button
              type="button"
              onClick={() => setNoteType("text")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                noteType === "text" ? "bg-accent text-white" : "bg-surface text-ink-soft",
              )}
            >
              Texto / Anotação
            </button>
            <button
              type="button"
              onClick={() => setNoteType("url")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                noteType === "url" ? "bg-accent text-white" : "bg-surface text-ink-soft",
              )}
            >
              Link / URL / YouTube
            </button>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={noteType === "url" ? "Título do link (opcional)" : "Título da nota"}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
          />

          <textarea
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              noteType === "url"
                ? "https://exemplo.com/artigo-ou-documento"
                : "Digite ou cole o texto contextual relevante para o resumo…"
            }
            className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
            required
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="surface"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={createNote.isPending}
            >
              Adicionar
            </Button>
          </div>
        </form>
      )}

      {/* Barra de Filtros e Busca quando há múltiplos anexos */}
      {documents.length > 2 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-y border-line/60 py-2">
          <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={cn(
                "rounded-md px-2 py-1 font-medium transition-colors",
                filterType === "all" ? "bg-accent text-white" : "text-ink-soft hover:bg-subtle",
              )}
            >
              Todos ({counts.all})
            </button>
            {counts.pdf > 0 && (
              <button
                type="button"
                onClick={() => setFilterType("pdf")}
                className={cn(
                  "rounded-md px-2 py-1 font-medium transition-colors",
                  filterType === "pdf" ? "bg-accent text-white" : "text-ink-soft hover:bg-subtle",
                )}
              >
                PDFs ({counts.pdf})
              </button>
            )}
            {counts.image > 0 && (
              <button
                type="button"
                onClick={() => setFilterType("image")}
                className={cn(
                  "rounded-md px-2 py-1 font-medium transition-colors",
                  filterType === "image" ? "bg-accent text-white" : "text-ink-soft hover:bg-subtle",
                )}
              >
                Imagens ({counts.image})
              </button>
            )}
            {counts.text > 0 && (
              <button
                type="button"
                onClick={() => setFilterType("text")}
                className={cn(
                  "rounded-md px-2 py-1 font-medium transition-colors",
                  filterType === "text" ? "bg-accent text-white" : "text-ink-soft hover:bg-subtle",
                )}
              >
                Textos ({counts.text})
              </button>
            )}
            {counts.url > 0 && (
              <button
                type="button"
                onClick={() => setFilterType("url")}
                className={cn(
                  "rounded-md px-2 py-1 font-medium transition-colors",
                  filterType === "url" ? "bg-accent text-white" : "text-ink-soft hover:bg-subtle",
                )}
              >
                Links ({counts.url})
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-faint" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nos anexos…"
              className="w-full sm:w-44 rounded-lg border border-line bg-surface2/60 pl-8 pr-2.5 py-1 text-[11px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      )}

      {/* Loading de Upload */}
      {isUploading && (
        <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/40 p-3 text-xs text-accent font-medium animate-pulse">
          <UploadCloud className="h-4 w-4 animate-bounce" />
          <span>Extraindo e indexando documentos de apoio para a IA…</span>
        </div>
      )}

      {/* Estado Vazio */}
      {documents.length === 0 && !isUploading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line/80 bg-subtle/30 py-6 px-4 text-center">
          <Layers className="h-6 w-6 text-ink-faint mb-1.5 opacity-60" />
          <p className="text-xs font-semibold text-ink-soft">Nenhum anexo adicionado ainda</p>
          <p className="text-[11px] text-ink-faint mt-0.5 max-w-sm">
            Adicione dezenas de PDFs, imagens, fotos de lousa, notas ou links para enriquecer a síntese com a IA.
          </p>
        </div>
      )}

      {/* Lista de Documentos */}
      {filteredDocs.length > 0 && (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-0.5">
          {filteredDocs.map((doc, idx) => {
            const isExpanded = expandedDocId === doc.id;
            return (
              <div
                key={doc.id}
                className="rounded-xl border border-line bg-surface2/70 p-2.5 transition-colors hover:bg-surface2"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                    )}
                    <span className="shrink-0 text-[11px] font-mono text-ink-faint font-bold">
                      #{idx + 1}
                    </span>
                    <span className="shrink-0">{getDocIcon(doc.doc_type)}</span>
                    <span className="truncate text-[13px] font-semibold text-ink">
                      {doc.filename}
                    </span>
                    <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
                      {doc.doc_type}
                    </span>

                    {/* Multimodal Badges */}
                    {doc.pages_count && doc.pages_count > 1 ? (
                      <span className="shrink-0 rounded bg-surface border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                        {doc.pages_count} págs
                      </span>
                    ) : null}

                    {doc.diagnostics?.formulas_count ? (
                      <span className="shrink-0 flex items-center gap-1 rounded bg-accent/10 border border-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-deep">
                        <Sigma className="h-3 w-3" />
                        {doc.diagnostics.formulas_count}
                      </span>
                    ) : null}

                    {doc.diagnostics?.tables_count ? (
                      <span className="shrink-0 flex items-center gap-1 rounded bg-surface border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                        <TableIcon className="h-3 w-3" />
                        {doc.diagnostics.tables_count}
                      </span>
                    ) : null}

                    {doc.token_count ? (
                      <span className="shrink-0 text-[10px] tabular-nums text-ink-faint hidden sm:inline">
                        ≈ {doc.token_count.toLocaleString()} tokens
                      </span>
                    ) : null}
                  </button>

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => deleteDoc.mutate({ recordingId, docId: doc.id })}
                      disabled={deleteDoc.isPending}
                      className="text-ink-faint hover:text-danger-fg transition-colors p-1"
                      title="Remover documento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 border-t border-line/60 pt-3 animate-fade-in space-y-3">
                    {/* Header info & diagnostics */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-faint">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-soft">Estrutura Extraída:</span>
                        {doc.pages_count ? <span>{doc.pages_count} página(s)</span> : null}
                        {doc.diagnostics?.formulas_count ? <span>· {doc.diagnostics.formulas_count} fórmulas em LaTeX</span> : null}
                        {doc.diagnostics?.tables_count ? <span>· {doc.diagnostics.tables_count} tabela(s)</span> : null}
                        {doc.diagnostics?.images_count ? <span>· {doc.diagnostics.images_count} imagem(ns)</span> : null}
                      </div>

                      {doc.doc_type === "pdf" && (
                        <a
                          href={api.documentAssetUrl(recordingId, doc.id, "pages", "001.png")}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-accent hover:underline"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Ver Página 1 (HD)</span>
                        </a>
                      )}
                    </div>

                    {/* Rich Markdown & LaTeX Preview */}
                    <div className="max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-3.5 text-xs text-ink leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        className="prose-study space-y-2"
                      >
                        {normalizeMathMarkdown(doc.content_text || "(Sem conteúdo de texto legível extraído)")}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
