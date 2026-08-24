import { useState, useRef } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  FileCode,
  FileJson,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function BackupRestoreCard() {
  const queryClient = useQueryClient();

  // Settings state
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [settingsValidating, setSettingsValidating] = useState(false);
  const [settingsPreview, setSettingsPreview] = useState<{
    valid: boolean;
    format: string;
    version: number;
    exportedAt?: string;
    totalSettings: number;
    settingsSummary: Array<{ category: string; key: string; value: unknown }>;
    rawJson: unknown;
  } | null>(null);
  const [settingsApplying, setSettingsApplying] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Full backup state
  const [fullValidating, setFullValidating] = useState(false);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [fullBackupPreview, setFullBackupPreview] = useState<{
    valid: boolean;
    format: string;
    version: number;
    exportedAt: string;
    stats: {
      recordingsCount: number;
      transcriptionsCount: number;
      summariesCount: number;
      documentsCount: number;
      audioFilesCount: number;
      docFilesCount: number;
      totalBinaryBytes: number;
    };
    recordingsPreview: Array<{ id: string; title: string; created_at: string }>;
    totalRecordings: number;
    hasSettings: boolean;
    existingConflictsCount: number;
    conflicts: Array<{ id: string; title: string }>;
  } | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<"merge" | "clean">("merge");
  const [restoreSettingsWithData, setRestoreSettingsWithData] = useState(true);
  const [fullRestoring, setFullRestoring] = useState(false);
  const [fullSuccess, setFullSuccess] = useState<string | null>(null);
  const [fullError, setFullError] = useState<string | null>(null);

  const settingsFileInputRef = useRef<HTMLInputElement | null>(null);
  const fullZipFileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Export Settings JSON
  const handleExportSettings = () => {
    const url = api.exportSettingsUrl(includeSecrets);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hianoter_settings_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 2. Select & Validate Settings JSON
  const handleSettingsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSettingsError(null);
    setSettingsSuccess(null);
    setSettingsValidating(true);

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const report = await api.validateSettingsBackup(json);
      setSettingsPreview({ ...report, rawJson: json });
    } catch (err: any) {
      setSettingsError(err.message || "Arquivo JSON de configurações inválido ou corrompido.");
    } finally {
      setSettingsValidating(false);
      if (settingsFileInputRef.current) settingsFileInputRef.current.value = "";
    }
  };

  // 3. Confirm Apply Settings
  const handleConfirmApplySettings = async () => {
    if (!settingsPreview?.rawJson) return;
    setSettingsApplying(true);
    setSettingsError(null);

    try {
      const res = await api.importSettingsBackup(settingsPreview.rawJson);
      setSettingsSuccess(res.notice || "Configurações importadas com sucesso!");
      setSettingsPreview(null);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err: any) {
      setSettingsError(err.message || "Falha ao aplicar configurações.");
    } finally {
      setSettingsApplying(false);
    }
  };

  // 4. Export Full Backup ZIP
  const handleExportFullBackup = () => {
    const url = api.exportFullBackupUrl();
    const link = document.createElement("a");
    link.href = url;
    link.download = `hianoter_full_backup_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 5. Select & Validate Full Backup ZIP
  const handleFullZipFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFullError(null);
    setFullSuccess(null);
    setSelectedZipFile(file);
    setFullValidating(true);

    try {
      const report = await api.validateFullBackup(file);
      setFullBackupPreview(report);
    } catch (err: any) {
      setFullError(err.message || "Arquivo ZIP de backup inválido ou incompatível.");
      setSelectedZipFile(null);
    } finally {
      setFullValidating(false);
      if (fullZipFileInputRef.current) fullZipFileInputRef.current.value = "";
    }
  };

  // 6. Confirm Full Restore
  const handleConfirmFullRestore = async () => {
    if (!selectedZipFile) return;
    setFullRestoring(true);
    setFullError(null);

    try {
      const res = await api.importFullBackup(
        selectedZipFile,
        conflictStrategy,
        restoreSettingsWithData,
      );
      setFullSuccess(res.message || "Backup completo restaurado com sucesso!");
      setFullBackupPreview(null);
      setSelectedZipFile(null);
      await queryClient.invalidateQueries({ queryKey: ["recordings"] });
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err: any) {
      setFullError(err.message || "Falha ao restaurar o backup completo.");
    } finally {
      setFullRestoring(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* Introduction Card */}
      <div className="rounded-2xl border border-line bg-surface/80 p-4 sm:p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
            <Archive className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-serif text-base sm:text-lg font-bold text-ink">
              Exportações, Importações e Backups
            </h3>
            <p className="text-xs sm:text-sm text-ink-soft leading-relaxed mt-0.5">
              Faça backup das suas preferências ou exporte todos os seus conteúdos (áudios, transcrições, resumos, mapas mentais e materiais) para restaurar em outro dispositivo ou ambiente.
            </p>
          </div>
        </div>
      </div>

      {/* SEÇÃO 1: CONFIGURAÇÕES DA PLATAFORMA */}
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-soft space-y-4">
        <div className="flex items-center gap-2.5 border-b border-line pb-3">
          <FileCode className="h-4 w-4 text-accent" />
          <h4 className="font-serif text-sm sm:text-base font-bold text-ink">
            Configurações da Plataforma (JSON)
          </h4>
        </div>

        <p className="text-xs text-ink-soft leading-relaxed">
          Exporte apenas suas preferências (aparência, provedores de IA, knobs de hardware do Whisper, integrações e limites) em um arquivo estruturado e versionado.
        </p>

        {settingsSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{settingsSuccess}</span>
          </div>
        )}

        {settingsError && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{settingsError}</span>
          </div>
        )}

        {/* Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Export Box */}
          <div className="rounded-xl border border-line bg-surface2/40 p-3.5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-ink-soft" />
                <span className="text-xs font-semibold text-ink">Exportar Configurações</span>
              </div>
              <p className="text-[11px] text-ink-faint mt-1">
                Gera um arquivo JSON para backup das suas opções atuais.
              </p>
              <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSecrets}
                  onChange={(e) => setIncludeSecrets(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent h-3.5 w-3.5"
                />
                <span className="text-[11px] text-ink-soft">
                  Incluir chaves de API secretas
                </span>
              </label>
            </div>
            <Button
              variant="surface"
              size="sm"
              onClick={handleExportSettings}
              className="w-full text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Baixar settings.json
            </Button>
          </div>

          {/* Import Box */}
          <div className="rounded-xl border border-line bg-surface2/40 p-3.5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-ink-soft" />
                <span className="text-xs font-semibold text-ink">Importar Configurações</span>
              </div>
              <p className="text-[11px] text-ink-faint mt-1">
                Carregue um arquivo JSON exportado anteriormente com validação prévia.
              </p>
            </div>
            <div>
              <input
                ref={settingsFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleSettingsFileChange}
                className="hidden"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => settingsFileInputRef.current?.click()}
                loading={settingsValidating}
                className="w-full text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Selecionar Arquivo JSON
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: BACKUP COMPLETO DE DADOS */}
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 shadow-soft space-y-4">
        <div className="flex items-center gap-2.5 border-b border-line pb-3">
          <HardDrive className="h-4 w-4 text-accent" />
          <h4 className="font-serif text-sm sm:text-base font-bold text-ink">
            Backup Completo da Conta (ZIP Estruturado)
          </h4>
        </div>

        <p className="text-xs text-ink-soft leading-relaxed">
          Gera um pacote compactado completo contendo o banco de dados lógico com seus relacionamentos, arquivos de áudio originais/normalizados, imagens, PDFs e anexos.
        </p>

        {fullSuccess && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{fullSuccess}</span>
          </div>
        )}

        {fullError && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{fullError}</span>
          </div>
        )}

        {/* Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Export Box */}
          <div className="rounded-xl border border-line bg-surface2/40 p-3.5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-ink-soft" />
                <span className="text-xs font-semibold text-ink">Exportar Todos os Dados</span>
              </div>
              <p className="text-[11px] text-ink-faint mt-1">
                Gera um pacote ZIP determinístico com manifest.json, banco relacional e todos os arquivos binários.
              </p>
            </div>
            <Button
              variant="surface"
              size="sm"
              onClick={handleExportFullBackup}
              className="w-full text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Baixar Backup Completo (.zip)
            </Button>
          </div>

          {/* Import Box */}
          <div className="rounded-xl border border-line bg-surface2/40 p-3.5 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-ink-soft" />
                <span className="text-xs font-semibold text-ink">Restaurar Backup Completo</span>
              </div>
              <p className="text-[11px] text-ink-faint mt-1">
                Inspeciona, valida a integridade e restaura todo o conteúdo da conta de forma transacional.
              </p>
            </div>
            <div>
              <input
                ref={fullZipFileInputRef}
                type="file"
                accept=".zip,application/zip"
                onChange={handleFullZipFileChange}
                className="hidden"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => fullZipFileInputRef.current?.click()}
                loading={fullValidating}
                className="w-full text-xs font-medium"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Selecionar Pacote (.zip)
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: PRÉVIA DE IMPORTAÇÃO DE CONFIGURAÇÕES */}
      {settingsPreview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4 animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-line bg-paper p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
                  <FileJson className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="font-serif text-base font-bold text-ink">
                    Prévia de Importação de Configurações
                  </h4>
                  <p className="text-[11px] text-ink-faint">
                    Formato: {settingsPreview.format} (v{settingsPreview.version})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSettingsPreview(null)}
                className="rounded-lg p-1.5 text-ink-faint hover:bg-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              O arquivo contém <strong>{settingsPreview.totalSettings}</strong> configurações prontas para serem aplicadas. Revise as alterações abaixo:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 rounded-2xl border border-line bg-surface p-3 font-mono text-[11px]">
              {settingsPreview.settingsSummary.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 border-b border-line/40 last:border-0">
                  <span className="text-ink-soft font-semibold">{item.category}.{item.key}:</span>
                  <span className="text-accent truncate max-w-[200px]">{String(item.value)}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="surface"
                size="sm"
                onClick={() => setSettingsPreview(null)}
                disabled={settingsApplying}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmApplySettings}
                loading={settingsApplying}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Confirmar e Aplicar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRÉVIA E CONFIRMAÇÃO DE RESTAURAÇÃO COMPLETA */}
      {fullBackupPreview && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4 animate-fade-in">
          <div className="relative w-full max-w-xl rounded-3xl border border-line bg-paper p-5 sm:p-6 shadow-2xl space-y-4 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-white shadow-soft">
                  <Archive className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="font-serif text-base font-bold text-ink">
                    Relatório de Inspeção do Backup
                  </h4>
                  <p className="text-[11px] text-ink-faint">
                    Exportado em: {new Date(fullBackupPreview.exportedAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setFullBackupPreview(null);
                  setSelectedZipFile(null);
                }}
                className="rounded-lg p-1.5 text-ink-faint hover:bg-subtle hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stats Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-xl border border-line bg-surface p-2.5">
                <div className="text-xs text-ink-faint font-medium">Gravações</div>
                <div className="text-base font-bold text-ink font-serif mt-0.5">
                  {fullBackupPreview.stats.recordingsCount || fullBackupPreview.totalRecordings}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-2.5">
                <div className="text-xs text-ink-faint font-medium">Transcrições</div>
                <div className="text-base font-bold text-ink font-serif mt-0.5">
                  {fullBackupPreview.stats.transcriptionsCount || 0}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-2.5">
                <div className="text-xs text-ink-faint font-medium">Resumos</div>
                <div className="text-base font-bold text-ink font-serif mt-0.5">
                  {fullBackupPreview.stats.summariesCount || 0}
                </div>
              </div>
              <div className="rounded-xl border border-line bg-surface p-2.5">
                <div className="text-xs text-ink-faint font-medium">Documentos / Tamanho</div>
                <div className="text-sm font-bold text-ink font-serif mt-0.5 truncate">
                  {fullBackupPreview.stats.documentsCount || 0} ({formatBytes(fullBackupPreview.stats.totalBinaryBytes || 0)})
                </div>
              </div>
            </div>

            {/* Conflict Warning */}
            {fullBackupPreview.existingConflictsCount > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>{fullBackupPreview.existingConflictsCount} gravações existentes detectadas</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                  Algumas gravações no backup possuem IDs idênticos a itens já salvos nesta máquina.
                </p>
              </div>
            )}

            {/* Conflict Strategy Selection */}
            <div className="space-y-2 rounded-2xl border border-line bg-surface p-3.5 text-xs">
              <label className="font-semibold text-ink block">
                Modo de Restauração:
              </label>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="conflictStrategy"
                    value="merge"
                    checked={conflictStrategy === "merge"}
                    onChange={() => setConflictStrategy("merge")}
                    className="mt-0.5 text-accent focus:ring-accent"
                  />
                  <div>
                    <span className="font-medium text-ink">Mesclar e Atualizar (Recomendado)</span>
                    <p className="text-[11px] text-ink-faint">
                      Mantém suas gravações atuais e adiciona/atualiza as gravações vindas do backup.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="conflictStrategy"
                    value="clean"
                    checked={conflictStrategy === "clean"}
                    onChange={() => setConflictStrategy("clean")}
                    className="mt-0.5 text-accent focus:ring-accent"
                  />
                  <div>
                    <span className="font-medium text-rose-600 dark:text-rose-400">Substituição Limpa (Substituir tudo)</span>
                    <p className="text-[11px] text-ink-faint">
                      Apaga o banco atual e substitui 100% pelo conteúdo exato do backup.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Option to Restore Settings */}
            {fullBackupPreview.hasSettings && (
              <label className="flex items-center gap-2 cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  checked={restoreSettingsWithData}
                  onChange={(e) => setRestoreSettingsWithData(e.target.checked)}
                  className="rounded border-line text-accent focus:ring-accent h-3.5 w-3.5"
                />
                <span className="text-xs text-ink-soft">
                  Restaurar também as preferências e configurações incluídas no backup
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button
                variant="surface"
                size="sm"
                onClick={() => {
                  setFullBackupPreview(null);
                  setSelectedZipFile(null);
                }}
                disabled={fullRestoring}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmFullRestore}
                loading={fullRestoring}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", fullRestoring && "animate-spin")} />
                Restaurar Backup Agora
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
