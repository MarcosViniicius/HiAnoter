# HiNoter-Lite · Arquitetura e Lógica Interna

> **Guia técnico completo e autossuficiente.** Este documento descreve, em detalhes,
> como a aplicação funciona: módulos, contratos, máquinas de estado, pipeline,
> seleção de hardware, configuração em runtime, API e frontend.
> Ele foi escrito para ser consumido integralmente por outras IAs (ou devs) —
> nenhum conhecimento externo é assumido além das bibliotecas citadas.

---

## 1. Visão geral

**HiNoter-Lite** é um aplicativo web self-hosted de transcrição e sumarização de áudio.
Fluxo principal do produto:

```
upload de áudio → normalização → transcrição local → resumo via LLM → export para o Notion
```

Princípios de decisão (v3):

- **Execução nativa** (sem Docker): Python venv + frontend estático servido pelo próprio FastAPI. Um único processo.
- **GPU-first** com detecção de qualquer GPU e motor de transcrição dinâmico (faster-whisper para NVIDIA, whisper.cpp para AMD/Intel/Apple).
- **Configuração viva** (menu) com persistência em JSON sobrepondo o `.env` — quase tudo muda em runtime.
- **Resumo resiliente**: falha no LLM não destrói a transcrição.
- Single-user / uso pessoal em `localhost` (sem autenticação).

---

## 2. Stack

| Camada | Tecnologia | Papel |
|---|---|---|
| Linguagem/API | Python 3.11+ · **FastAPI** (async) | HTTP + SSE + lifespan |
| ORM | **SQLAlchemy 2.0 async + aiosqlite** | metadados |
| Fila | **asyncio.Queue** em memória (concorrência máx. 1) | job único por vez |
| Transcrição engine A | **faster-whisper** (CTranslate2) | NVIDIA/CUDA e CPU fallback |
| Transcrição engine B | **pywhispercpp** (whisper.cpp/GGML) | GPU não-NVIDIA (Metal/Vulkan) e CPU |
| Aúdio | **ffmpeg** (binário do SO) | normaliza p/ WAV 16kHz mono |
| LLM | **httpx** → OpenRouter API (compatível OpenAI) | resumo/chunk/consolidação |
| Export | **notion-client** (SDK oficial) | Notion pages |
| Realtime | SSE (`text/event-stream`) | progresso 0–100 + done/error |
| Frontend | React 18 · Vite · TypeScript · Tailwind · React Query · react-markdown | UI |

---

## 3. Estrutura de diretórios

```
hinotwer/
├─ backend/
│  ├─ .env.example
│  ├─ requirements.txt
│  ├─ tests/smoke_test.py
│  └─ app/
│     ├─ main.py            → FastAPI app, lifespan, static serving
│     ├─ config.py          → Settings (live/overridable) + FieldSpec (menu)
│     ├─ database.py        → engine, session, init_db, migrações leves
│     ├─ models.py          → ORM Recording + enums
│     ├─ schemas.py         → Pydantic I/O
│     ├─ device.py          → detecção de GPUs + seleção de engine
│     ├─ events.py          → EventHub (pub/sub in-memory p/ SSE)
│     ├─ queue.py           → PipelineQueue (fila 1-worker)
│     ├─ pipeline.py        → process_recording (orquestra o job)
│     ├─ routes/
│     │  ├─ recordings.py   → endpoints de recordings (+ upload, SSE, retry, delete, export)
│     │  ├─ settings.py     → GET/PATCH/POST settings + /models (lista do OpenRouter)
│     │  └─ health.py       → /api/health
│     └─ services/
│        ├─ transcription.py → 2 engines + presets de velocidade
│        ├─ summarize.py     → LLM com chunking/retry/custo
│        ├─ model_list.py    → fetch modelos do OpenRouter (paginação + cache)
│        ├─ notion.py        → markdown/action-items → blocos Notion
│        └─ ffmpeg.py        → normalize_to_wav (subprocess)
├─ frontend/
│  ├─ src/
│  │  ├─ main.tsx  App.tsx  types.ts
│  │  ├─ lib/         (api.ts, format.ts, languages.ts, status.ts, utils.ts)
│  │  ├─ hooks/       (queries.ts, useRecordingLive.ts, useSettings.ts)
│  │  └─ components/  (Sidebar, DetailView, SummaryPanel, TranscriptPanel,
│  │                   Player, UploadZone, SettingsPanel, ModelSelect, ui/*)
│  └─ dist/            → build estático servido pelo backend
├─ run.ps1 / run.sh    → **um comando**: bootstrap (deps+ffmpeg+frontend) + sobe app
├─ setup.ps1 / setup.sh → instalação explícita opcional
```

