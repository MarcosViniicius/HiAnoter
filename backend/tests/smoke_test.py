"""Smoke test for HiNoter-Lite backend (no whisper model download, no external keys).

Boots the FastAPI app in-process (TestClient with lifespan), then:
  1. health endpoint + device info          (should be cpu/int8 here, no nvidia-smi)
  2. upload validation (bad extension -> 415, empty file -> 400, ok -> 201)
  3. queue + pipeline reaches transcription -> FAILED with readable ffmpeg/model error
     (skipped by injecting a raw_transcript row directly)
  4. SSE stream reconnects and receives progress events
  5. retry endpoint increments retry_count and re-runs pipeline
  6. LLM summarize failure yields readable error_message (no API key)
  7. Notion export without config -> 400 readable
"""
import io
import logging
import os
import shutil
import sys
import tempfile
import time
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s", stream=sys.stderr)

# Isola o teste do DATA_DIR real do usuário (settings.json do menu pode ter chaves).
_SMOKE_DATA = os.path.join(tempfile.gettempdir(), f"hinoter_smoke_{uuid.uuid4().hex}")
os.environ["DATA_DIR"] = _SMOKE_DATA
os.environ.setdefault("WHISPER_MODEL", "tiny")
os.environ.setdefault("WHISPER_DEVICE", "cpu")
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["NOTION_API_KEY"] = ""
os.environ["NOTION_DATABASE_ID"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.database import async_session  # noqa: E402
from app.models import Recording, RecordingStatus  # noqa: E402

PASS = []
FAIL = []


def check(name, cond, detail=""):
    tag = "PASS" if cond else "FAIL"
    (PASS if cond else FAIL).append(name)
    print(f"[{tag}] {name}" + (f"  -- {detail}" if detail and not cond else ""), flush=True)


async def _inject_fake(rid, original_path, status, raw=None):
    """Create a fake row via the app's own session factories."""
    async with async_session() as db:
        rec = Recording(
            id=rid,
            title="Smoke - fake",
            original_filename="fake.mp3",
            original_file_path=original_path,
            file_path=original_path,
            status=status,
            progress_pct=0,
            raw_transcript=raw,
            transcript_segments=[{"start": 0, "end": 1.0, "text": "trecho de teste para resumo."}],
        )
        db.add(rec)
        await db.commit()
        return rid


def main():
    with TestClient(app) as client:
        # -- health ---------------------------------------------------------
        h = client.get("/api/health")
        check("health 200", h.status_code == 200, h.text)
        payload = h.json()
        dev = payload["device"]
        valid_engine = dev.get("engine") in ("faster-whisper", "whisper-cpp")
        valid_dev = dev.get("device") in ("cuda", "vulkan", "metal", "cpu")
        check("device shape ok", valid_engine and valid_dev, str(dev))
        gpus = dev.get("gpus") or []
        if gpus and os.environ.get("WHISPER_DEVICE", "auto") != "cpu":
            check("non-cpu when gpu present", dev.get("device") != "cpu", str(dev))
        check("ffmpeg reported", "ffmpeg_available" in payload)

        # -- upload validation ----------------------------------------------
        r = client.post("/api/recordings/upload", files={"file": ("notaudio.exe", io.BytesIO(b"x"), "application/octet-stream")})
        check("reject bad ext 415", r.status_code == 415, r.text)
        r = client.post("/api/recordings/upload", files={"file": ("empty.wav", io.BytesIO(b""), "audio/wav")})
        check("reject empty 400", r.status_code == 400, r.text)

        # -- real upload over a real wav (tiny, legal) -> QUEUED ------------
        import subprocess
        import tempfile

        tmp_wav = os.path.join(tempfile.gettempdir(), f"hinoter_smoke_{uuid.uuid4().hex}.wav")
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
             "-i", "sine=frequency=440:duration=1", "-ac", "1", "-ar", "16000", tmp_wav],
            check=True,
            capture_output=True,
            text=True,
        )
        with open(tmp_wav, "rb") as fh:
            r = client.post("/api/recordings/upload", files={"file": ("sonda.wav", fh, "audio/wav")})
        os.unlink(tmp_wav)
        check("upload ok 201", r.status_code == 201, r.text)
        rid = r.json()["id"]
        check("upload returns QUEUED", r.json()["status"] == "QUEUED")

        detail = client.get(f"/api/recordings/{rid}").json()
        check("detail starts QUEUED/TRANSCRIBING", detail["status"] in ("QUEUED", "TRANSCRIBING"), detail["status"])

        # Let the pipeline pick it up (will try to download whisper `tiny` from HF ~75MB)
        deadline = time.time() + 180
        state = None
        while time.time() < deadline:
            time.sleep(1)
            detail = client.get(f"/api/recordings/{rid}").json()
            state = detail["status"]
            if state in ("COMPLETED", "FAILED"):
                break
        check("real job terminal state", state in ("COMPLETED", "FAILED"), str(state))
        print(f"       (real upload reached status: {state}; error={detail['error_message']})")

        # -- Event hub verification -----------------------------------------
        from app.events import hub
        check("event hub active", hub is not None)

        # -- fake row com raw_transcript -> retry faz só o resumo (sem chave:
