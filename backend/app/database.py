from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings

settings = get_settings()

connect_args = {}
if "sqlite" in settings.resolved_database_url:
    connect_args = {"timeout": 30}

engine = create_async_engine(
    settings.resolved_database_url,
    echo=False,
    connect_args=connect_args,
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    # Import models so they register on the metadata before create_all.
    from . import models  # noqa: F401

    settings.ensure_dirs()  # garante o diretório do SQLite (data_path)
    async with engine.begin() as conn:
        if "sqlite" in settings.resolved_database_url:
            await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
            await conn.exec_driver_sql("PRAGMA busy_timeout=30000")
        await conn.run_sync(Base.metadata.create_all)
        await _migrate(conn)


async def _migrate(conn) -> None:
    """Migrations leves (add columns e backfill em DBs existentes)."""
    # 1. Colunas em recordings
    cols = {
        row[1]
        for row in await conn.exec_driver_sql("PRAGMA table_info(recordings)")
    }
    if "summary_error_message" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN summary_error_message TEXT"
        )
    if "summary_style" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN summary_style VARCHAR(50) DEFAULT 'ABSTRACT'"
        )
    if "execution_mode" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'IMMEDIATE'"
        )
    if "active_transcription_id" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN active_transcription_id VARCHAR(36)"
        )
    if "active_summary_id" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN active_summary_id VARCHAR(36)"
        )
    if "transcription_provider" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN transcription_provider VARCHAR(50) DEFAULT 'local'"
        )
    if "whisper_model" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN whisper_model VARCHAR(100)"
        )
    if "icon" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN icon VARCHAR(20)"
        )
    if "mindmap_json" not in cols:
        await conn.exec_driver_sql(
            "ALTER TABLE recordings ADD COLUMN mindmap_json TEXT"
        )

    cols_sv = {
        row[1]
        for row in await conn.exec_driver_sql("PRAGMA table_info(summary_versions)")
    }
    if "mindmap_json" not in cols_sv:
        await conn.exec_driver_sql(
            "ALTER TABLE summary_versions ADD COLUMN mindmap_json TEXT"
        )

    cols_rd = {
        row[1]
        for row in await conn.exec_driver_sql("PRAGMA table_info(recording_documents)")
    }
    if "manifest_path" not in cols_rd:
        await conn.exec_driver_sql(
            "ALTER TABLE recording_documents ADD COLUMN manifest_path VARCHAR(500)"
        )
    if "pages_count" not in cols_rd:
        await conn.exec_driver_sql(
            "ALTER TABLE recording_documents ADD COLUMN pages_count INTEGER DEFAULT 1"
        )
    if "structure_json" not in cols_rd:
        await conn.exec_driver_sql(
            "ALTER TABLE recording_documents ADD COLUMN structure_json JSON"
        )
    if "diagnostics" not in cols_rd:
        await conn.exec_driver_sql(
            "ALTER TABLE recording_documents ADD COLUMN diagnostics JSON"
        )

    # 2. Backfill retroativo para gravações que já possuem transcrição/resumo salvos
    try:
        # Backfill transcription_versions
        res_t = await conn.exec_driver_sql(
            """
            SELECT r.id, r.raw_transcript, r.transcript_segments, r.duration_seconds, r.created_at
            FROM recordings r
            WHERE r.raw_transcript IS NOT NULL AND r.raw_transcript != ''
              AND NOT EXISTS (
                  SELECT 1 FROM transcription_versions tv WHERE tv.recording_id = r.id
              )
            """
        )
        records_t = res_t.fetchall()
        for r_id, raw_t, t_segs, dur, c_at in records_t:
            import uuid
            v_id = str(uuid.uuid4())
            await conn.exec_driver_sql(
                """
                INSERT INTO transcription_versions (id, recording_id, version_number, engine, model_name, duration_seconds, raw_transcript, transcript_segments, status, created_at)
                VALUES (?, ?, 1, 'faster-whisper', 'small', ?, ?, ?, 'COMPLETED', ?)
                """,
                (v_id, r_id, dur or 0.0, raw_t, t_segs, c_at),
            )
            await conn.exec_driver_sql(
                "UPDATE recordings SET active_transcription_id = ? WHERE id = ?",
                (v_id, r_id),
            )

        # Backfill summary_versions
        res_s = await conn.exec_driver_sql(
            """
            SELECT r.id, r.active_transcription_id, r.summary_style, r.summary_markdown, r.action_items, r.llm_cost_usd, r.created_at
            FROM recordings r
            WHERE r.summary_markdown IS NOT NULL AND r.summary_markdown != ''
              AND NOT EXISTS (
                  SELECT 1 FROM summary_versions sv WHERE sv.recording_id = r.id
              )
            """
        )
        records_s = res_s.fetchall()
        for r_id, act_t_id, style, s_md, a_items, cost, c_at in records_s:
            import uuid
            s_id = str(uuid.uuid4())
            await conn.exec_driver_sql(
                """
                INSERT INTO summary_versions (id, recording_id, transcription_version_id, version_number, style, model_name, summary_markdown, action_items, llm_cost_usd, status, created_at)
                VALUES (?, ?, ?, 1, ?, 'openrouter', ?, ?, ?, 'COMPLETED', ?)
                """,
                (s_id, r_id, act_t_id, style or 'ABSTRACT', s_md, a_items, cost or 0.0, c_at),
            )
            await conn.exec_driver_sql(
                "UPDATE recordings SET active_summary_id = ? WHERE id = ?",
                (s_id, r_id),
            )
    except Exception:
        pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session