---

## 4. Configuração (fonte única: `backend/app/config.py`)

### 4.1 Fontes e precedência

A config é um **snapshot vivo** (sem cache):

```
precedência:  variáveis de ambiente / backend/.env   →   <DATA_DIR>/settings.json  (menu)
```

- `get_settings()` reconstrói um `Settings` (pydantic-settings) a cada chamada,
  fundindo `.env` + overrides do JSON. Qualquer mudança no JSON vale na hora.
- `<DATA_DIR>` default = `~/.hinoter-lite/data`. Todos os caminhos derivados vêm daqui.

### 4.2 Caminhos derivados (properties)

| Property | Valor |
|---|---|
| `data_path` | `<DATA_DIR>` |
| `uploads_path` | `<DATA_DIR>/uploads` (arquivo bruto enviado) |
| `audio_path` | `<DATA_DIR>/audio` (WAV 16k normalizado) |
| `resolved_database_url` | **vazio no `.env`** ⇒ `sqlite+aiosqlite:///<DATA_DIR>/hinoter.db` (o banco acompanha o DATA_DIR) |

### 4.3 Campos efetivos (Settings)

**Armazenamento**: `data_dir`, `database_url`(vazio=padrão), `max_upload_mb`(300).
**Transcrição**: `whisper_model`(small), `whisper_device`(auto|cuda|cpu), `whisper_engine`(auto|faster-whisper|whisper-cpp), `whisper_language`(cs|None), `whisper_mode`(fast|balanced|quality|custom), `whisper_beam_size`(1) `whisper_temperature_fallback`(False) `whisper_cpu_threads`(0) — usados quando `mode=custom`.
**LLM**: `llm_chunk_token_limit`(12000), `llm_max_retries`(3), `llm_retry_base_delay`(2.0).
**OpenRouter**: `openrouter_api_key`, `openrouter_model`(anthropic/claude-3.5-sonnet), `openrouter_base_url`.
**Notion**: `notion_api_key`, `notion_database_id`.

### 4.4 CampoUI (FieldSpec) e API de settings

Cada campo tem um `FieldSpec` com `key/group/label/type/options/secret/requires_restart/help`.
- `type ∈ {str, int, float, bool, enum, secret}`.
- `secret` ⇒ o frontend **nunca recebe o valor**, só `set: bool`. No PATCH o frontend
  envia a sentinela `"__unchanged__"` para manter o valor secreto salvo.
- `requires_restart` (data_dir/database_url) ⇒ a UI avisa.
- `is_real_secret(value)` considera placeholders do `.env.example` (`sk-or-v1-xxxx…`) como "não configurado".

Endpoints:
```
GET  /api/settings                        → { settings: [FieldSpec+value], file }
PATCH /api/settings  body {values:{key:val}} → 200 {updated, requires_restart, notice} | 400 erro legível
POST /api/settings/reset                  → limpa overrides
GET  /api/settings/models?force=1         → todos os modelos do OpenRouter (cache 8h)
```

Lógica do PATCH (crítica):
1. valida chaves desconhecidas → `ValueError`.
2. secrets: ignora `None/""/UNCHANGED_SECRET`; remove chave se vazio nos não-secretos.
3. valida com `Settings(**{...base, **merged})` (pydantic → erros legíveis).
4. se tocou em `whisper_*` (`_WHISPER_KEYS` inclui model/device/engine/language/cpu_threads):
   escreve o overrides **depois** tenta `reset_models()` + `device.resolve_device()`.
   Em falha (ex.: `whisper_device=cuda` sem NVIDIA) **faz rollback** do arquivo e devolve erro 40x.
5. grava atomicamente via `tempfile`+`os.replace`.

---

## 5. Modelo de dados (SQLite — `models.py`)

