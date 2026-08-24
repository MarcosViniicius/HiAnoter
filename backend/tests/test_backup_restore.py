"""Testes unitários e de integração para o sistema de Backup e Restauração."""

import asyncio
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# Configura diretório temporário para testes
TEST_DIR = Path(tempfile.mkdtemp(prefix="hinoter_test_backup_"))
os.environ["DATA_DIR"] = str(TEST_DIR)

from fastapi.testclient import TestClient

from backend.app.config import get_settings
from backend.app.database import async_session, init_db
from backend.app.main import app
from backend.app.models import Recording, RecordingDocument, SummaryVersion, TranscriptionVersion
from backend.app.services.backup_service import (
    FULL_BACKUP_FORMAT_ID,
    FULL_BACKUP_FORMAT_VERSION,
    SETTINGS_FORMAT_ID,
    SETTINGS_FORMAT_VERSION,
    _is_safe_zip_path,
    create_full_backup_zip,
    export_settings,
    import_settings,
    restore_full_backup_zip,
    validate_full_backup_zip,
    validate_settings_payload,
)


def test_settings_export_and_validate():
    """Testa exportação e validação de configurações."""
    exported = export_settings(include_secrets=False)
    assert exported["format"] == SETTINGS_FORMAT_ID
    assert exported["version"] == SETTINGS_FORMAT_VERSION
    assert "settings" in exported
    assert "ai" in exported["settings"]
    assert "transcription" in exported["settings"]
    assert "appearance" in exported["settings"]

    report = validate_settings_payload(exported)
    assert report["valid"] is True
    assert report["totalSettings"] > 0
    assert "flatPatch" in report


def test_settings_import_flow():
    """Testa importação de configurações e atualização de valores."""
    payload = {
        "format": SETTINGS_FORMAT_ID,
        "version": 1,
        "exportedAt": "2026-08-24T00:00:00Z",
        "settings": {
            "appearance": {
                "theme": "dark"
            },
            "transcription": {
                "whisper_mode": "fast",
                "whisper_model": "medium"
            },
            "system": {
                "max_upload_mb": 450
            }
        }
    }

    result = import_settings(payload)
    assert result["ok"] is True
    assert result["updatedCount"] >= 3

    s = get_settings()
    assert s.theme == "dark"
    assert s.whisper_model == "medium"
    assert s.max_upload_mb == 450


def test_zip_path_traversal_protection():
    """Garante que Zip Slip / Path Traversal seja 100% bloqueado."""
    base_dir = Path(tempfile.mkdtemp(prefix="safe_base_"))

    assert _is_safe_zip_path(base_dir, "files/audio/aula.wav") is True
    assert _is_safe_zip_path(base_dir, "files/documents/notes.pdf") is True

    # Ataques com caminhos relativos maliciosos
    assert _is_safe_zip_path(base_dir, "../../../etc/passwd") is False
    assert _is_safe_zip_path(base_dir, "files/../../secret.txt") is False
    assert _is_safe_zip_path(base_dir, "/etc/shadow") is False
    assert _is_safe_zip_path(base_dir, "C:\\Windows\\System32\\calc.exe") is False

    shutil.rmtree(base_dir, ignore_errors=True)


