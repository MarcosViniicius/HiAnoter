import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FileAudio,
  HardDrive,
  Home,
  Laptop,
  Mic,
  Mic2,
  Moon,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  UploadCloud,
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { DetailView } from "@/components/DetailView";
import { SettingsPanel } from "@/components/SettingsPanel";
import { UploadFlowModal } from "@/components/UploadFlowModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { LiveRecordingBar } from "@/components/LiveRecordingBar";
import { LiveRecordingStudio } from "@/components/LiveRecordingStudio";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { QuickScrollWidget } from "@/components/QuickScrollWidget";
import { useHealth, useRecording, useRecordings } from "@/hooks/queries";
import { useGlobalLiveEvents } from "@/hooks/useRecordingLive";
import { LiveRecordingProvider, useLiveRecording } from "@/context/LiveRecordingContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { formatDate, formatDuration } from "@/lib/format";
import { api } from "@/lib/api";

function selectedFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;
  const m = hash.match(/^#\/?recording\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

const ACCEPT = ".mp3,.m4a,.wav,.ogg,.webm,.mp4,.flac,.aac,.wma";

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <LiveRecordingProvider>
          <AppContent />
        </LiveRecordingProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const [selectedId, setSelectedId] = useState<string | null>(selectedFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    return localStorage.getItem("hinoter_onboarding_completed") !== "true";
  });
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [windowDragging, setWindowDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const dragCounter = useRef(0);
  const { openStudio } = useLiveRecording();
  const { theme, toggleTheme } = useTheme();
  const { data: currentRecording } = useRecording(selectedId ?? "");

  const select = (id: string) => {
    setSelectedId(id);
    window.location.hash = `/recording/${id}`;
    setMobileSidebarOpen(false);
  };

  // Escuta global de eventos em tempo real para todo o workspace
  useGlobalLiveEvents(select);

  useEffect(() => {
    const onHash = () => setSelectedId(selectedFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        if (mobileSidebarOpen) setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, mobileSidebarOpen]);

  // Global window drag and drop
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current += 1;
      if (e.dataTransfer?.types?.includes("Files")) {
        setWindowDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        setWindowDragging(false);
        dragCounter.current = 0;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setWindowDragging(false);
      const droppedFiles = e.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        setUploadedFile(droppedFiles[0]);
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const handleDeleted = (ids: string[]) => {
    if (selectedId && ids.includes(selectedId)) {
      setSelectedId(null);
      window.location.hash = "";
    }
  };

  const handleBackToWelcome = () => {
    setSelectedId(null);
    window.location.hash = "";
  };

  const handleCreateMaterialsSession = async () => {
    try {
      const rec = await api.createMaterialsSession({
        title: `Sessão de Estudo (${new Date().toLocaleDateString("pt-BR")})`,
        summary_style: "ABSTRACT",
        materials: [],
      });
      select(rec.id);
    } catch (err) {
      console.error("Erro ao criar sessão de materiais:", err);
    }
  };

  return (
    <div className="relative flex h-full min-h-[100dvh] w-full overflow-hidden bg-paper">
      <div className="grain" aria-hidden="true" />

      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>

      {/* Global Drag & Drop Overlay */}
      {windowDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent bg-paper/95 p-8 sm:p-12 text-center shadow-2xl animate-scale-in max-w-sm sm:max-w-md mx-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-white shadow-lg">
              <UploadCloud className="h-8 w-8 animate-bounce" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-ink">Solte o arquivo de áudio aqui</h3>
            <p className="text-xs sm:text-sm text-ink-soft">
              MP3, M4A, WAV, OGG, WEBM, MP4 · Processamento rápido com IA
            </p>
          </div>
        </div>
      )}

      {/* Upload Flow Modal */}
      {uploadedFile && (
        <UploadFlowModal
          file={uploadedFile}
          onClose={() => setUploadedFile(null)}
          onOpenSettings={() => setSettingsOpen(true)}
          onComplete={(id) => {
            setUploadedFile(null);
            select(id);
          }}
        />
      )}

      {/* Persistent Live Recording Bar (Sticky bottom) */}
      <LiveRecordingBar onFinalize={openStudio} />

      {/* Dedicated Live Recording Studio (Modal/Drawer) */}
      <LiveRecordingStudio
        onCompleted={(id) => select(id)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Mobile Slide-Over Sidebar Drawer (screens < lg) */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex w-80 max-w-[85vw] flex-1 flex-col shadow-2xl animate-fade-in z-10">
            <Sidebar
              selectedId={selectedId}
              onSelect={select}
              onOpenSettings={() => {
                setSettingsOpen(true);
                setMobileSidebarOpen(false);
              }}
              onDeleted={handleDeleted}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Desktop Sidebar (Only visible on lg: screens and when not collapsed) */}
      {desktopSidebarOpen && (
        <Sidebar
          selectedId={selectedId}
          onSelect={select}
          onOpenSettings={() => setSettingsOpen(true)}
          onDeleted={handleDeleted}
          className="hidden lg:flex w-72 xl:w-80 shrink-0"
        />
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-paper">
        {/* Unified Responsive App Header */}
        <header className="flex items-center justify-between border-b border-line bg-paper px-3 py-2.5 sm:px-6 sm:py-3 shrink-0 pt-safe z-10">
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            {/* Desktop Sidebar Toggle (Only visible on lg: screens) */}
            <button
              type="button"
              onClick={() => setDesktopSidebarOpen((v) => !v)}
              className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft hover:text-ink hover:bg-surface2 transition-colors shadow-soft"
              title={desktopSidebarOpen ? "Recolher barra lateral" : "Expandir barra lateral"}
            >
              {desktopSidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4 text-accent" />
              )}
            </button>

            {/* Mobile Sidebar Button (Open Drawer on mobile) */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="flex lg:hidden items-center justify-center h-9 w-9 rounded-xl border border-line bg-surface text-ink-soft hover:text-ink hover:bg-surface2 shadow-soft active:scale-95 transition-transform touch-tap"
              aria-label="Abrir menu de gravações"
              title="Gravações salvas"
            >
              <PanelLeft className="h-4 w-4 text-accent" />
            </button>

            {/* Home Button (Always available to return to Home / Main Menu) */}
            <button
              type="button"
              onClick={handleBackToWelcome}
              className={`flex items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 sm:px-3 py-1.5 text-xs font-semibold shadow-soft active:scale-95 transition-all touch-tap ${
                !selectedId ? "bg-accent/10 border-accent/40 text-accent" : "text-ink hover:bg-surface2"
              }`}
              title="Ir para a Tela Principal (Home)"
            >
              <Home className="h-3.5 w-3.5 text-accent" />
              <span className="hidden xs:inline font-sans">Início</span>
            </button>

            {/* Brand Logo */}
            {!selectedId && (
              <div className="hidden sm:flex items-center gap-2 pl-1">
                <span className="font-serif text-lg font-bold tracking-tight text-ink">
                  HiAnoter
                </span>
                <span className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-ink-soft">
                  Lite
                </span>
              </div>
            )}

            {/* Recording Title Breadcrumb (When recording selected) */}
            {selectedId && currentRecording && (
              <div className="flex items-center gap-1.5 min-w-0 max-w-[140px] xs:max-w-[200px] sm:max-w-xs md:max-w-md">
                <span className="text-ink-faint text-xs">/</span>
                <span className="text-xs font-semibold text-ink truncate">
                  {currentRecording.title}
                </span>
              </div>
            )}
          </div>

          {/* Right Action Shortcuts */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Theme Toggle Button (Light / Dark / System) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft hover:text-ink hover:bg-surface2 shadow-soft active:scale-95 transition-transform touch-tap"
              aria-label="Alternar tema claro/escuro"
              title={`Tema: ${theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Automático (Sistema)"}`}
            >
              {theme === "dark" ? (
                <Moon className="h-4 w-4 text-accent" />
              ) : theme === "light" ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Laptop className="h-4 w-4 text-ink-soft" />
              )}
            </button>

            <button
              type="button"
              onClick={openStudio}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-2.5 sm:px-3.5 text-xs font-semibold text-white shadow-soft hover:bg-accent-deep active:scale-95 transition-all touch-tap"
              title="Iniciar Gravação"
            >
              <Mic className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Gravar</span>
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft hover:text-ink hover:bg-surface2 shadow-soft active:scale-95 transition-transform touch-tap"
              aria-label="Configurações"
              title="Configurações"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main id="conteudo" className="flex-1 overflow-y-auto min-w-0">
          {selectedId ? (
            <DetailView
              key={selectedId}
              recordingId={selectedId}
              onBack={handleBackToWelcome}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <Welcome
              onOpenSettings={() => setSettingsOpen(true)}
              onFilePick={(f) => setUploadedFile(f)}
              onSelectRecording={(id) => select(id)}
              onOpenSidebar={() => setMobileSidebarOpen(true)}
              onCreateMaterialsSession={handleCreateMaterialsSession}
            />
          )}
        </main>
      </div>

      {/* Floating Quick Scroll & Section Navigation Widget */}
      <QuickScrollWidget />

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Onboarding Automático na Primeira Utilização */}
      <OnboardingModal
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
        isReview={false}
      />
    </div>
  );
}

function Welcome({
  onOpenSettings,
  onFilePick,
  onSelectRecording,
  onOpenSidebar,
  onCreateMaterialsSession,
}: {
  onOpenSettings: () => void;
  onFilePick: (f: File) => void;
  onSelectRecording?: (id: string) => void;
  onOpenSidebar?: () => void;
  onCreateMaterialsSession?: () => void;
}) {
  const health = useHealth();
  const { data: recordings } = useRecordings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const device = health.data?.device;
  const { openStudio } = useLiveRecording();
  const { theme, toggleTheme } = useTheme();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = recordings ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.original_filename.toLowerCase().includes(q) ||
        (r.summary_preview && r.summary_preview.toLowerCase().includes(q)),
    );
  }, [recordings, search]);

  const totalCount = recordings?.length ?? 0;
  const totalDurationSeconds = (recordings ?? []).reduce((acc, r) => acc + (r.duration_seconds || 0), 0);
  const completedCount = (recordings ?? []).filter((r) => r.status === "COMPLETED").length;

  return (
    <div className="w-full max-w-4xl mx-auto px-3 py-4 sm:px-6 sm:py-8 lg:px-8 space-y-6 sm:space-y-8 animate-fade-up">
      {/* Hero Welcome Card */}
      <div className="rounded-2xl sm:rounded-3xl border border-line bg-surface p-4 sm:p-7 md:p-8 shadow-soft space-y-5">
        <EmptyState
          icon={<Mic2 className="h-6 w-6 sm:h-7 sm:w-7 text-accent" />}
          title="Bem-vindo ao HiAnoter"
          description="Grave sua aula ou reunião ao vivo pelo microfone, importe áudios ou crie estudos por documentos/PDFs. A IA sintetiza resumos estruturados e mapas mentais com suporte offline e em rede."
        />

        {/* Quick Workspace Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-1 border-t border-line/60">
          <div className="rounded-xl border border-line bg-surface2/60 p-2.5 text-center">
            <span className="font-mono text-base sm:text-lg font-bold text-ink block">
              {totalCount}
            </span>
            <span className="text-[10.5px] sm:text-[11px] text-ink-faint">
              Gravações Salvas
            </span>
          </div>

          <div className="rounded-xl border border-line bg-surface2/60 p-2.5 text-center">
            <span className="font-mono text-base sm:text-lg font-bold text-accent block">
              {totalDurationSeconds > 0 ? formatDuration(totalDurationSeconds) : "00:00"}
            </span>
            <span className="text-[10.5px] sm:text-[11px] text-ink-faint">
              Tempo Processado
            </span>
          </div>

          <div className="rounded-xl border border-line bg-surface2/60 p-2.5 text-center">
            <span className="font-mono text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 block">
              {completedCount}
            </span>
            <span className="text-[10.5px] sm:text-[11px] text-ink-faint">
              Resumos Concluídos
            </span>
          </div>

          <div className="rounded-xl border border-line bg-surface2/60 p-2.5 text-center">
            <span className="font-mono text-xs sm:text-sm font-bold text-ink block truncate mt-0.5">
              {device?.device !== "cpu" ? (device?.gpu_name ?? "GPU") : "CPU"}
            </span>
            <span className="text-[10.5px] sm:text-[11px] text-ink-faint">
              Aceleração Whisper
            </span>
          </div>
        </div>

        {/* Action cards: 4 Primary Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5 pt-1">
          {/* Option 1: Live Record */}
          <button
            type="button"
            onClick={openStudio}
            className="group flex flex-col items-start gap-2.5 rounded-2xl border-2 border-accent bg-accent-soft p-4 text-left transition-all hover:bg-accent-soft/80 hover:shadow-soft active:scale-[0.99] touch-tap min-h-[120px] justify-between"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white shadow-sm transition-transform group-hover:scale-105">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-accent-deep block">
                Gravar Áudio ao Vivo
              </span>
              <p className="text-[11.5px] text-ink-soft leading-snug mt-0.5">
                Microfone em segundo plano com notas e anexos
              </p>
            </div>
          </button>

          {/* Option 2: File Upload */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group flex flex-col items-start gap-2.5 rounded-2xl border-2 border-dashed border-line bg-surface2/60 p-4 text-left transition-all hover:border-accent/60 hover:bg-surface2 hover:shadow-soft active:scale-[0.99] touch-tap min-h-[120px] justify-between"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2 text-ink-soft transition-transform group-hover:scale-105 group-hover:text-accent">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-ink block">
                Importar Áudio / Vídeo
              </span>
              <p className="text-[11.5px] text-ink-faint leading-snug mt-0.5">
                MP3 · M4A · WAV · máx {health.data?.max_upload_mb ?? 300} MB
              </p>
            </div>
          </button>

          {/* Option 3: Document / PDF Study Session */}
          <button
            type="button"
            onClick={onCreateMaterialsSession}
            className="group flex flex-col items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:border-accent/60 hover:bg-surface2 hover:shadow-soft active:scale-[0.99] touch-tap min-h-[120px] justify-between"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 transition-transform group-hover:scale-105">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-ink block">
                Estudo por Documentos
              </span>
              <p className="text-[11.5px] text-ink-soft leading-snug mt-0.5">
                Análise multimodal de PDFs, slides e notas
              </p>
            </div>
          </button>

          {/* Option 4: Open Sidebar / Full Library */}
          <button
            type="button"
            onClick={onOpenSidebar}
            className="group flex flex-col items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:border-accent/60 hover:bg-surface2 hover:shadow-soft active:scale-[0.99] touch-tap min-h-[120px] justify-between sm:hidden lg:flex"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2 text-accent transition-transform group-hover:scale-105">
              <PanelLeft className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-ink block">
                Menu Lateral & Biblioteca
              </span>
              <p className="text-[11.5px] text-ink-soft leading-snug mt-0.5">
                Gerenciar e filtrar todas as gravações
              </p>
            </div>
          </button>

          {/* Option 5: Toggle Theme */}
          <button
            type="button"
            onClick={toggleTheme}
            className="group flex flex-col items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:border-accent/60 hover:bg-surface2 hover:shadow-soft active:scale-[0.99] touch-tap min-h-[120px] justify-between sm:hidden lg:flex"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2 text-amber-500 transition-transform group-hover:scale-105">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-ink block">
                Tema: {theme === "dark" ? "Escuro" : theme === "light" ? "Claro" : "Sistema"}
              </span>
              <p className="text-[11.5px] text-ink-soft leading-snug mt-0.5">
                Toque para alternar modo claro / escuro
              </p>
            </div>
          </button>

          {/* Option 6: Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="group flex flex-col items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:border-accent/60 hover:bg-surface2 hover:shadow-soft active:scale-[0.99] touch-tap min-h-[120px] justify-between"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface2 text-ink-soft transition-transform group-hover:scale-105 group-hover:text-accent">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-ink block">
                Configurações & IA
              </span>
              <p className="text-[11.5px] text-ink-soft leading-snug mt-0.5">
                Provedores LLM, chaves e preferências
              </p>
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept={ACCEPT}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFilePick(f);
            }}
          />
        </div>
      </div>

      {/* Primary Recordings Feed: Naturally available on ALL screens */}
      {totalCount > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h2 className="font-serif text-lg font-bold tracking-tight text-ink flex items-center gap-2">
                <span>Suas Gravações & Resumos</span>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-xs font-bold text-accent">
                  {totalCount}
                </span>
              </h2>
              <p className="text-xs text-ink-faint">
                {totalCount === 1 ? "1 item salvo" : `${totalCount} itens salvos`} no dispositivo
              </p>
            </div>

            {/* Quick Search */}
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs w-full sm:w-72 shadow-soft">
              <Search className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por título ou arquivo…"
                className="w-full bg-transparent text-xs text-ink placeholder:text-ink-faint focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((rec) => (
              <button
                key={rec.id}
                type="button"
                onClick={() => onSelectRecording?.(rec.id)}
                className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 text-left shadow-soft transition-all hover:border-accent/40 hover:bg-surface2 hover:shadow-raise active:scale-[0.99] touch-tap"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent group-hover:bg-accent group-hover:text-white transition-colors">
                        {rec.execution_mode === "MATERIALS" ? (
                          <BookOpen className="h-4 w-4" />
                        ) : (
                          <FileAudio className="h-4 w-4" />
                        )}
                      </span>
                      <p className="truncate text-sm font-semibold text-ink group-hover:text-accent transition-colors">
                        {rec.title}
                      </p>
                    </div>
                    <StatusBadge status={rec.status} className="shrink-0" />
                  </div>

                  <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                    {rec.summary_preview || "Resumo ainda não gerado ou em processamento."}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-2.5 text-[11px] text-ink-faint font-mono">
                  <span>{formatDate(rec.created_at)}</span>
                  <span>{rec.duration_seconds > 0 ? formatDuration(rec.duration_seconds) : rec.execution_mode === "MATERIALS" ? "Documentos" : "00:00"}</span>
                </div>
              </button>
            ))}

            {filtered.length === 0 && (
              <div className="col-span-full py-8 text-center rounded-2xl border border-dashed border-line bg-surface2/40">
                <p className="text-xs text-ink-faint">
                  Nenhuma gravação encontrada com "{search}".
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* System info & steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
            Como funciona o HiAnoter
          </h3>
          <ol className="space-y-2.5">
            <li className="flex items-start gap-2.5 text-xs text-ink-soft">
              <StepBadge n="01" />
              <span>Gravação ao vivo com notas ou upload de arquivos</span>
            </li>
            <li className="flex items-start gap-2.5 text-xs text-ink-soft">
              <StepBadge n="02" />
              <span>Transcrição local ultrarrápida com faster-whisper</span>
            </li>
            <li className="flex items-start gap-2.5 text-xs text-ink-soft">
              <StepBadge n="03" />
              <span>5 estilos científicos de resumo + Mapa Mental Radial</span>
            </li>
            <li className="flex items-start gap-2.5 text-xs text-ink-soft">
              <StepBadge n="04" />
              <span>Exportação estruturada para o Notion</span>
            </li>
          </ol>
        </div>

        {device && (
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Motor Local de IA
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-ink-soft font-medium">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Processamento
                </span>
                <span className="font-mono text-ink-faint">
                  {device.device !== "cpu"
                    ? `${device.gpu_name ?? device.device} · ${device.engine}`
                    : `CPU · ${device.compute_type}`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-ink-soft font-medium">
                  <HardDrive className="h-3.5 w-3.5 text-accent" />
                  Modelo Whisper
                </span>
                <span className="font-mono text-ink-faint">
                  {health.data?.whisper_model ?? "—"}
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-line/60 flex justify-end">
              <Button variant="surface" size="sm" onClick={onOpenSettings}>
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                Configurações
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepBadge({ n }: { n: string }) {
  return (
    <span className="mt-px flex h-6 w-9 shrink-0 items-center justify-center rounded-md bg-subtle font-mono text-[11px] font-semibold tabular-nums text-ink-soft">
      {n}
    </span>
  );
}