Uma única tabela `recordings`:

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | str(36) UUID | PK |
| `title` | str | default `Gravação - DD/MM/AAAA HH:mm` |
| `original_file_path` | str\|null | upload bruto |
| `file_path` | str\|null | WAV 16k normalizado |
| `original_filename` | str | |
| `duration_seconds` | float | preenchido pelo motor |
| `status` | enum str | `QUEUED, TRANSCRIBING, SUMMARIZING, COMPLETED, FAILED` (index) |
| `progress_pct` | int | 0..100 (real, não spinner) |
| `error_message` | str\|null | causa raiz legível p/ transcrição/erro fatal |
| `retry_count` | int | nº de retries manuais |
| `raw_transcript` | text\|null | texto contínuo |
| `transcript_segments` | json\|null | `[{start,end,text}]` |
| `summary_markdown` | text\|null | resumo estruturado |
| `action_items` | json\|null | `["tarefa",...]` |
| `llm_cost_usd` | float\|null | custo estimado |
| `summary_error_message` | text\|null | erro só do resumo (não derruba) |
| `notion_page_id` / `notion_page_url` | | link da página criada |
| `notion_export_status` | enum str | `NOT_EXPORTED, EXPORTING, EXPORTED, FAILED` (index) |
| `notion_error_message` | text\|null | |
| `created_at` | datetime | index |

`init_db()` (`database.py`): `create_all` + migração leve via `PRAGMA table_info(recordings)`
que adiciona colunas novas (`summary_error_message`) via `ALTER TABLE` — mantém bancos antigos.

---

## 6. Seleção de engine/device (GPU-first) — `device.py`

A detecção roda no boot (e para re-resolução do menu). Reconhece **qualquer GPU**:

- `detect_nvidia_gpu()`: `nvidia-smi --query-gpu=name,memory.total` → `(nome, VRAM)`.
- `detect_windows_gpus()`: WMI `Win32_VideoController`.
- `detect_linux_gpus()`: `rocm-smi` (quando presente) senão `lspci`.
- `detect_apple_gpu()`: `sys.platform=='darwin'` + arm64 → Metal.

`resolve_device(settings)` → `DeviceInfo{engine, device, compute_type, gpu_name, vram, backend, gpus[], notes}`.
Regras (`WHISPER_DEVICE` / auto):

| Hardware | Engine | device/compute |
|---|---|---|
| NVIDIA VRAM ≥ 8GB | faster-whisper | `cuda` + `float16` |
| NVIDIA VRAM < 8GB | faster-whisper | `cuda` + `int8_float16` |
| AMD/Intel | whisper.cpp | `vulkan` (ou CPU se binding não otimizar) |
| Apple Silicon | whisper.cpp | `metal` |
| sem GPU | faster-whisper | `cpu` + `int8` |

- `WHISPER_DEVICE=cpu` força CPU (GPU apenas logada).
- `WHISPER_DEVICE=cuda` sem NVIDIA ⇒ **RuntimeError no boot** com mensagem clara.
- `WHISPER_ENGINE=auto|faster-whisper|whisper-cpp` permite escolher o motor.
- Fallback **em runtime** (ex.: carregamento falha em CUDA) → `set_current` com `device="cpu"` e memo.

> Overrides do menu usam `DATABASE_DIR`, `WHISPER_*` e os enums do `.env.example`
> (ver seção Configurações). `build-whisper-cpp.ps1/.sh` permite recompilar o engine
> GPU Vulkan para AMD/Intel (o wheel pip é CPU-only).

`/api/health` expõe o `DeviceInfo` atual (engine, device, gpu_name, gpus[], notes).

---

## 7. Serviço de transcrição unificado — `services/transcription.py`

**Contrato público:**
```
async ensure_model() -> None                     # carrega/cache o modelo do engine atual
def  transcribe_sync(path, on_progress=None) -> (text: str, segments: list[dict], duration: float)
def  reset_models() -> None                      # zera cache (chamado via settings)
```

- Modelos ficam cacheados (singleton por engine); carregados via `asyncio.to_thread`.
- **faster-whisper**: `WhisperModel(model, device, compute_type, download_root=<DATA_DIR>/models)`.
- **whisper.cpp**: `pywhispercpp Model(model, models_dir=<DATA_DIR>/models, n_threads=resolve)`.
- Presets de velocidade `MODE_PRESETS`: fast{beam1,noFallback}, balanced{beam2}, quality{beam5,fallback}. `custom` usa os knobs.
- `_speed_params()` e `_resolve_threads()` decidem beam/temperature/threads.
- Falha ao carregar faster-whisper em CUDA/Vulkan ⇒ fallback silencioso para `cpu/int8` (log);
  se o motor whisper.cpp não estiver instalado ⇒ erro legível.
