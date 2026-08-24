import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { Recording } from "@/types";

interface SsePayload {
  id?: string;
  title?: string;
  status?: Recording["status"];
  progress_pct?: number;
  error_message?: string | null;
  summary_updated?: boolean;
  mindmap_updated?: boolean;
  mindmap_generating?: boolean;
  mindmap_error?: string;
  summary_error_message?: string | null;
  documents_count?: number;
  notion_export_status?: string;
  notion_page_url?: string;
  notion_error_message?: string;
  deleted?: string[];
  action?: string;
  filename?: string;
  version_switched?: boolean;
}

function parseData(raw: string): SsePayload {
  try {
    return JSON.parse(raw) as SsePayload;
  } catch {
    return {};
  }
}

/**
 * Hook de escuta em tempo real (SSE) para a gravação específica atualmente aberta no DetailView.
 */
export function useRecordingLive(id: string | null, enabled = true) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const lastEventRef = useRef<string>("");

  useEffect(() => {
    if (!id || !enabled) return;
    let closed = false;
    const es = new EventSource(api.streamUrl(id));

    const merge = (patch: Partial<Recording>) => {
      if (closed) return;
      queryClient.setQueryData<Recording>(["recording", id], (old) => {
        if (!old) return old;
        return { ...old, ...patch };
      });
      // Atualiza também na lista para refletir status e progresso imediatamente
      queryClient.setQueryData<Recording[]>(["recordings"], (list) => {
        if (!list) return list;
        return list.map((r) => (r.id === id ? { ...r, ...patch } : r));
      });
    };

    const refreshRecording = async () => {
      if (closed) return;
      try {
        const fresh = await api.recording(id);
        if (!closed && fresh) {
          queryClient.setQueryData(["recording", id], fresh);
        }
      } catch {}
      queryClient.invalidateQueries({ queryKey: ["recording_history", id] });
      queryClient.invalidateQueries({ queryKey: ["recording_documents", id] });
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
    };

    const handleMessage = (e: MessageEvent, eventType: string) => {
      if (closed) return;
      const patch = parseData(e.data);
      const eventKey = `${eventType}:${JSON.stringify(patch)}`;
      if (lastEventRef.current === eventKey && eventType !== "progress") return;
      lastEventRef.current = eventKey;

      if (eventType === "progress") {
        if (patch.status) {
          merge({
            status: patch.status,
            progress_pct: patch.progress_pct ?? 0,
            error_message: patch.error_message,
          });
          if (patch.status === "COMPLETED" || patch.status === "FAILED") {
            void refreshRecording();
          }
        }
      } else if (eventType === "done") {
        void refreshRecording();
        if (patch.summary_updated) {
          toast.success("Resumo gerado com sucesso!", {
            description: "O novo resumo analítico já está disponível na aba Resumo.",
          });
        } else if (patch.mindmap_updated) {
          toast.success("Mapa mental gerado com sucesso!", {
            description: "A árvore conceitual visual foi atualizada.",
          });
        }
      } else if (eventType === "document_updated") {
        queryClient.invalidateQueries({ queryKey: ["recording_documents", id] });
        queryClient.invalidateQueries({ queryKey: ["recording", id] });
        queryClient.invalidateQueries({ queryKey: ["recordings"] });
        if (patch.action === "added" || patch.action === "batch_added") {
          toast.success(
            patch.action === "batch_added"
              ? `${patch.documents_count ?? "Documentos"} anexados com sucesso!`
              : `Documento "${patch.filename || "anexo"}" processado!`,
          );
        }
      } else if (eventType === "notion_updated") {
        void refreshRecording();
        if (patch.notion_export_status === "EXPORTED") {
          toast.success("Sincronizado com o Notion!", {
            description: "Página criada com tarefas e resumo estruturado.",
            action: patch.notion_page_url
              ? {
                  label: "Abrir no Notion",
                  onClick: () => window.open(patch.notion_page_url, "_blank"),
                }
              : undefined,
          });
        } else if (patch.notion_export_status === "FAILED") {
          toast.error("Falha ao exportar para o Notion", {
            description: patch.notion_error_message || "Verifique as credenciais nas configurações.",
          });
        }
      } else if (eventType === "error") {
        void refreshRecording();
        if (patch.summary_error_message) {
          toast.error("Erro ao gerar resumo", {
            description: patch.summary_error_message,
          });
        } else if (patch.mindmap_error) {
          toast.error("Erro ao gerar mapa mental", {
            description: patch.mindmap_error,
          });
        }
      }
    };

    es.addEventListener("progress", (e) => handleMessage(e as MessageEvent, "progress"));
    es.addEventListener("done", (e) => handleMessage(e as MessageEvent, "done"));
    es.addEventListener("document_updated", (e) => handleMessage(e as MessageEvent, "document_updated"));
    es.addEventListener("notion_updated", (e) => handleMessage(e as MessageEvent, "notion_updated"));
    es.addEventListener("error", (e) => handleMessage(e as MessageEvent, "error"));

    return () => {
      closed = true;
      es.close();
    };
  }, [id, queryClient, enabled, toast]);
}

