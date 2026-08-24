import datetime as dt

from pydantic import BaseModel, ConfigDict, Field


class RecordingDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recording_id: str
    doc_type: str
    filename: str
    content_text: str | None = None
    token_count: int | None = 0
    pages_count: int | None = 1
    structure_json: dict | None = None
    diagnostics: dict | None = None
    created_at: dt.datetime


class DocumentCreate(BaseModel):
    doc_type: str = "text"  # pdf, image, text, url, youtube
    filename: str
    content_text: str


class MaterialItemInput(BaseModel):
    doc_type: str = "text"  # "url", "youtube", "text", "pdf", "image"
    title: str = ""
    content: str = ""
    url: str | None = None


class CreateMaterialsSessionRequest(BaseModel):
    title: str | None = None
    summary_style: str = "ABSTRACT"
    materials: list[MaterialItemInput] = []
    auto_generate: bool = True


class SummarizeRequest(BaseModel):
    style: str = "ABSTRACT"
    transcription_version_id: str | None = None
    additional_instructions: str | None = None
    selected_document_ids: list[str] | None = None


class TranscribeRequest(BaseModel):
    provider: str | None = None  # "local" | "openrouter"
    whisper_model: str | None = None
    language: str | None = None


class SelectVersionRequest(BaseModel):
    transcription_id: str | None = None
    summary_id: str | None = None


class TranscriptionVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recording_id: str
    version_number: int
    engine: str
    model_name: str
    duration_seconds: float
    raw_transcript: str | None = None
    transcript_segments: list | None = None
    status: str
    error_message: str | None = None
    created_at: dt.datetime


class SummaryVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recording_id: str
    transcription_version_id: str | None = None
    version_number: int
    style: str
    model_name: str
    summary_markdown: str | None = None
    mindmap_json: str | None = None
    action_items: list | None = None
    llm_cost_usd: float | None = None
    context_docs_count: int = 0
    status: str
    error_message: str | None = None
    created_at: dt.datetime


class HistoryResponse(BaseModel):
    transcriptions: list[TranscriptionVersionOut] = []
    summaries: list[SummaryVersionOut] = []
    active_transcription_id: str | None = None
    active_summary_id: str | None = None


class ProcessRequest(BaseModel):
    summary_style: str = "ABSTRACT"
    transcription_provider: str | None = None
    whisper_model: str | None = None


class RecordingBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    original_filename: str
    duration_seconds: float
    status: str
    progress_pct: int
    retry_count: int
    created_at: dt.datetime
    summary_style: str = "ABSTRACT"
    execution_mode: str = "IMMEDIATE"
    transcription_provider: str | None = "local"
    whisper_model: str | None = None
    icon: str | None = None


class RecordingListItem(RecordingBase):
    summary_preview: str | None = None
    documents_count: int = 0


class RecordingDetail(RecordingBase):
    original_file_path: str | None
    file_path: str | None
    error_message: str | None
    raw_transcript: str | None
    transcript_segments: list | None
    summary_markdown: str | None
    mindmap_json: str | None = None
    action_items: list | None
    llm_cost_usd: float | None
    summary_error_message: str | None
    notion_page_id: str | None
    notion_page_url: str | None
    notion_export_status: str
    notion_error_message: str | None
    active_transcription_id: str | None = None
    active_summary_id: str | None = None
    documents: list[RecordingDocumentOut] = []
    transcription_versions: list[TranscriptionVersionOut] = []
    summary_versions: list[SummaryVersionOut] = []


class UploadResponse(BaseModel):
    id: str
    status: str = "QUEUED"
    title: str
    summary_style: str = "ABSTRACT"
    execution_mode: str = "IMMEDIATE"
    transcription_provider: str | None = "local"


class DeviceInfoOut(BaseModel):
    engine: str = "faster-whisper"
    device: str = "cpu"
    compute_type: str = "int8"
    gpu_name: str | None = None
    gpu_vram_mib: int | None = None
    backend: str = "cpu"
    gpus: list[dict] | None = None
    notes: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    device: DeviceInfoOut
    whisper_model: str
    max_upload_mb: int
    ffmpeg_available: bool
    huggingface_cache_dir: str | None = None


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str
    llm_cost_usd: float | None = None
    total_tokens: int | None = None


class MessageResponse(BaseModel):
    message: str

    @classmethod
    def ok(cls, msg: str) -> "MessageResponse":
        return cls(message=msg)


class ErrorResponse(BaseModel):
    detail: str