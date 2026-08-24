import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    staleTime: 60_000,
  });
}

export function useRecordings() {
  return useQuery({
    queryKey: ["recordings"],
    queryFn: api.recordings,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.some((r) =>
        ["QUEUED", "TRANSCRIBING", "SUMMARIZING"].includes(r.status),
      )
        ? 1000
        : 4000,
  });
}

export function useRecording(id: string | null) {
  return useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.recording(id!),
    enabled: Boolean(id),
    staleTime: 3000,
    refetchInterval: (query) => {
      const rec = query.state.data;
      return rec && ["QUEUED", "TRANSCRIBING", "SUMMARIZING", "DRAFT"].includes(rec.status)
        ? 1000
        : 5000;
    },
  });
}

export function useUploadRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      title,
      deferred,
      summaryStyle,
      transcriptionProvider,
      whisperModel,
      onProgress,
    }: {
      file: File;
      title?: string;
      deferred?: boolean;
      summaryStyle?: string;
      transcriptionProvider?: "local" | "openrouter";
      whisperModel?: string;
      onProgress?: (pct: number) => void;
    }) =>
      api.upload(file, {
        title,
        deferred,
        summaryStyle,
        transcriptionProvider,
        whisperModel,
        onProgress,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useCreateMaterialsSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: import("@/types").CreateMaterialsSessionRequest) =>
      api.createMaterialsSession(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useProcessRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, summaryStyle }: { id: string; summaryStyle?: string }) =>
      api.process(id, { summary_style: summaryStyle }),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useRecordingHistory(id: string | null) {
  return useQuery({
    queryKey: ["recording_history", id],
    queryFn: () => api.history(id!),
    enabled: !!id,
    staleTime: 5000,
  });
}

export function useSummarizeRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & import("@/types").SummarizePayload) =>
      api.summarize(id, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recording_history", data.id] });
      queryClient.invalidateQueries({ queryKey: ["recording_documents", data.id] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useGenerateMindmap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.generateMindmap(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useRecordingChat() {
  return useMutation({
    mutationFn: ({
      id,
      messages,
    }: {
      id: string;
      messages: import("@/types").ChatMessage[];
    }) => api.chat(id, messages),
  });
}

export function useTranscribeRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      provider,
      whisperModel,
      language,
    }: {
      id: string;
      provider?: "local" | "openrouter";
      whisperModel?: string;
      language?: string;
    }) => api.transcribe(id, { provider, whisper_model: whisperModel, language }),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recording_history", data.id] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useSelectVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      transcriptionId,
      summaryId,
    }: {
      id: string;
      transcriptionId?: string;
      summaryId?: string;
    }) => api.selectVersion(id, { transcription_id: transcriptionId, summary_id: summaryId }),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recording_history", data.id] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useRecordingDocuments(recordingId: string | null) {
  return useQuery({
    queryKey: ["recording_documents", recordingId],
    queryFn: () => api.documents(recordingId!),
    enabled: !!recordingId,
    staleTime: 3000,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordingId, file }: { recordingId: string; file: File }) =>
      api.uploadDocument(recordingId, file),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["recording_documents", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recording", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useUploadDocumentsBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordingId, files }: { recordingId: string; files: File[] }) =>
      api.uploadDocumentsBatch(recordingId, files),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["recording_documents", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recording", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useCreateDocumentNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      recordingId,
      docType,
      filename,
      contentText,
    }: {
      recordingId: string;
      docType: string;
      filename: string;
      contentText: string;
    }) =>
      api.createDocumentNote(recordingId, {
        doc_type: docType,
        filename,
        content_text: contentText,
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["recording_documents", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recording", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recordingId, docId }: { recordingId: string; docId: string }) =>
      api.deleteDocument(recordingId, docId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["recording_documents", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recording", vars.recordingId] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useRetryRecording() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retry(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useExportNotion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.exportNotion(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["recording", data.id], data);
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useDeleteRecordings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.deleteRecordings(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}

export function useDeleteAllRecordings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteAllRecordings(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    },
  });
}