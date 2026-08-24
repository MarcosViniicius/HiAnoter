import type {
  Health,
  ModelsResponse,
  Recording,
  RecordingDocument,
  SettingsResponse,
  SettingsUpdateResponse,
  UploadResponse,
} from "@/types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${url}`, init);
  if (resp.status === 204) return undefined as T;
  const contentType = resp.headers.get("content-type") ?? "";
  let body: unknown = null;
  if (contentType.includes("application/json")) {
    try {
      body = await resp.json();
    } catch {
      body = null;
    }
  }
  if (!resp.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `Erro ${resp.status}`;
    throw new ApiError(resp.status, detail);
  }
  return body as T;
}

export const api = {
  health: () => http<Health>("/api/health"),
  recordings: () => http<Recording[]>("/api/recordings"),
  recording: (id: string) => http<Recording>(`/api/recordings/${id}`),
  audioUrl: (id: string) => `${API_BASE}/api/recordings/${id}/audio`,
  streamUrl: (id: string) => `${API_BASE}/api/recordings/${id}/stream`,
  eventsStreamUrl: () => `${API_BASE}/api/recordings/events/stream`,

  async upload(
    file: File,
    options?: {
      title?: string;
      deferred?: boolean;
      summaryStyle?: string;
      transcriptionProvider?: "local" | "openrouter";
      whisperModel?: string;
      onProgress?: (pct: number) => void;
    },
  ): Promise<UploadResponse> {
    const form = new FormData();
    form.append("file", file);

    const query = new URLSearchParams();
    if (options?.title) query.set("title", options.title);
    if (options?.deferred) query.set("deferred", "true");
    if (options?.summaryStyle) query.set("summary_style", options.summaryStyle);
    if (options?.transcriptionProvider) query.set("transcription_provider", options.transcriptionProvider);
    if (options?.whisperModel) query.set("whisper_model", options.whisperModel);
    const queryString = query.toString() ? `?${query.toString()}` : "";
    const endpoint = `/api/recordings/upload${queryString}`;

    const onProgress = options?.onProgress;
    if (!onProgress) {
      return http<UploadResponse>(endpoint, { method: "POST", body: form });
    }
    return new Promise<UploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}${endpoint}`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(xhr.response as UploadResponse);
        } else {
          const detail =
            xhr.response &&
            typeof xhr.response === "object" &&
            "detail" in xhr.response
              ? String(xhr.response.detail)
              : `Erro ${xhr.status}`;
          reject(new ApiError(xhr.status, detail));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, "Falha de rede no envio."));
      xhr.send(form);
    });
  },

  createMaterialsSession: (payload: import("@/types").CreateMaterialsSessionRequest) =>
    http<Recording>("/api/recordings/materials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  process: (id: string, payload?: { summary_style?: string; transcription_provider?: string; whisper_model?: string }) =>
    http<Recording>(`/api/recordings/${id}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    }),

  uploadDocument: async (recordingId: string, file: File): Promise<RecordingDocument> => {
    const form = new FormData();
    form.append("file", file);
    return http<RecordingDocument>(`/api/recordings/${recordingId}/documents/upload`, {
      method: "POST",
      body: form,
    });
  },

  uploadDocumentsBatch: async (recordingId: string, files: File[]): Promise<RecordingDocument[]> => {
    const form = new FormData();
    for (const f of files) {
      form.append("files", f);
    }
    return http<RecordingDocument[]>(`/api/recordings/${recordingId}/documents/batch`, {
      method: "POST",
      body: form,
    });
  },

  createDocumentNote: (
    recordingId: string,
    payload: { doc_type: string; filename: string; content_text: string },
  ) =>
    http<RecordingDocument>(`/api/recordings/${recordingId}/documents/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  documents: (recordingId: string) =>
    http<RecordingDocument[]>(`/api/recordings/${recordingId}/documents`),

  documentManifest: (recordingId: string, docId: string) =>
    http<import("@/types").DocumentManifest>(`/api/recordings/${recordingId}/documents/${docId}/manifest`),

  documentAssetUrl: (recordingId: string, docId: string, assetType: string, filename: string) =>
    `/api/recordings/${recordingId}/documents/${docId}/assets/${assetType}/${filename}`,

  deleteDocument: (recordingId: string, docId: string) =>
    http<{ ok: boolean; deleted: string }>(
      `/api/recordings/${recordingId}/documents/${docId}`,
      { method: "DELETE" },
    ),

  summarize: (id: string, payload: import("@/types").SummarizePayload | string) => {
    const body = typeof payload === "string" ? { style: payload } : payload;
    return http<Recording>(`/api/recordings/${id}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  generateMindmap: (id: string) =>
    http<Recording>(`/api/recordings/${id}/mindmap`, {
      method: "POST",
    }),

  chat: (id: string, messages: import("@/types").ChatMessage[]) =>
    http<import("@/types").ChatResponse>(`/api/recordings/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }),

  transcribe: (id: string, payload?: import("@/types").TranscribeRequest) =>
    http<Recording>(`/api/recordings/${id}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    }),

  history: (id: string) =>
    http<{
      transcriptions: import("@/types").TranscriptionVersion[];
      summaries: import("@/types").SummaryVersion[];
      active_transcription_id?: string | null;
      active_summary_id?: string | null;
    }>(`/api/recordings/${id}/history`),

  selectVersion: (
    id: string,
    payload: { transcription_id?: string; summary_id?: string },
  ) =>
    http<Recording>(`/api/recordings/${id}/select-version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  retry: (id: string) =>
    http<Recording>(`/api/recordings/${id}/retry`, { method: "POST" }),

  deleteRecording: (id: string) =>
    http<{ ok: boolean; deleted: string[] }>(`/api/recordings/${id}`, { method: "DELETE" }),

  deleteRecordings: (ids: string[]) =>
    http<{ ok: boolean; removed: number }>("/api/recordings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }),

  deleteAllRecordings: () =>
    http<{ ok: boolean; removed: number }>("/api/recordings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }),

  exportNotion: (id: string) =>
    http<Recording>(`/api/recordings/${id}/export-notion`, { method: "POST" }),

  settings: () => http<SettingsResponse>("/api/settings"),

  updateSettings: (values: Record<string, unknown>) =>
    http<SettingsUpdateResponse>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }),

  resetSettings: () =>
    http<SettingsUpdateResponse>("/api/settings/reset", { method: "POST" }),

  models: (options?: boolean | { provider?: string; apiKey?: string; baseUrl?: string; force?: boolean }) => {
    if (typeof options === "boolean") {
      return http<ModelsResponse>(`/api/settings/models${options ? "?force=1" : ""}`);
    }
    const query = new URLSearchParams();
    if (options?.provider) query.set("provider", options.provider);
    if (options?.apiKey) query.set("api_key", options.apiKey);
    if (options?.baseUrl) query.set("base_url", options.baseUrl);
    if (options?.force) query.set("force", "1");
    const qs = query.toString() ? `?${query.toString()}` : "";
    return http<ModelsResponse>(`/api/settings/models${qs}`);
  },

  // ---------------------------------------------------------------- backup & restore
  exportSettingsUrl: (includeSecrets: boolean = false) =>
    `/api/backup/settings/export?include_secrets=${includeSecrets ? "true" : "false"}`,

  exportFullBackupUrl: () => "/api/backup/full/export",

  validateSettingsBackup: (data: unknown) =>
    http<{
      valid: boolean;
      format: string;
      version: number;
      exportedAt?: string;
      totalSettings: number;
      settingsSummary: Array<{ category: string; key: string; value: unknown }>;
    }>("/api/backup/settings/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    }),

  importSettingsBackup: (data: unknown) =>
    http<{
      ok: boolean;
      updatedCount: number;
      updated: string[];
      requiresRestart: string[];
      notice: string;
    }>("/api/backup/settings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    }),

  validateFullBackup: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/backup/full/validate", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha na validação do backup" }));
      throw new Error(err.detail || "Falha na validação do backup");
    }
    return res.json() as Promise<{
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
      missingFilesCount: number;
    }>;
  },

  importFullBackup: async (
    file: File,
    conflictStrategy: "merge" | "clean" = "merge",
    restoreSettings: boolean = true,
  ) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conflict_strategy", conflictStrategy);
    formData.append("restore_settings", String(restoreSettings));
    const res = await fetch("/api/backup/full/import", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Falha na restauração do backup" }));
      throw new Error(err.detail || "Falha na restauração do backup");
    }
    return res.json() as Promise<{
      ok: boolean;
      recordingsRestored: number;
      transcriptionsRestored: number;
      summariesRestored: number;
      documentsRestored: number;
      filesExtracted: number;
      message: string;
    }>;
  },
};