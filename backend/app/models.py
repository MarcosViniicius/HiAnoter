import datetime as dt
import enum
import uuid

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class RecordingStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    QUEUED = "QUEUED"
    TRANSCRIBING = "TRANSCRIBING"
    SUMMARIZING = "SUMMARIZING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class NotionExportStatus(str, enum.Enum):
    NOT_EXPORTED = "NOT_EXPORTED"
    EXPORTING = "EXPORTING"
    EXPORTED = "EXPORTED"
    FAILED = "FAILED"


class SummaryStyle(str, enum.Enum):
    ABSTRACT = "ABSTRACT"
    PLAIN_LANGUAGE = "PLAIN_LANGUAGE"
    STRUCTURED_IMRAD = "STRUCTURED_IMRAD"
    CRITICAL_APPRAISAL = "CRITICAL_APPRAISAL"
    ANNOTATED = "ANNOTATED"


def new_id() -> str:
    return str(uuid.uuid4())


def default_title() -> str:
    return f"Gravação - {dt.datetime.now().strftime('%d/%m/%Y %H:%M')}"


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(200), default=default_title)
    original_file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_filename: Mapped[str] = mapped_column(String(500), default="")
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)

    status: Mapped[str] = mapped_column(
        Enum(RecordingStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=RecordingStatus.QUEUED.value,
        index=True,
    )
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)

    raw_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript_segments: Mapped[list | None] = mapped_column(JSON, nullable=True)

    summary_style: Mapped[str] = mapped_column(
        String(50),
        default=SummaryStyle.ABSTRACT.value,
    )
    execution_mode: Mapped[str] = mapped_column(
        String(20),
        default="IMMEDIATE",
    )
    summary_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_items: Mapped[list | None] = mapped_column(JSON, nullable=True)
    llm_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    summary_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    notion_page_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notion_page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    notion_export_status: Mapped[str] = mapped_column(
        Enum(NotionExportStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=NotionExportStatus.NOT_EXPORTED.value,
        index=True,
    )
    notion_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=lambda: dt.datetime.now(dt.timezone.utc), index=True
    )

    icon: Mapped[str | None] = mapped_column(String(20), nullable=True)
    mindmap_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    active_transcription_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    active_summary_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    transcription_provider: Mapped[str | None] = mapped_column(String(50), default="local", nullable=True)
    whisper_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    documents: Mapped[list["RecordingDocument"]] = relationship(
        "RecordingDocument",
        back_populates="recording",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    transcription_versions: Mapped[list["TranscriptionVersion"]] = relationship(
        "TranscriptionVersion",
        back_populates="recording",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TranscriptionVersion.version_number.desc()",
    )
    summary_versions: Mapped[list["SummaryVersion"]] = relationship(
        "SummaryVersion",
        back_populates="recording",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="SummaryVersion.version_number.desc()",
    )


class TranscriptionVersion(Base):
    __tablename__ = "transcription_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recording_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("recordings.id", ondelete="CASCADE"),
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, default=1)
    engine: Mapped[str] = mapped_column(String(50), default="faster-whisper")
    model_name: Mapped[str] = mapped_column(String(50), default="small")
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    raw_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    transcript_segments: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="COMPLETED")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=lambda: dt.datetime.now(dt.timezone.utc), index=True
    )

    recording: Mapped[Recording] = relationship("Recording", back_populates="transcription_versions")
    summaries: Mapped[list["SummaryVersion"]] = relationship(
        "SummaryVersion",
        back_populates="transcription_source",
        lazy="selectin",
    )


class SummaryVersion(Base):
    __tablename__ = "summary_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recording_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("recordings.id", ondelete="CASCADE"),
        index=True,
    )
    transcription_version_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("transcription_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, default=1)
    style: Mapped[str] = mapped_column(String(50), default=SummaryStyle.ABSTRACT.value)
    model_name: Mapped[str] = mapped_column(String(100), default="")
    summary_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    mindmap_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_items: Mapped[list | None] = mapped_column(JSON, nullable=True)
    llm_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    context_docs_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="COMPLETED")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=lambda: dt.datetime.now(dt.timezone.utc), index=True
    )

    recording: Mapped[Recording] = relationship("Recording", back_populates="summary_versions")
    transcription_source: Mapped[TranscriptionVersion | None] = relationship(
        "TranscriptionVersion",
        back_populates="summaries",
    )


class RecordingDocument(Base):
    __tablename__ = "recording_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recording_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("recordings.id", ondelete="CASCADE"),
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String(30), default="text")  # pdf, image, text, url
    filename: Mapped[str] = mapped_column(String(500), default="")
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    manifest_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=0)
    pages_count: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1)
    structure_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    diagnostics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=lambda: dt.datetime.now(dt.timezone.utc)
    )

    recording: Mapped[Recording] = relationship("Recording", back_populates="documents")


class AppSecret(Base):
    __tablename__ = "app_secrets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # ex: 'openrouter_api_key', 'openai_api_key'
    provider: Mapped[str] = mapped_column(String(50), index=True)
    encrypted_value: Mapped[str] = mapped_column(Text)
    sha256_hash: Mapped[str] = mapped_column(String(64))
    masked_preview: Mapped[str] = mapped_column(String(50))
    is_configured: Mapped[bool] = mapped_column(Integer, default=1)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, default=lambda: dt.datetime.now(dt.timezone.utc)
    )