- Progresso: callback invocado por segmento decodificado (a duração total é conhecida) →
  `progress_pct` é um número real entre 0–100.

**Formatos de saída (contrato):**
```
faster-whisper: transcribe(VAD opcional) → itera segmentos (start/end/text);
                progress = seg.end / total_duration * 100
whisper.cpp:    pywhispercpp transcribe → lista de Segment com t0/t1 em *centésimos* de
                segundo e text; progress = t1 / (wav_duration * 100) * 100; converte p/ segundos.
Cada motor retorna (texto_contínuo, segments[], duration_seconds)
```

---

## 8. Pipeline — `pipeline.py` (process_recording) + `queue.py`

Job em background com **concorrência máx. 1** (fila de processos).

```
retry/usuário
  │ queue.enqueue(id)
  ▼
process_recording(id)
  1. reivindica: status=TRANSCRIBING, pct=0     (409 se já em processamento)
  2. [se !file_path] ffmpeg: upload → WAV 16k mono em <DATA_DIR>/audio/<id>.wav
  3. [se !raw_transcript] transcribe_sync() com poll de pct→db+SSE
  4. [se !summary_markdown]
       se há transcrição:
         status=SUMMARIZING; tenta summarize (timeout 300s)
         ERRO ⇒ recording fica **COMPLETED** e error vai p/ summary_error_message
       senão: summary = "_Nenhuma fala detectada…_"
  5. status = COMPLETED / event done         (qualquer exceção → FAILED + evento error)
```

- `_run_transcription`: roda o motor numa thread com `asyncio.to_thread`, faz poll de
  0.5s para atualizar `progress_pct` apenas quando muda, e comite + `hub.publish`.
- `recover_stale_recordings()` no boot: TRANSCRIBING/SUMMARIZING órfãos (morte do
  processo) → **FAILED** com mensagem "processo reiniciado".

`queue.py` (`PipelineQueue`):
- `enqueue(id)` dedup por `_pending`.
- `start()` cria task `_run()`; `stop(timeout=8)` usa `asyncio.shield` e trata
  `TimeoutError`/`CancelledError` sem explode (pará limpo em Ctrl+C); `cancel_worker_now`.
- `runtime` (fica em memória) — perde-se jobs se o processo morre (aceito p/ uso pessoal).

---

## 9. Resumo via OpenRouter — `services/summarize.py`

**Funções:**
- `_call_llm(system, user, retries)` — 1 requisição `POST {base}/chat/completions`
  (model, messages, temperature 0.2, max_tokens 4096); retries exponential backoff
  (429/5xx), lê `usage`; lança `_ReadableLLMError` com mensagem legível (chave ausente
  ou placeholder → erro imediato/"não configurada").
- `_get_pricing(model)` — `GET /models` cached forever (chaves de preço).
- `_estimate_cost(usage)` — `usage.cost` da resposta OU (prompt_tokens·prompt_rate + completion·completion_rate)
  com fallback de tarifas genéricas.
- `extract_action_items(content)` — lê bloco único delimitado por `<action_items>...</action_items>`
  (fallback para fenced json). **Não** parsea markdown com regex.
- `_chunk_segments(segments, limit)` — agrupa segmentos por token/estimativa
  (`len(text)/4`), em limites no fim de cada segmento.

`summarize_transcript(text, segments) → {summary_markdown, action_items, llm_cost_usd, total_tokens}`:
1. se `len(chunks)≤1 ⇒ prompt DOCUMENT` (Resumo Executivo / Pontos-Chave / Notas Detalhadas / action items JSON).
2. senão: p/ cada chunk → `SYSTEM_CHUNK` (resumo parcial ≤6 bullets);
   depois `SYSTEM_CONSOLIDATE` (fundir N parciais num doc coeso — sem repetição).
   O bloco `<action_items>` é extraído e removido do markdown final.

Lógica **sempre em pt-BR**; palavras-chave não inventadas (instrução nos prompts).

---

## 10. Export Notion — `services/notion.py`

