export type RecordingStatus =
  | "DRAFT"
  | "QUEUED"
  | "TRANSCRIBING"
  | "SUMMARIZING"
  | "COMPLETED"
  | "FAILED";

export type SummaryStyle =
  | "ABSTRACT"
  | "PLAIN_LANGUAGE"
  | "STRUCTURED_IMRAD"
  | "CRITICAL_APPRAISAL"
  | "ANNOTATED";

export interface SummarizePayload {
  style: SummaryStyle | string;
  transcription_version_id?: string;
  additional_instructions?: string;
  selected_document_ids?: string[];
}

export type NotionExportStatus =
  | "NOT_EXPORTED"
  | "EXPORTING"
  | "EXPORTED"
  | "FAILED";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResponse {
  reply: string;
  llm_cost_usd?: number | null;
  total_tokens?: number | null;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface ExtractionDiagnostics {
  total_pages: number;
  processed_pages: number;
  scanned_pages: number;
  ocr_applied_pages: number;
  headings_count: number;
  paragraphs_count: number;
  formulas_count: number;
  tables_count: number;
  figures_count: number;
  images_count: number;
  total_elements: number;
  confidence_score: number;
  warnings: string[];
}

export interface DocumentManifest {
  version: string;
  document_id: string;
  recording_id: string;
  filename: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
  original_rel_path: string;
  pages: any[];
  semantic_chunks: any[];
  full_markdown: string;
  diagnostics: ExtractionDiagnostics;
}

export interface RecordingDocument {
  id: string;
  recording_id: string;
  doc_type: "pdf" | "image" | "text" | "url" | string;
  filename: string;
  content_text?: string | null;
  token_count?: number | null;
  pages_count?: number | null;
  structure_json?: DocumentManifest | null;
  diagnostics?: ExtractionDiagnostics | null;
  created_at: string;
}

export interface TranscriptionVersion {
  id: string;
  recording_id: string;
  version_number: number;
  engine: string;
  model_name: string;
  duration_seconds: number;
  raw_transcript?: string | null;
  transcript_segments?: TranscriptSegment[] | null;
  status: string;
  error_message?: string | null;
  created_at: string;
}

export interface MindmapNode {
  name: string;
  icon?: string;
  color?: string;
  order?: number;
  annotation?: string;
  subbranches?: MindmapNode[];
}

export interface SummaryVersion {
  id: string;
  recording_id: string;
  transcription_version_id?: string | null;
  version_number: number;
  style: SummaryStyle | string;
  model_name: string;
  summary_markdown?: string | null;
  mindmap_json?: string | null;
  action_items?: string[] | null;
  llm_cost_usd?: number | null;
  context_docs_count?: number;
  status: string;
  error_message?: string | null;
  created_at: string;
}

export interface HistoryResponse {
  transcriptions: TranscriptionVersion[];
  summaries: SummaryVersion[];
  active_transcription_id?: string | null;
  active_summary_id?: string | null;
}

export interface Recording {
  id: string;
  title: string;
  original_filename: string;
  duration_seconds: number;
  status: RecordingStatus;
  progress_pct: number;
  retry_count: number;
  created_at: string;
  summary_style?: SummaryStyle | string;
  execution_mode?: "IMMEDIATE" | "DEFERRED" | string;
  summary_preview?: string | null;
  documents_count?: number;
  documents?: RecordingDocument[];

  original_file_path?: string | null;
  file_path?: string | null;
  error_message?: string | null;
  raw_transcript?: string | null;
  transcript_segments?: TranscriptSegment[] | null;
  summary_markdown?: string | null;
  mindmap_json?: string | null;
  icon?: string | null;
  action_items?: string[] | null;
  llm_cost_usd?: number | null;
  summary_error_message?: string | null;
  notion_page_id?: string | null;
  notion_page_url?: string | null;
  notion_export_status?: NotionExportStatus | null;
  notion_error_message?: string | null;

  active_transcription_id?: string | null;
  active_summary_id?: string | null;
  transcription_versions?: TranscriptionVersion[];
  summary_versions?: SummaryVersion[];
  transcription_provider?: "local" | "openrouter" | string | null;
  whisper_model?: string | null;
}

export interface DeviceInfo {
  engine: "faster-whisper" | "whisper-cpp" | string;
  device: "cuda" | "vulkan" | "metal" | "cpu" | string;
  compute_type: string;
  gpu_name?: string | null;
  gpu_vram_mib?: number | null;
  backend?: string | null;
  gpus?: Array<{ vendor: string; name: string; vram_mib?: number | null; backends: string[] }> | null;
  notes?: string | null;
}

export interface Health {
  status: string;
  version: string;
  device: DeviceInfo;
  whisper_model: string;
  max_upload_mb: number;
  ffmpeg_available: boolean;
  huggingface_cache_dir?: string | null;
}

export interface TranscribeRequest {
  provider?: "local" | "openrouter";
  whisper_model?: string;
  language?: string;
}

export interface MaterialItemInput {
  doc_type: "url" | "youtube" | "text" | "pdf" | "image" | string;
  title?: string;
  content?: string;
  url?: string;
}

export interface CreateMaterialsSessionRequest {
  title?: string;
  summary_style?: SummaryStyle | string;
  materials: MaterialItemInput[];
  auto_generate?: boolean;
}

export interface UploadResponse {
  id: string;
  status: RecordingStatus;
  title: string;
  summary_style?: SummaryStyle | string;
  execution_mode?: string;
}

export interface SettingItem {
  key: string;
  group: string;
  label: string;
  type: "str" | "int" | "float" | "bool" | "enum" | "secret";
  options: string[] | null;
  secret: boolean;
  requires_restart: boolean;
  help: string;
  value: string | number | boolean | null;
  set: boolean;
  sha256?: string | null;
  masked?: string | null;
}

export interface SettingsResponse {
  settings: SettingItem[];
  file: string;
  configured_providers?: Record<string, boolean>;
  keys_status?: Record<string, { configured: boolean; sha256?: string | null; masked?: string | null }>;
}

export interface SettingsUpdateResponse {
  ok: boolean;
  updated: string[];
  requires_restart: string[];
  notice: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  context: number | null;
  pricing: Record<string, string>;
}

export interface ModelsResponse {
  models: ModelInfo[];
  source: "live" | "cache" | "none";
  error: string | null;
  cached_at: number | null;
}