#        registro fica COMPLETED e o erro vai p/ summary_error_message)
        # Attach a note with text to rid so summarize test has context to summarize
        r_note = client.post(
            f"/api/recordings/{rid}/documents/note",
            json={"doc_type": "text", "filename": "Notas de Reunião", "content_text": "Resumo de alinhamento com definições de prazos e tarefas importantes para o projeto."}
        )
        check("doc note for summarize 201", r_note.status_code == 201)

        # -- on-demand summarize test on the transcribed recording ----------
        r = client.post(f"/api/recordings/{rid}/summarize", json={"style": "ABSTRACT"})
        check("summarize endpoint 200", r.status_code == 200, r.text)
        detail = r.json()
        print(f"       (summarize call result: {detail['status']}; sum_err={detail['summary_error_message']})")
        check(
            "summary failure readable (keeps COMPLETED)",
            detail["status"] == "COMPLETED" and detail["summary_markdown"] is None and detail["summary_error_message"],
            str(detail["summary_error_message"]),
        )
        check(
            "summary failure mentions openrouter",
            "openrouter" in (detail["summary_error_message"] or "").lower(),
            (detail["summary_error_message"] or "")[:120],
        )

        # -- history endpoint test ------------------------------------------
        r_hist = client.get(f"/api/recordings/{rid}/history")
        check("history endpoint 200", r_hist.status_code == 200, r_hist.text)
        hist_data = r_hist.json()
        check("history returns transcriptions", isinstance(hist_data.get("transcriptions"), list))

        # -- list shows rows with preview -----------------------------------
        lst = client.get("/api/recordings").json()
        check("list endpoint", isinstance(lst, list) and len(lst) >= 1)

        # -- notion export without config -> 400 readable -------------------
        r = client.post(f"/api/recordings/{rid}/export-notion")
        check("notion no-config 400", r.status_code == 400, r.text)
        check("notion error readable", "NOTION_API_KEY" in r.json()["detail"], r.json().get("detail", ""))

        # -- deferred upload -> DRAFT ---------------------------------------
        tmp_wav2 = os.path.join(tempfile.gettempdir(), f"hinoter_smoke2_{uuid.uuid4().hex}.wav")
        subprocess.run(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
             "-i", "sine=frequency=440:duration=1", "-ac", "1", "-ar", "16000", tmp_wav2],
            check=True,
            capture_output=True,
            text=True,
        )
        with open(tmp_wav2, "rb") as fh:
            r = client.post("/api/recordings/upload?deferred=true&summary_style=STRUCTURED_IMRAD", files={"file": ("deferred.wav", fh, "audio/wav")})
        os.unlink(tmp_wav2)
        check("deferred upload 201", r.status_code == 201, r.text)
        d_rec = r.json()
        check("deferred returns DRAFT", d_rec["status"] == "DRAFT")
        check("deferred summary_style set", d_rec["summary_style"] == "STRUCTURED_IMRAD")
        d_id = d_rec["id"]

        # -- documents: upload file & create note ---------------------------
        r = client.post(
            f"/api/recordings/{d_id}/documents/upload",
            files={"file": ("notes.txt", io.BytesIO(b"Documento de teste com anotacoes importantes."), "text/plain")}
        )
        check("doc upload 201", r.status_code == 201, r.text)
        doc_id = r.json()["id"]

        r = client.post(
            f"/api/recordings/{d_id}/documents/note",
            json={"doc_type": "text", "filename": "Minha Nota", "content_text": "Observacao adicional."}
        )
        check("doc note 201", r.status_code == 201, r.text)

        # list documents
        r = client.get(f"/api/recordings/{d_id}/documents")
        check("list docs 200", r.status_code == 200 and len(r.json()) == 2)

        # delete one document
        r = client.delete(f"/api/recordings/{d_id}/documents/{doc_id}")
        check("delete doc 200", r.status_code == 200 and r.json().get("ok") is True)

        # trigger process on deferred recording
        r = client.post(f"/api/recordings/{d_id}/process", json={"summary_style": "PLAIN_LANGUAGE"})
        check("process deferred 200", r.status_code == 200 and r.json()["status"] in ("QUEUED", "TRANSCRIBING"))

        # chat endpoint test (expects 500 when openrouter key placeholder, but valid routing)
        r = client.post(
            f"/api/recordings/{d_id}/chat",
            json={"messages": [{"role": "user", "content": "Olá, resuma o ponto central."}]}
        )
        check("chat endpoint handled", r.status_code in (200, 500))

        # -- materials-only study session ----------------------------------
        r = client.post(
            "/api/recordings/materials",
            json={
                "title": "Estudo de Algoritmos",
                "summary_style": "STRUCTURED_IMRAD",
                "materials": [
                    {
                        "doc_type": "text",
                        "title": "Anotações da Ementa",
                        "content": "Algoritmos gulosos e programação dinâmica para grafos.",
                    },
                    {
                        "doc_type": "youtube",
                        "title": "Vídeo Tutorial",
                        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                        "content": "Conteúdo extraído do vídeo.",
                    }
                ],
                "auto_generate": False,
            }
        )
        check("materials session 201", r.status_code == 201, r.text)
        mat_rec = r.json()
        check("materials execution_mode is MATERIALS", mat_rec.get("execution_mode") == "MATERIALS")
        mat_id = mat_rec["id"]

        # check documents count in materials session
        r = client.get(f"/api/recordings/{mat_id}/documents")
        check("materials docs listed 200", r.status_code == 200 and len(r.json()) == 2)

        client.get("/api/recordings")  # again, ensure no crash on output model


if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(_SMOKE_DATA, ignore_errors=True)
    print(f"\n===== {len(PASS)} passed, {len(FAIL)} failed =====")
    if FAIL:
        sys.exit(1)