- `_notion_client()` orquestra: falta `NOTION_API_KEY`/`DATABASE_ID` → `NotionConfigError` (mensagens em pt, apontando p/ o menu).
- `build_blocks(md, action_items)` — converte Markdown em blocos:
  `#/##/###→heading_1..3`, `- → bulleted_list_item`, `1. → numbered`, `> → quote`,
  `--- → divider`, ``` → code block, parágrafo plano → paragraph (com `**`/`*`/`` ` `` inline),
  e **action items virando checkbox `to_do[]`** (não texto solto).
- `export_to_notion(recording)`:
  1. detecta a propriedade `title` do banco;
  2. cria a **página** (children em lotes de 100 máx) + append restante;
  3. retorna `(page_id, page_url)`.
- Roda síncrono por `asyncio.to_thread`; erros → `NotionExportError`.

Endpoint `POST /api/recordings/{id}/export-notion`:
- `NOT exported` → set EXPORTING → chama exporta → EXPORTED com page_id/url;
  erro config → FAILED (mantém botão de retry) — **evita duplicar página**.

---

## 11. API — rotas (`routes/`)

### health
```
GET /api/health → {status:"ok", version, device: DeviceInfoOut, whisper_model, max_upload_mb, ffmpeg_available, huggingface_cache_dir}
```

### recordings (prefixo `/api/recordings`)
| Método | Rota | Comentário |
|---|---|---|
| POST | `/upload` | multipart. Ext (`.mp3 .m4a .wav .ogg .webm .mp4`) → 415; vazio → 400; >max → 413 antes de gravar. Salva em `uploads/`. Retorna `201 {id,status:"QUEUED",title}` e enfila job. |
| GET | `""` | lista `limit`/`offset` com `summary_preview` (2 primeiras linhas) |
| GET | `/{id}` | detalhe completo |
| GET | `/{id}/audio` | **Range requests** (`Range: bytes=`) no arquivo original p/ o `<audio>` |
| GET | `/{id}/stream` | **SSE** (abaixo) |
| POST | `/{id}/retry` | só `FAILED` ou `COMPLETED` sem summary. Zera erro, incrementa `retry_count`, enqueue |
| POST | `/{id}/export-notion` | acima |
| DELETE | `/{id}` | exclui do disco (segundo: `DATA_DIR` do path) e apaga row; bloqueado se processando |
| DELETE | `""` | bulk: body `{ids:[...]}` ou `{all:true}`; apaga tudo; pula os processando; resp `{ok, removed}` |

> Segurança de delete: só remove arquivos cujo `Path.resolve().startswith(data_path.resolve())`.

### SSE (`/stream`)
Formato dos eventos:
```
event: progress   data {"status": "TRANSCRIBING", "progress_pct": 42}
event: done       data {"status":"COMPLETED"}
event: error      data {"status":"FAILED", "error_message":"..."}
```
- Inicia com `data: <estado atual>` (quem chega atrasado vê de cara), keepalive a cada 15s,
  desconexão cliente → `CancelledError` tratado silenciosamente (sem traceback no log).
- Implementado via `EventHub` (`events.py`): subs por recording_id em `set[asyncio.Queue]`,
  publication `loop.call_soon_threadsafe` (seguro para os worker threads).

---

## 12. Startup / shutdown (`main.py`)

Lifespan:
```
settings.ensure_dirs → init_db (cria+ migra) → recover_stale → hub.bind_loop
→ device.resolve_device → queue.start → yield
finally: await queue.stop() (tolerante a cancelamento)
```
- Express app: `StaticFiles` `/assets` + SPA fallback para `frontend/dist/index.html`
  (monta assets e qualquer rota desconhecida → index.html).
- CORS libera `localhost:5173` (dev).

---

## 13. Frontend (React + Vite + TS)

### Estado / fluxo de dados
- **React Query** (TanStack): chaves `["health"]`, `["recordings"]`, `["recording",id]`, `["settings"]`, `["openrouter-models"]`.
  - `useRecordings` com `refetchInterval` 4s quando há item ativo.
  - `useRecording` com `refetchInterval` 5s enquanto ativo (fallback do SSE).
- **`useRecordingLive(id)`**: abre `EventSource(/api/recordings/{id}/stream)`;
  no `progress` atualiza cache; no `done/error` invalida lista.
- Mutations: `useUploadRecording` (XHR com progresso real), `useRetryRecording`,
  `useExportNotion`, `useDeleteRecordings`, `useDeleteAllRecordings`.

