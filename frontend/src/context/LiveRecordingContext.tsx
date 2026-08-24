import React, { createContext, useContext, useEffect, useState } from "react";
import {
  liveRecordingService,
  type LiveRecordingStatus,
} from "@/services/liveRecordingService";
import type { SummaryStyle } from "@/types";

export interface LiveNote {
  id: string;
  timestamp: number;
  text: string;
}

export interface LiveAttachedDocument {
  id: string;
  file: File;
  name: string;
  type: string;
}

interface LiveRecordingContextValue {
  status: LiveRecordingStatus;
  durationSeconds: number;
  volumeLevel: number;
  attachedDocuments: LiveAttachedDocument[];
  sessionNotes: LiveNote[];
  selectedStyle: SummaryStyle;
  isStudioOpen: boolean;
  errorMessage: string | null;

  startRecording: (deviceId?: string) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopAndFinalize: () => Promise<{
    audioFile: File;
    documents: File[];
    notes: LiveNote[];
    summaryStyle: SummaryStyle;
  } | null>;
  cancelRecording: () => void;

  addLiveNote: (text: string) => void;
  removeLiveNote: (id: string) => void;
  attachLiveDocument: (file: File) => void;
  removeLiveDocument: (id: string) => void;
  setSelectedStyle: (style: SummaryStyle) => void;
  openStudio: () => void;
  closeStudio: () => void;
  clearError: () => void;
}

const LiveRecordingContext = createContext<LiveRecordingContextValue | null>(null);

export function LiveRecordingProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LiveRecordingStatus>(liveRecordingService.getStatus());
  const [durationSeconds, setDurationSeconds] = useState(liveRecordingService.getDuration());
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [attachedDocuments, setAttachedDocuments] = useState<LiveAttachedDocument[]>([]);
  const [sessionNotes, setSessionNotes] = useState<LiveNote[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<SummaryStyle>("ABSTRACT");
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubStatus = liveRecordingService.on("statusChange", (s) => {
      setStatus(s);
      if (s === "recording") {
        setErrorMessage(null);
      }
    });

    const unsubDuration = liveRecordingService.on("durationChange", (d) => {
      setDurationSeconds(d);
    });

    const unsubVolume = liveRecordingService.on("volumeChange", (v) => {
      setVolumeLevel(v);
    });

    const unsubError = liveRecordingService.on("error", (err) => {
      setErrorMessage(err);
    });

    return () => {
      unsubStatus();
      unsubDuration();
      unsubVolume();
      unsubError();
    };
  }, []);

  const startRecording = async (deviceId?: string) => {
    try {
      setAttachedDocuments([]);
      setSessionNotes([]);
      setErrorMessage(null);
      setIsStudioOpen(true);
      await liveRecordingService.start(deviceId);
    } catch (err: any) {
      setErrorMessage(err.message || "Erro ao iniciar gravação.");
      throw err;
    }
  };

  const pauseRecording = () => {
    liveRecordingService.pause();
  };

  const resumeRecording = () => {
    liveRecordingService.resume();
  };

  const stopAndFinalize = async () => {
    const audioFile = await liveRecordingService.stop();
    if (!audioFile) return null;

    const result = {
      audioFile,
      documents: attachedDocuments.map((d) => d.file),
      notes: [...sessionNotes],
      summaryStyle: selectedStyle,
    };

    setAttachedDocuments([]);
    setSessionNotes([]);
    setIsStudioOpen(false);

    return result;
  };

  const openStudio = () => {
    // Just open the studio modal — it always starts in idle state.
    // If there's a stale "starting" status from a previous attempt, sync it.
    const current = liveRecordingService.getStatus();
    if (current === "idle" && status !== "idle") {
      setStatus("idle");
    }
    setErrorMessage(null);
    setIsStudioOpen(true);
  };

  const closeStudio = () => {
    // Only cancel if we're in a non-active state (idle/starting)
    // If recording or paused, just minimize (close the modal, keep recording)
    const current = liveRecordingService.getStatus();
    if (current === "starting") {
      liveRecordingService.cancel();
    }
    setIsStudioOpen(false);
  };

  const cancelRecording = () => {
    liveRecordingService.cancel();
    setAttachedDocuments([]);
    setSessionNotes([]);
    setStatus("idle");
    setIsStudioOpen(false);
  };

  const addLiveNote = (text: string) => {
    if (!text.trim()) return;
    const newNote: LiveNote = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: durationSeconds,
      text: text.trim(),
    };
    setSessionNotes((prev) => [...prev, newNote]);
  };

  const removeLiveNote = (id: string) => {
    setSessionNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const attachLiveDocument = (file: File) => {
    const ext = file.name.split(".").pop() || "doc";
    const newDoc: LiveAttachedDocument = {
      id: Math.random().toString(36).substring(2, 9),
      file,
      name: file.name,
      type: ext.toUpperCase(),
    };
    setAttachedDocuments((prev) => [...prev, newDoc]);
  };

  const removeLiveDocument = (id: string) => {
    setAttachedDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const clearError = () => setErrorMessage(null);

  return (
    <LiveRecordingContext.Provider
      value={{
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
        openStudio,
        closeStudio,
        clearError,
      }}
    >
      {children}
    </LiveRecordingContext.Provider>
  );
}

export function useLiveRecording() {
  const ctx = useContext(LiveRecordingContext);
  if (!ctx) {
    throw new Error("useLiveRecording must be used within a LiveRecordingProvider");
  }
  return ctx;
}
