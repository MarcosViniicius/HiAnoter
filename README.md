# 🎙️ HiaNoter-Lite

> **Plataforma Open-Source Self-Hosted para Gravação de Áudio ao Vivo, Transcrição Local/Nuvem (Whisper), Resumos Científicos Multimodais, Mapas Mentais Radiais Interativos e Chat com IA Contextual.**

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61dafb.svg)](https://reactjs.org/)
[![Whisper](https://img.shields.io/badge/Whisper-Faster--Whisper%20%7C%20OpenRouter-orange.svg)](https://github.com/SYSTRAN/faster-whisper)
[![Theme: Dark & Light](https://img.shields.io/badge/Theme-Dark%20%26%20Light-purple.svg)](#-modo-escuro-e-aparência)

O **HiaNoter** é uma ferramenta pessoal, 100% gratuita e de código aberto voltada para estudantes, pesquisadores e profissionais que precisam transformar aulas, reuniões, conferências e anotações de áudio/documentos em conhecimento estruturado, mapas conceituais e anotações acionáveis.

---

## ⚡ Como Iniciar a Aplicação

Você pode iniciar o **HiaNoter** de duas formas: através dos **comandos rápidos / executáveis** (que instalam e configuram tudo automaticamente) ou através dos **comandos manuais de Python e Node.js**.

---

### Método 1: Comandos Rápidos & Executáveis (Recomendado)

O projeto possui scripts inteligentes que verificam e instalam dependências faltantes, preparam o ambiente virtual Python (`.venv`), compilam o frontend e abrem a aplicação pronta para uso em `http://localhost:8000` (e acessível na sua rede local em `http://<IP-DO-PC>:8000`).

#### 🪟 No Windows:

- **Opção A (Duplo clique ou CMD)**:
  Basta dar um duplo clique no arquivo **`run.bat`** (ou abrir o Prompt de Comando e digitar):
  ```cmd
  run.bat
  ```
- **Opção B (PowerShell)**:
  ```powershell
  .\run.ps1
  ```
- **Modo Desenvolvimento (com Hot-Reload no frontend e backend)**:
  ```powershell
  .\run.ps1 -Dev
  ```
- **Modo Aceleração GPU Adicional (Vulkan/whisper.cpp)**:
  ```powershell
  .\run.ps1 -Gpu
  ```

#### 🍎 No macOS / 🐧 No Linux:

Dê permissão de execução e inicie:
```bash
chmod +x run.sh setup.sh
./run.sh
```
- **Modo Desenvolvimento**:
  ```bash
  ./run.sh dev
  ```
- **Modo GPU (Vulkan)**:
  ```bash
  ./run.sh gpu
  ```

> 💡 **Setup Inicial Explícito:** Caso queira apenas preparar as dependências sem subir o servidor, execute `setup.bat` (Windows) ou `./setup.sh` (macOS/Linux).

---

### Método 2: Comandos Manuais (Node.js & Python)

Se você prefere controlar os processos manualmente pelo terminal:

#### 1️⃣ Pré-requisitos
- **Python 3.11+** (instalado e marcado no `PATH`)
- **Node.js 18+** e **npm**
- **ffmpeg** (utilizado para conversão e normalização de áudio)
  - Windows: `winget install Gyan.FFmpeg` ou `choco install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`

---

#### 2️⃣ Configurando e Rodando o Backend (Python / FastAPI)

1. **Crie e ative o ambiente virtual:**
   ```bash
   # Criar o ambiente virtual
   python -m venv .venv

   # Ativar no Windows (PowerShell):
   .venv\Scripts\Activate.ps1
   # Ativar no Windows (CMD):
   .venv\Scripts\activate.bat
   # Ativar no macOS / Linux:
   source .venv/bin/activate
   ```

2. **Instale as dependências do backend:**
   ```bash
   pip install --upgrade pip
   pip install -r backend/requirements.txt
   ```

3. **Crie o arquivo de configuração (opcional se for configurar pela interface):**
   ```bash
   cp backend/.env.example backend/.env   # No Windows: copy backend\.env.example backend\.env
   ```

4. **Inicie o servidor FastAPI:**
   ```bash
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *O backend estará rodando em `http://localhost:8000`.*

---

#### 3️⃣ Configurando e Rodando o Frontend (Node.js / Vite / React)

Em uma nova janela de terminal:

1. **Acesse a pasta do frontend e instale as dependências:**
   ```bash
   cd frontend
   npm install
   ```

2. **Para Desenvolvimento com Hot Reload (Vite Dev Server):**
   ```bash
   npm run dev
   ```
   *O frontend estará disponível em `http://localhost:5173` (com proxy automático para a API em `:8000`).*

3. **Para Compilar para Produção (servido diretamente pelo FastAPI em `:8000`):**
   ```bash
   npm run build
   ```
   *Após o build, ao acessar `http://localhost:8000`, o próprio FastAPI servirá a SPA compilada de forma ultrarrápida e unificada.*

---

## 📱 Acesso em Rede Local (Outros Computadores, Celulares e Tablets)

O HiaNoter é configurado nativamente com suporte a **`0.0.0.0`**, permitindo que você use o microfone do celular ou visualize resumos de qualquer dispositivo conectado na mesma rede Wi-Fi.

1. Inicie o HiaNoter no seu computador principal (`run.bat`, `.\run.ps1` ou `npm run dev`).
2. O terminal exibirá os endereços de rede detectados, por exemplo:
   ```text
   ➜ Local:   http://localhost:8000
   ➜ Rede:    http://192.168.1.105:8000
   ```
3. Abra o navegador no seu smartphone ou tablet e acerte a URL `http://192.168.1.105:8000`.
4. Você terá acesso total à interface mobile otimizada, gravação ao vivo pelo celular e visualização de mapas mentais.

---

## 🌙 Modo Escuro, Modo Claro e Personalização

O HiaNoter possui sistema de temas nativo com suporte a:
- ☀️ **Modo Claro (Paper Warm)**: Tons aquecidos inspirados em papel e livros.
- 🌙 **Modo Escuro (OLED Dark)**: Tons profundos de alto contraste e baixo cansaço visual.
- 💻 **Modo Sistema**: Sincroniza automaticamente com o tema do seu sistema operacional.
- ⚡ **Alternância em 1 Clique**: Botão direto no cabeçalho superior e seletor dedicado em **Configurações → Aparência**.
- 💾 **Persistência Completa**: Sua escolha fica salva no banco de configurações (`settings.json`) e no `localStorage`.

---

## ✨ Principais Recursos do HiaNoter

- 🎙️ **Transcrição Híbrida & Flexível**:
  - **Local (100% Offline & Privada)**: Motor `faster-whisper` com detecção automática de GPU NVIDIA (CUDA `float16`), aceleração CPU (`int8`) ou whisper.cpp.
  - **Nuvem (Ultrarrápida)**: Suporte a `whisper-large-v3-turbo` via OpenRouter.
- 🧠 **Resumos Analíticos em 5 Estilos Científicos**:
  - **Executivo** (ANSI/NISO Z39.14)
  - **Linguagem Simples** (Cochrane PLS)
  - **Abstract Estruturado** (IMRaD)
  - **Avaliação Crítica & Riscos** (GRADE)
  - **Fichamento Acadêmico & Itens de Ação**
- 🌿 **Mapa Mental Radial Interativo (Mind Map)**:
  - Visualização gráfica com nós em árvore concêntrica, níveis de profundidade com cores distintas, arraste suave (*pan & drag*), zoom e exportação em formato Mermaid.
- 📑 **Sessões de Estudo por Documentos & PDFs**:
  - Permite criar sessões sem áudio para resumir apostilas, slides de aula, imagens e notas de texto de forma multimodal.
- 💬 **Chat com IA Contextual**:
  - Converse diretamente com um tutor de IA que conhece a transcrição integral, o resumo e todos os documentos anexados.
- 🎵 **Player de Áudio Interativo**:
  - Waveform, atalho `Espaço`, controle de velocidade (`0.8x` a `2x`) e saltos táteis de `±10s`.
- 📤 **Exportação em Múltiplos Formatos**:
  - Sincronização direta com **Notion**, download de legendas sincronizadas (`.srt` e `.vtt`), **Markdown** (`.md`) e impressão formatada para **PDF**.

---

## ⚙️ Configuração de Chaves (OpenRouter & Notion)

Você pode configurar suas chaves de duas maneiras simples:

1. **Pela Interface Web (Recomendado)**:
   - Clique no ícone de engrenagem (**⚙ Configurações**) no topo ou na barra lateral.
   - Preencha sua chave do **OpenRouter** (`sk-or-v1-...`), escolha o modelo de IA desejado e insira o token do **Notion** se desejar exportação automática.
   - As configurações são salvas instantaneamente sem precisar reiniciar o servidor.

2. **Pelo arquivo `.env`**:
   Edite o arquivo `backend/.env`:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
   NOTION_API_KEY=secret_...
   NOTION_DATABASE_ID=<id_do_banco_notion>
   ```

---

## 🔌 Principais Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/recordings/upload` | Upload multipart de arquivo de áudio |
| `POST` | `/api/recordings/materials` | Cria sessão de estudo baseada em documentos/PDFs |
| `GET` | `/api/recordings` | Lista gravações com paginação e busca textual |
| `GET` | `/api/recordings/{id}` | Detalhe completo (áudio, transcrição, resumo, versões) |
| `GET` | `/api/recordings/{id}/stream` | Server-Sent Events (SSE) de progresso em tempo real |
| `GET` | `/api/recordings/{id}/audio` | Streaming do áudio original com suporte a range requests |
| `POST` | `/api/recordings/{id}/summarize` | Gera ou regenera resumo com estilo específico |
| `POST` | `/api/recordings/{id}/mindmap` | Gera ou regenera o mapa mental interativo |
| `POST` | `/api/recordings/{id}/chat` | Chat contextual com a IA sobre a aula/reunião |
| `POST` | `/api/recordings/{id}/export-notion`| Exporta página estruturada para o Notion |
| `GET` | `/api/settings` | Obtém configurações ativas do sistema |
| `PATCH`| `/api/settings` | Atualiza parâmetros, tema e chaves de API |
| `GET` | `/api/health` | Status do hardware, aceleração GPU/CPU e motor Whisper |

---

## 🧪 Testes Automatizados

Para rodar a suíte completa de testes de integração e fumaça:

```bash
# Com o venv ativado:
python backend/tests/smoke_test.py
```

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.