async def test_full_backup_export_and_restore():
    """Testa exportação completa de dados (ZIP) e restauração íntegra."""
    s = get_settings()
    s.audio_path.mkdir(parents=True, exist_ok=True)
    s.documents_path.mkdir(parents=True, exist_ok=True)

    # 1. Cria mock de gravação com arquivos
    async with async_session() as db:
        rec_id = "test-rec-backup-123"
        audio_file = s.audio_path / f"{rec_id}.wav"
        audio_file.write_bytes(b"MOCK_AUDIO_DATA_FOR_BACKUP_TEST")

        doc_id = "test-doc-backup-456"
        doc_file = s.documents_path / f"{doc_id}_aula.pdf"
        doc_file.write_bytes(b"MOCK_PDF_DATA_FOR_BACKUP_TEST")

        rec = Recording(
            id=rec_id,
            title="Aula de Álgebra Linear",
            original_filename="algebra.mp3",
            file_path=str(audio_file),
            duration_seconds=120.5,
            status="COMPLETED",
            raw_transcript="Introdução aos espaços vetoriais e transformações lineares.",
            summary_markdown="## 1. Espaços Vetoriais\nDefinições e propriedades fundamentais.",
            summary_style="STRUCTURED_IMRAD",
            mindmap_json=json.dumps({"name": "Álgebra Linear", "subbranches": [{"name": "Espaços Vetoriais", "subbranches": []}]}),
        )
        db.add(rec)

        trans = TranscriptionVersion(
            id="trans-v1-123",
            recording_id=rec_id,
            version_number=1,
            engine="faster-whisper",
            model_name="large-v3",
            duration_seconds=120.5,
            raw_transcript="Introdução aos espaços vetoriais e transformações lineares.",
        )
        db.add(trans)

        doc = RecordingDocument(
            id=doc_id,
            recording_id=rec_id,
            doc_type="pdf",
            filename="algebra.pdf",
            file_path=str(doc_file),
            content_text="Notas de aula de Álgebra Linear.",
        )
        db.add(doc)

        await db.commit()

    # 2. Gera o ZIP de backup completo
    async with async_session() as db:
        zip_path, filename = await create_full_backup_zip(db)
        assert zip_path.is_file()
        assert filename.endswith(".zip")

    # 3. Valida o ZIP gerado
    async with async_session() as db:
        val_report = await validate_full_backup_zip(zip_path, db)
        assert val_report["valid"] is True
        assert val_report["format"] == FULL_BACKUP_FORMAT_ID
        assert val_report["version"] == FULL_BACKUP_FORMAT_VERSION
        assert val_report["totalRecordings"] >= 1
        assert val_report["existingConflictsCount"] >= 1

    # 4. Restaura em modo limpo ("clean") para testar reconstrução total
    async with async_session() as db:
        restore_result = await restore_full_backup_zip(
            zip_path=zip_path,
            db=db,
            conflict_strategy="clean",
            restore_settings=True,
        )
        assert restore_result["ok"] is True
        assert restore_result["recordingsRestored"] >= 1

    # 5. Verifica se os registros e arquivos foram reconstituídos perfeitamente
    async with async_session() as db:
        restored_rec = await db.get(Recording, rec_id)
        assert restored_rec is not None
        assert restored_rec.title == "Aula de Álgebra Linear"
        assert restored_rec.summary_markdown is not None
        assert "Espaços Vetoriais" in restored_rec.summary_markdown

        restored_doc = await db.get(RecordingDocument, doc_id)
        assert restored_doc is not None
        assert restored_doc.filename == "algebra.pdf"

        # Verifica se o arquivo de áudio existe no disco
        assert Path(restored_rec.file_path).is_file()


def test_api_endpoints():
    """Testa endpoints HTTP da API de backup via TestClient."""
    with TestClient(app) as client:
        # GET /api/backup/settings/export
        res_exp = client.get("/api/backup/settings/export")
        assert res_exp.status_code == 200
        data = res_exp.json()
        assert data["format"] == SETTINGS_FORMAT_ID

        # POST /api/backup/settings/validate
        res_val = client.post("/api/backup/settings/validate", json={"data": data})
        assert res_val.status_code == 200
        val_data = res_val.json()
        assert val_data["valid"] is True

        # GET /api/backup/full/export
        res_zip = client.get("/api/backup/full/export")
        assert res_zip.status_code == 200
        assert res_zip.headers["content-type"] == "application/zip"
        zip_bytes = res_zip.content

        # POST /api/backup/full/validate
        files = {"file": ("backup.zip", io.BytesIO(zip_bytes), "application/zip")}
        res_zip_val = client.post("/api/backup/full/validate", files=files)
        assert res_zip_val.status_code == 200
        assert res_zip_val.json()["valid"] is True


if __name__ == "__main__":
    print("Iniciando bateria de testes do sistema de Backup e Restauração...")
    asyncio.run(init_db())
    test_settings_export_and_validate()
    print("  [PASS] test_settings_export_and_validate")
    test_settings_import_flow()
    print("  [PASS] test_settings_import_flow")
    test_zip_path_traversal_protection()
    print("  [PASS] test_zip_path_traversal_protection")
    asyncio.run(test_full_backup_export_and_restore())
    print("  [PASS] test_full_backup_export_and_restore")
    test_api_endpoints()
    print("  [PASS] test_api_endpoints")
    print("Todos os testes de Backup e Restauração passaram com sucesso!")
    shutil.rmtree(TEST_DIR, ignore_errors=True)
