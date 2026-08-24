import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Camera,
  FileCode,
  FileText,
  Globe,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Youtube,
} from "lucide-react";
import { useCreateMaterialsSession } from "@/hooks/queries";
import { api } from "@/lib/api";
import { SUMMARY_STYLES } from "./SummaryStyleSelector";
import { CameraCaptureModal } from "./CameraCaptureModal";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { cn } from "@/lib/utils";
import type { MaterialItemInput, SummaryStyle } from "@/types";

interface AddedMaterial {
  id: string;
  doc_type: "youtube" | "url" | "pdf" | "image" | "text";
  title: string;
  content: string;
  url?: string;
  size_label?: string;
  rawFile?: File;
}

export function MaterialsStudioModal({
  open,
  onClose,
  onCreated,
  initialFiles,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (recordingId: string) => void;
  initialFiles?: File[];
}) {
  const [title, setTitle] = useState("");
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>("ABSTRACT");
  const [materials, setMaterials] = useState<AddedMaterial[]>([]);
  const [activeInputTab, setActiveInputTab] = useState<"link" | "file" | "text">(initialFiles && initialFiles.length > 0 ? "file" : "link");

  // Inputs
  const [linkInput, setLinkInput] = useState("");
  const [textTitleInput, setTextTitleInput] = useState("");
  const [textContentInput, setTextContentInput] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateMaterialsSession();

  // Reset modal state on close/open or load initialFiles
  useEffect(() => {
    if (open) {
      setTitle("");
      setLinkInput("");
      setTextTitleInput("");
      setTextContentInput("");
      setErrorMessage(null);

      if (initialFiles && initialFiles.length > 0) {
        const converted = initialFiles.map((file) => {
          const isImg = file.type.startsWith("image/");
          const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
          return {
            id: Math.random().toString(36).substring(7),
            doc_type: (isImg ? "image" : isPdf ? "pdf" : "text") as any,
            title: file.name,
            content: `[Arquivo: ${file.name}]`,
            size_label: `${Math.round(file.size / 1024)} KB`,
            rawFile: file,
          };
        });
        setMaterials(converted);
        setActiveInputTab("file");
      } else {
        setMaterials([]);
      }
    }
  }, [open, initialFiles]);

  // Support pasting images or links anywhere in the modal
  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // Check for image
      const items = clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            addMaterial({
              id: Math.random().toString(36).substring(7),
              doc_type: "image",
              title: `Print da Área de Transferência (${new Date().toLocaleTimeString()})`,
              content: `[Imagem colada: ${file.name || "print.png"}]`,
              size_label: `${Math.round(file.size / 1024)} KB`,
            });
            return;
          }
        }
      }

      // Check for YouTube / Web link pasted
      const text = clipboardData.getData("text");
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        if (text.includes("youtube.com") || text.includes("youtu.be")) {
          addMaterial({
            id: Math.random().toString(36).substring(7),
            doc_type: "youtube",
            title: `Vídeo do YouTube`,
            content: "",
            url: text.trim(),
            size_label: "Link do YouTube",
          });
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open]);

  if (!open) return null;

  const addMaterial = (item: AddedMaterial) => {
    setMaterials((prev) => [...prev, item]);
    setErrorMessage(null);
  };

  const removeMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  const handleAddLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setErrorMessage("Por favor, insira uma URL válida (iniciando com https:// ou http://)");
      return;
    }

    const isYt = trimmed.includes("youtube.com") || trimmed.includes("youtu.be");
    addMaterial({
      id: Math.random().toString(36).substring(7),
      doc_type: isYt ? "youtube" : "url",
      title: isYt ? "Vídeo do YouTube" : "Página Web / Artigo",
      content: "",
      url: trimmed,
      size_label: isYt ? "YouTube" : "Web",
    });

    setLinkInput("");
  };

  const handleAddText = () => {
    const trimmedContent = textContentInput.trim();
    if (!trimmedContent) return;

    addMaterial({
      id: Math.random().toString(36).substring(7),
      doc_type: "text",
      title: textTitleInput.trim() || `Anotação (${new Date().toLocaleTimeString()})`,
      content: trimmedContent,
      size_label: `${trimmedContent.length} caracteres`,
    });

    setTextTitleInput("");
    setTextContentInput("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");

      addMaterial({
        id: Math.random().toString(36).substring(7),
        doc_type: isImg ? "image" : isPdf ? "pdf" : "text",
        title: file.name,
        content: `[Arquivo: ${file.name}]`,
        size_label: `${Math.round(file.size / 1024)} KB`,
        rawFile: file,
      });
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCameraPhoto = (file: File) => {
    addMaterial({
      id: Math.random().toString(36).substring(7),
      doc_type: "image",
      title: file.name || `Foto da Câmera / Lousa (${new Date().toLocaleTimeString()})`,
      content: `[Foto capturada da lousa / projeção: ${file.name}]`,
      size_label: `${Math.round(file.size / 1024)} KB`,
      rawFile: file,
    });
    setCameraOpen(false);
  };

  const handleSynthesize = async () => {
    if (materials.length === 0) {
      setErrorMessage("Adicione pelo menos um material (vídeo, link, PDF, anotação ou foto) para gerar a síntese.");
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const textAndLinkMaterials: MaterialItemInput[] = materials
      .filter((m) => !m.rawFile)
      .map((m) => ({
        doc_type: m.doc_type,
        title: m.title,
        content: m.content,
        url: m.url,
      }));

    const rawFiles = materials.map((m) => m.rawFile).filter((f): f is File => Boolean(f));

    try {
      const created = await createMutation.mutateAsync({
        title: title.trim() || undefined,
        summary_style: summaryStyle,
        materials: textAndLinkMaterials,
        auto_generate: false,
      });

      if (rawFiles.length > 0) {
        await api.uploadDocumentsBatch(created.id, rawFiles);
      }

      // Dispara a síntese consolidada
      await api.summarize(created.id, { style: summaryStyle });

      setIsProcessing(false);
      onClose();
      onCreated(created.id);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err?.message || "Ocorreu um erro ao processar os materiais com a IA.");
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
        <div
          className="fixed inset-0 bg-ink/50 backdrop-blur-xs animate-fade-in"
          onClick={!isProcessing ? onClose : undefined}
          aria-hidden="true"
        />

        <div className="relative w-full max-w-2xl rounded-3xl bg-surface border border-line p-6 sm:p-8 shadow-depth animate-scale-up max-h-[92vh] flex flex-col z-10">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-line">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white shadow-soft">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-bold tracking-tight text-ink">
                  Criar por Materiais de Estudo
                </h3>
                <p className="text-xs text-ink-soft">
                  Sintetize vídeos do YouTube, links, PDFs, fotos de lousa e anotações sem precisar de áudio.
                </p>
              </div>
            </div>
            {!isProcessing && (
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-ink-faint hover:bg-surface2 hover:text-ink transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Body with Scroll */}
          <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1">
            {/* Título e Estilo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Título da Sessão / Assunto
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Aula de Redes Neurais, Artigo sobre Economia..."
                  className="w-full rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Estilo de Síntese
                </label>
                <Select
                  value={summaryStyle}
                  onChange={(val) => setSummaryStyle(val as SummaryStyle)}
                  options={SUMMARY_STYLES.map((st) => ({
                    value: st.id,
                    label: st.title,
                    badge: st.badge,
                    description: st.domain,
                  }))}
                />
              </div>
            </div>

            {/* Input Hub Selector */}
            <div className="rounded-2xl border border-line bg-surface2/60 p-4 space-y-4 shadow-soft">
              <div className="flex items-center gap-2 border-b border-line/60 pb-3">
                <button
                  type="button"
                  onClick={() => setActiveInputTab("link")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                    activeInputTab === "link"
                      ? "bg-accent text-white shadow-soft"
                      : "bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  <Youtube className="h-3.5 w-3.5" />
                  YouTube / Link Web
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInputTab("file")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                    activeInputTab === "file"
                      ? "bg-accent text-white shadow-soft"
                      : "bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Documentos & PDFs
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInputTab("text")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                    activeInputTab === "text"
                      ? "bg-accent text-white shadow-soft"
                      : "bg-surface text-ink-soft hover:text-ink",
                  )}
                >
                  <FileCode className="h-3.5 w-3.5" />
                  Texto / Anotações
                </button>
              </div>

              {/* Tab 1: YouTube / Web Link */}
              {activeInputTab === "link" && (
                <div className="space-y-3 animate-fade-in">
                  <p className="text-[11px] text-ink-soft">
                    Cole o link de uma aula/vídeo do YouTube ou página de artigo da internet:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
                      placeholder="https://www.youtube.com/watch?v=... ou https://artigo.com/..."
                      className="flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAddLink}
                      className="shrink-0 text-xs font-semibold"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar
                    </Button>
                  </div>
                </div>
              )}

              {/* Tab 2: Document Upload & Camera */}
              {activeInputTab === "file" && (
                <div className="space-y-3 animate-fade-in">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="*/*"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-accent/40 bg-surface p-4 text-center hover:border-accent hover:bg-accent-soft/20 transition-all cursor-pointer"
                    >
                      <UploadCloud className="h-5 w-5 text-accent" />
                      <span className="text-xs font-bold text-ink">Selecionar Arquivos</span>
                      <span className="text-[10px] text-ink-faint">PDF, DOCX, TXT, MD, Imagens</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCameraOpen(true)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface p-4 text-center hover:border-accent hover:bg-accent-soft/20 transition-all cursor-pointer"
                    >
                      <Camera className="h-5 w-5 text-emerald-500" />
                      <span className="text-xs font-bold text-ink">Tirar Foto da Lousa</span>
                      <span className="text-[10px] text-ink-faint">Câmera do Celular / Webcam</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Text & Notes */}
              {activeInputTab === "text" && (
                <div className="space-y-3 animate-fade-in">
                  <input
                    type="text"
                    value={textTitleInput}
                    onChange={(e) => setTextTitleInput(e.target.value)}
                    placeholder="Título da anotação (opcional)"
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <textarea
                    rows={4}
                    value={textContentInput}
                    onChange={(e) => setTextContentInput(e.target.value)}
                    placeholder="Cole ou digite aqui seu texto, trechos de livros, ementa ou anotações..."
                    className="w-full rounded-xl border border-line bg-surface p-3 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAddText}
                    disabled={!textContentInput.trim()}
                    className="text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar Anotação
                  </Button>
                </div>
              )}
            </div>

            {/* Added Materials List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Materiais Adicionados ({materials.length})
                </h4>
                <span className="text-[10px] text-ink-faint">
                  A IA integrará todas as fontes conjuntamente
                </span>
              </div>

              {materials.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-line bg-surface2/40 p-6 text-center text-ink-faint text-xs">
                  Nenhum material adicionado ainda. Adicione links do YouTube, PDFs ou anotações acima.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {materials.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft text-xs animate-fade-in"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white font-bold",
                            m.doc_type === "youtube"
                              ? "bg-red-500"
                              : m.doc_type === "url"
                              ? "bg-sky-500"
                              : m.doc_type === "image"
                              ? "bg-emerald-500"
                              : m.doc_type === "pdf"
                              ? "bg-purple-500"
                              : "bg-amber-500",
                          )}
                        >
                          {m.doc_type === "youtube" ? (
                            <Youtube className="h-4 w-4" />
                          ) : m.doc_type === "url" ? (
                            <Globe className="h-4 w-4" />
                          ) : m.doc_type === "image" ? (
                            <Camera className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-ink truncate">{m.title}</p>
                          <p className="text-[10px] text-ink-faint truncate">
                            {m.url || m.size_label || `${m.content.slice(0, 40)}…`}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeMaterial(m.id)}
                        className="rounded-lg p-1.5 text-ink-faint hover:bg-danger-bg/20 hover:text-danger-fg transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error Display */}
            {errorMessage && (
              <div className="rounded-xl border border-danger-line bg-danger-bg/20 p-3 text-xs text-danger-fg">
                {errorMessage}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-line">
            <p className="text-[11px] text-ink-faint">
              {materials.length} material(is) selecionado(s)
            </p>
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isProcessing}
                className="w-full sm:w-auto text-xs"
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSynthesize}
                loading={isProcessing}
                disabled={materials.length === 0}
                className="w-full sm:w-auto text-xs font-semibold px-6 shadow-soft"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Sintetizar Materiais com IA
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraPhoto}
      />
    </>,
    document.body,
  );
}