/**
 * Hook global de escuta SSE no workspace para manter Sidebar, Welcome Feed e contadores
 * 100% sincronizados em tempo real, sem necessidade de reload manual ou polling pesado.
 */
export function useGlobalLiveEvents(onSelectRecording?: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;

    try {
      es = new EventSource(api.eventsStreamUrl());
    } catch {
      return;
    }

    const handleGlobalEvent = (e: MessageEvent, eventType: string) => {
      if (closed) return;
      const patch = parseData(e.data);
      const rid = patch.id;

      if (eventType === "deleted") {
        queryClient.invalidateQueries({ queryKey: ["recordings"] });
        return;
      }

      if (!rid) {
        queryClient.invalidateQueries({ queryKey: ["recordings"] });
        return;
      }

      // Atualiza o item na lista se existir
      queryClient.setQueryData<Recording[]>(["recordings"], (list) => {
        if (!list) return list;
        const exists = list.some((r) => r.id === rid);
        if (!exists && patch.title) {
          // Nova gravação aparecendo em tempo real
          queryClient.invalidateQueries({ queryKey: ["recordings"] });
          return list;
        }
        return list.map((r) => {
          if (r.id !== rid) return r;
          return {
            ...r,
            status: patch.status ?? r.status,
            progress_pct: patch.progress_pct ?? r.progress_pct,
            summary_style: (patch as any).summary_style ?? r.summary_style,
          };
        });
      });

      if (eventType === "done") {
        queryClient.invalidateQueries({ queryKey: ["recordings"] });
        queryClient.invalidateQueries({ queryKey: ["recording", rid] });
        if (patch.status === "COMPLETED" && !patch.summary_updated && !patch.mindmap_updated) {
          toast.success(`Transcrição concluída: ${patch.title || "Gravação"}`, {
            description: "Áudio decodificado e pronto para visualização.",
            action: onSelectRecording
              ? {
                  label: "Ver Transcrição",
                  onClick: () => onSelectRecording(rid),
                }
              : undefined,
          });
        }
      } else if (eventType === "error") {
        queryClient.invalidateQueries({ queryKey: ["recordings"] });
        queryClient.invalidateQueries({ queryKey: ["recording", rid] });
      }
    };

    es.addEventListener("progress", (e) => handleGlobalEvent(e as MessageEvent, "progress"));
    es.addEventListener("done", (e) => handleGlobalEvent(e as MessageEvent, "done"));
    es.addEventListener("document_updated", (e) => handleGlobalEvent(e as MessageEvent, "document_updated"));
    es.addEventListener("notion_updated", (e) => handleGlobalEvent(e as MessageEvent, "notion_updated"));
    es.addEventListener("error", (e) => handleGlobalEvent(e as MessageEvent, "error"));
    es.addEventListener("deleted", (e) => handleGlobalEvent(e as MessageEvent, "deleted"));

    return () => {
      closed = true;
      if (es) es.close();
    };
  }, [queryClient, toast, onSelectRecording]);
}