### Components principais
- **Sidebar**: brand + engrenagem (⚙ Configurações) + **lixeira (🗑 Gerenciar/Excluir)**
  — entra em modo de seleção com checkboxes, "Excluir selecionadas" e "Excluir todas"
  (com confirmação) — + chip do device (GPU/CPU) + `UploadZone` (drag&drop,
  valida limite client-side) + busca + lista de
  `RecordingRow` (badge de status, barra de progresso inline, animação wave quando ativo).
- **DetailView** (`/#recording/<id>`): header (titulo serif + metadata),
  estados `QUEUED/TRANSCRIBING/SUMMARIZING/FAILED`, e quando `COMPLETED`:
  Player (audio range), Tabs (Resumo/Transcrição, sticky), painéis **lazy-loaded**
  (`React.lazy` de `SummaryPanel`/`TranscriptPanel` — chunk separado, corta bundle).
- **SummaryPanel**: markdown render via react-markdown; se `summary_error_message`
  → aviso "Resumo não gerado" + botão "Tentar resumo novamente". Action items = checklist.
  Export Notion habilitado só com mensagens.
- **TranscriptPanel**: segmentos com timestamps (clique `seekTo` no player).
- **SettingsPanel** (drawer): renderiza cada `FieldSpec` como select/input/toggle,
  secretos com olho "revela" (nunca valor), senha vazia nos secrets? modelo com
  **ModelSelect** (combobox com busca + preço por M tokens + atualizar + "uso personalizado").
  Idiomas em `<select>` (80+) via `lib/languages.ts`.
- `lib/status.ts` centraliza CORES/labels de status (fonte única).
- Acessibilidade: skip-link, `role/tablist`, `aria-checked`, focus rings, `prefers-reduced-motion`.

---

## 14. Testes (smoke)

`backend/tests/smoke_test.py` — roda de verdade com TestClient + lifespan:
- isola `DATA_DIR` aleatório (não toca dados do usuário), força `WHISPER_DEVICE=cpu` e
  chaves vazias.
- cobre em **18 asserts**: health (formato válido + GPU quando presente), 415/400 no upload,
  upload OK→QUEUED, fila→COMPLETED, SSE (snapshot), retry (contador), erro de resumo
  legível mantendo COMPLETED, bulk delete.
- exige ffmpeg no PATH (gera um wav 16kHz via TTS do SO para o upload real) e isola `DATA_DIR`.
Comando: `python backend/tests/smoke_test.py`.

---

## 15. Execução — run.ps1 / run.sh ("um comando")

O `run.ps1` (Windows) e `run.sh` (Linux/mac) fazem o mesmo bootstrap em 1 comando:
1. verificam pré-requisitos (python/node/ffmpeg; instalam via winget se faltar e atualizam o PATH).
2. criam `.venv` se não existir.
3. `pip install -r backend/requirements.txt` com cache por hash no arquivo `.venv/.hinoter-deps`.
4. criam `backend/.env` a partir do example (na 1ª vez).
5. buildam `frontend/dist` se não existir.
6. opcional com `-Gpu` (ps1) / `gpu` (sh) → compilam whisper.cpp com Vulkan na 1ª vez.
7. rodam `uvicorn` servindo o dist e abrem o navegador.

```bash
# Windows
.\run.ps1 [-Dev] [-Gpu] [-NoBrowser] [-Port N]
# Linux/macOS
./run.sh [dev|gpu|setup]
```

`setup.ps1`/`setup.sh` — versão explícita (mesma coisa em passos) para quem prefere instalação separada.

---

## 16. Decisões de design notáveis

- **Fila em memória** desaparece em crash (jobs pendentes viram FAILED no boot).
- **Sem auth** — pessoal, somente `localhost`; expor em rede ⇒ adicionar auth.
- **CTranslate2 não acelera AMD/Intel** (wheel pip do whisper.cpp é CPU-only) — o app detecta
  a GPU e escolhe whisper.cpp, mas roda na CPU até recompilar com Vulkan/Metal (`build-whisper-cpp.*`).
- **Banco segue o DATA_DIR** — dá para 'mudar de lugar' movendo uma pasta inteira.
- **Secretos nunca saem da API** — o frontend recebe só `set: bool`; PATCH usa sentinela `__unchanged__`.
- **Não versionar `backend/.env` nem `data/`** (o `.gitignore` já cobre).

---

**Fim.** Para adições, alterações ou bugs, edite este arquivo junto com o código correspondente.