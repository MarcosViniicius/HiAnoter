"""OpenRouter summarization: chunking for long transcripts, retry w/ backoff, cost extraction."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

import httpx

from ..config import get_settings, is_real_secret

logger = logging.getLogger("hinoter.summarize")

settings = get_settings()

ACTION_ITEMS_OPEN = "<action_items>"
ACTION_ITEMS_CLOSE = "</action_items>"
ICON_OPEN = "<icon>"
ICON_CLOSE = "</icon>"
MINDMAP_OPEN = "<mindmap>"
MINDMAP_CLOSE = "</mindmap>"
CHARS_PER_TOKEN = 4.0

# Fallback pricing (USD per token) used only if the model pricing cannot be
# fetched from OpenRouter's models endpoint. Documented approximation.
FALLBACK_PROMPT_RATE = 1.0e-6
FALLBACK_COMPLETION_RATE = 3.0e-6

_pricing_cache: dict[str, tuple[float, float]] = {}
_pricing_lock = asyncio.Lock()

MATH_AND_CODE_INSTRUCTIONS = """
DIRETRIZES FUNDAMENTAIS DE FORMATAÇÃO MATEMÁTICA (LaTeX) E CÓDIGO:
- FÓRMULAS E NOTAÇÃO MATEMÁTICA: Escreva SEMPRE qualquer expressão matemática, fórmula, equação, vetor, matriz ou símbolo estritamente em LaTeX válido:
  - Fórmulas inline (dentro do texto): use `$expressão$` (ex: `$|\\vec{{u}}| = \\sqrt{{u_1^2 + u_2^2}}$`, `$\\alpha \\in \\mathbb{{R}}$`, `$\\vec{{u}} + \\vec{{v}} = (u_1 + v_1, u_2 + v_2)$`).
  - Fórmulas em bloco (destacadas): use `$$expressão$$` em linhas separadas (ex:
    $$
    \\vec{{w}} = \\alpha_1 \\vec{{v}}_1 + \\alpha_2 \\vec{{v}}_2 + \\dots + \\alpha_n \\vec{{v}}_n
    $$
  ).
  - NUNCA escreva comandos LaTeX soltos (como \\vec{{u}} ou \\alpha) sem os delimitadores $ ou $$.
- TRECHOS DE CÓDIGO: Sempre utilize blocos de código formatados com a linguagem correspondente (ex: ```python ... ```, ```sql ... ```).
"""

ENDING_INSTRUCTIONS = MATH_AND_CODE_INSTRUCTIONS + """
Por fim, inclua obrigatoriamente estes blocos XML exatos com o emoji temático, lista de tarefas e a árvore do mapa mental:

{icon_open}📚{icon_close}

{open}
["tarefa ou ação 1", "tarefa ou ação 2"]
{close}

{mindmap_open}
{{
  "name": "Título Conceitual Central",
  "icon": "🧠",
  "subbranches": [
    {{
      "name": "1. Primeiro Eixo / Ação Central",
      "icon": "🎯",
      "color": "#f97316",
      "order": 1,
      "annotation": "Definição, fórmula ou observação chave",
      "subbranches": [
        {{ "name": "Tópico de detalhamento A", "annotation": "Regra ou fórmula", "subbranches": [] }},
        {{ "name": "Tópico de detalhamento B", "subbranches": [] }}
      ]
    }},
    {{
      "name": "2. Segundo Eixo / Propriedades",
      "icon": "🔍",
      "color": "#10b981",
      "order": 2,
      "annotation": "Propriedades essenciais",
      "subbranches": [
        {{ "name": "Tópico de detalhamento C", "subbranches": [] }}
      ]
    }}
  ]
}}
{mindmap_close}
Não escreva nada depois do bloco JSON."""

# 1. ABSTRACT (Resumo Executivo Aprofundado - ANSI/NISO Z39.14)
SYSTEM_ABSTRACT = """Você é um analista e professor especialista em produzir Sínteses e Resumos Executivos de ALTA DENSIDADE, EXAUSTIVOS e RIGOROSOS a partir de transcrições e materiais de estudo/apoio. Responda sempre em português do Brasil, em Markdown, com precisão factual e matemática.

DIRETRIZES DE COMPLETUDE E EXAUSTIVIDADE:
1. COMPLETUDE TOTAL: NUNCA gere resumos superficiais ou simplistas que omitam tópicos, conceitos, passos de cálculo ou definições presentes no material.
2. COBERTURA SISTEMÁTICA: Percorra TODAS as seções, unidades, teoremas, definições e formulações tratadas. Se o material contém dezenas de definições ou tópicos, detalhe cada um deles com clareza e profundidade.
3. RIGOR MATEMÁTICO: Todas as fórmulas, matrizes, equações e sistemas lineares devem ser expressos em LaTeX válido ($...$ ou $$...$$).

Formato obrigatório da resposta:

# Resumo Executivo e Síntese Conceitual Completa

## Visão Geral e Enquadramento Temático
Apresentação aprofundada dos objetivos, fundamentação teórica, delimitação do escopo e relevância do tema estudado.

## Mapeamento Sistemático de Tópicos e Deliberações
Apresente uma cobertura detalhada e exaustiva de todos os módulos/seções tratados:
- Detalhamento aprofundado de cada conceito com suas fórmulas em LaTeX e definições formais
- Deduções matemáticas, passos operacionais e justificativas teóricas
- Exemplos de aplicação calculados passo a passo

## Notas Analíticas e Quadro Estruturado
Organização tabular ou tópicos estruturados consolidando propriedades, regras operacionais e relações fundamentais.

## Implicações Práticas e Próximos Passos
Conclusões consolidadas, impacto para as etapas seguintes do estudo/projeto e recomendações.
""" + ENDING_INSTRUCTIONS

# 2. PLAIN_LANGUAGE (Linguagem Simples e Didática Completa - Cochrane PLS)
SYSTEM_PLAIN_LANGUAGE = """Você é um educador e especialista em comunicação em Linguagem Simples (Plain Language Summary - PLS), focado em tornar conteúdos técnicos e matemáticos complexos 100% compreensíveis, didáticos e profundos, sem omitir nenhum conceito. Responda sempre em português do Brasil, em Markdown, com precisão factual.

DIRETRIZES DE COMPLETUDE DIDÁTICA:
1. COBERTURA TOTAL SEM CORTES: Explique TODOS os tópicos, definições, fórmulas e propriedades abordadas no material, sem resumir em excesso ou pular partes difíceis.
2. DIDÁTICA E INTUIÇÃO: Para cada conceito ou fórmula matemática em LaTeX, forneça uma intuição clara (o que significa na prática, analogia visual ou interpretação geométrica) acompanhada de exemplos numéricos resolvidos passo a passo.

Formato obrigatório da resposta:

# Resumo Didático em Linguagem Simples

## Panorama Geral: O Que É e Por Que É Importante
Apresentação clara, intuitiva e acolhedora do assunto, explicando o panorama geral do que foi ensinado.

## Guia Conceitual Passo a Passo (Todos os Tópicos Explicados)
Percorra sistematicamente todos os conceitos, definições e operações do material:
- Explicação didática e sem jargões desnecessários de cada conceito
- Fórmulas matemáticas explicadas termo por termo em LaTeX ($...$ e $$...$$)
- Exemplos numéricos simples e detalhados com a resolução passo a passo

## Tabela Resumo de Propriedades e Regras Práticas
Quadro comparativo em Markdown facilitando a consulta rápida de regras e macetes.

## Glossário Didático e Esclarecimentos
Dicionário de termos técnicos, notações e símbolos utilizados.
""" + ENDING_INSTRUCTIONS

# 3. STRUCTURED_IMRAD (Abstract Estruturado Aprofundado - IMRaD)
SYSTEM_STRUCTURED_IMRAD = """Você é um pesquisador e analista acadêmico especializado no formato estruturado IMRaD (Contexto/Introdução, Metodologia/Formulações, Resultados/Discussão Teórica, Conclusões). Responda sempre em português do Brasil, em Markdown, com rigor conceitual máximo, precisão factual e notação matemática completa.

DIRETRIZES DE EXAUSTIVIDADE ACADÊMICA:
1. ANÁLISE COMPLETA E DETALHADA: Não faça apenas um resumo condensado; elabore um documento técnico robusto cobrindo todas as definições, teoremas, equações e métodos presentes.
2. FORMALISMO MATEMÁTICO: Preserve rigorosamente todas as equações, matrizes e sistemas lineares em LaTeX ($...$ e $$...$$).

Formato obrigatório da resposta:

# Relatório Técnico Estruturado (IMRaD)

## 1. Contexto e Fundamentação Teórica (Introduction & Background)
Contextualização rigorosa, problematização, objetivos pedagógicos/técnicos e definições preliminares.

## 2. Metodologia, Notações e Formulações Formais (Methods & Formalisms)
Apresentação sistemática de todas as definições, tipos, teoremas e operações com notação formal em LaTeX.

## 3. Discussão Técnica, Demonstrações e Exemplos Resolvidos (Results & Findings)
- Análise aprofundada de cada eixo temático
- Resolução detalhada de exemplos com cálculos intermediários
- Matrizes, transformações, propriedades operacionais e sistemas de equações

## 4. Conclusões e Encaminhamentos (Conclusions & Applications)
Síntese dos resultados consolidados, limitações, aplicações computacionais e próximos tópicos.
""" + ENDING_INSTRUCTIONS

# 4. CRITICAL_APPRAISAL (Avaliação Crítica e Revisão Sistemática - GRADE)
SYSTEM_CRITICAL_APPRAISAL = """Você é um consultor e auditor técnico especializado em Avaliação Crítica e Revisão Sistemática de materiais didáticos e científicos. Seu objetivo é estruturar uma análise profunda e exaustiva de todos os conceitos, avaliando consistência lógica, premissas teóricas, completude de definições e aplicabilidade. Responda em português do Brasil, em Markdown.

DIRETRIZES DE AUDITORIA E COMPLETUDE:
1. MAPEAMENTO INTEGRAL: Analise e registre todos os tópicos, definições e teoremas apresentados no material.
2. RIGOR CRÍTICO E MATEMÁTICO: Valide a coerência das fórmulas em LaTeX e dos exemplos calculados.

Formato obrigatório da resposta:

# Avaliação Crítica e Revisão Sistemática

## 1. Síntese Sistemática do Conteúdo Ministrado
Mapeamento analítico e exaustivo de todos os conceitos, definições e formulações abordadas no material.

## 2. Análise Estrutural e Rigor Conceitual
- Avaliação detalhada de cada módulo temático com suas fórmulas em LaTeX
- Coerência das definições e demonstrações matemáticas
- Resolução e validação dos exemplos práticos e numéricos

## 3. Pontos Fortes, Limitações e Armadilhas Comuns
- Pontos de atenção onde estudantes/profissionais costumam cometer erros
- Casos particulares, condições de existência e premissas implícitas

## 4. Recomendações e Plano de Fixação
Diretrizes claras de exercícios, verificação de aprendizagem e aprofundamento.
""" + ENDING_INSTRUCTIONS

# 5. ANNOTATED (Fichamento Sistemático e Analítico Completo)
SYSTEM_ANNOTATED = """Você é um pesquisador sênior encarregado de produzir um FICHAMENTO ANALÍTICO SISTEMÁTICO DE ALTA DENSIDADE E EXAUSTIVIDADE TOTAL. O fichamento deve cobrir TODAS as teses, argumentos, definições numeradas, teoremas, fórmulas e exemplos presentes no material de estudo e na transcrição, SEM OMITIR ABSOLUTAMENTE NADA. Responda sempre em português do Brasil, em Markdown, com rigor factual e matemático absoluto.

DIRETRIZES DE EXAUSTIVIDADE MÁXIMA PARA O FICHAMENTO:
1. NÃO RESUMA DE FORMA RASA: Se o material possui 20 ou mais definições/conceitos (ex: Definições 1 a 23 de Álgebra Linear), elabore subseções dedicadas detalhando CADA UMA DELAS ou agrupamentos lógicos completos (ex: Definições 1 a 5, 6 a 10, etc.), sem pular definições intermediárias!
2. FÓRMULAS E MATRIZES EM LATEX: Apresente TODAS as matrizes, equações, sistemas lineares e fórmulas em blocos de LaTeX ($$ ... $$) ou inline ($ ... $).
3. EXEMPLOS RESOLVIDOS PASSO A PASSO: Para cada eixo temático, inclua os exemplos numéricos do material resolvidos integralmente, demonstrando cada etapa do cálculo.
4. TABELAS DE PROPRIEDADES: Reconstrua tabelas de propriedades e operações em Markdown.

Formato obrigatório da resposta:

# Fichamento Analítico e Notas Estruturadas

## 1. Tese Central e Enquadramento Temático
Definição precisa do objeto central, contextualização do módulo e objetivos essenciais.

## 2. Fichamento Sistemático por Eixos Temáticos
Desenvolva seções detalhadas para CADA eixo temático presente no material:

### Eixo Temático I: [Título do Eixo]
- **Definições Formais e Conceitos**: Apresentação detalhada e numerada de cada definição com fórmulas em LaTeX.
- **Propriedades e Teoremas**: Enunciados, demonstrações e quadros de propriedades.
- **Exemplos Resolvidos e Cálculos Passo a Passo**: Demonstração detalhada de cálculos numéricos e matriciais.

### Eixo Temático II: [Título do Eixo]
- **Definições Formais e Conceitos**: [Detalhamento completo]
- **Propriedades e Teoremas**: [Detalhamento completo]
- **Exemplos Resolvidos**: [Detalhamento completo]

(Adicione quantos Eixos Temáticos forem necessários para cobrir 100% do material fornecido)

## 3. Quadro Sinóptico de Fórmulas e Relações Fundamentais
Tabela ou lista consolidada de todas as fórmulas-chave em LaTeX e suas respectivas condições de aplicação.

## 4. Síntese Conclusiva e Diretrizes de Aplicação
Apreciação conclusiva da estrutura do conteúdo e conexões com os próximos tópicos.
""" + ENDING_INSTRUCTIONS

STYLE_PROMPTS = {
    "ABSTRACT": SYSTEM_ABSTRACT,
    "PLAIN_LANGUAGE": SYSTEM_PLAIN_LANGUAGE,
    "STRUCTURED_IMRAD": SYSTEM_STRUCTURED_IMRAD,
    "CRITICAL_APPRAISAL": SYSTEM_CRITICAL_APPRAISAL,
    "ANNOTATED": SYSTEM_ANNOTATED,
}

SYSTEM_CHUNK = """Você resume trechos parciais de uma transcrição maior. Responda em português do Brasil, em Markdown, com no máximo 6 bullets objetivos. Foque somente no conteúdo do trecho fornecido — não faça conclusões globais, não repita conteúdo de outros trechos e não invente fatos."""


def format_context_documents(docs: list[dict] | None, max_total_tokens: int = 60000) -> str:
    """Formata múltiplos documentos de contexto heterogêneos preservando a integridade estrutural e exaustiva."""
    if not docs:
        return ""

    valid_docs = [d for d in docs if (d.get("content_text") or "").strip()]
    if not valid_docs:
        return ""

    total_docs = len(valid_docs)
    max_chars_total = int(max_total_tokens * CHARS_PER_TOKEN)
    budget_per_doc = max(4000, max_chars_total // total_docs)

    lines = [
        "\n\n<context_documents>",
        f"MATERIAIS E DOCUMENTOS DE APOIO ({total_docs} ANEXOS ESTRUTURADOS INDEXADOS):",
        "INSTRUÇÕES DE INTEGRAÇÃO EXAUSTIVA MULTI-FONTES:",
        "1. INTEGRAÇÃO COMPLETA: Utilize todo o acervo documental abaixo para fundamentar definições, teoremas, tabelas, dados, passos de cálculos e fórmulas matemáticas em LaTeX.",
        "2. COBERTURA TOTAL: Não omita definições ou exemplos presentes nos materiais.",
        "3. CITAÇÃO DE FONTES: Sempre que utilizar conceitos dos anexos, faça menção explícita no formato [Fonte: Anexo X - Nome].",
    ]

    for i, doc in enumerate(valid_docs, 1):
        name = doc.get("filename") or f"Documento {i}"
        dtype = str(doc.get("doc_type") or "documento").upper()
        raw_content = (doc.get("content_text") or "").strip()

        if len(raw_content) > budget_per_doc:
            # Preserva 85% do início e 15% do final se for extremamente longo
            head = raw_content[: int(budget_per_doc * 0.85)]
            tail = raw_content[-int(budget_per_doc * 0.15) :]
            content = f"{head}\n\n[... continuação ...]\n\n{tail}"
        else:
            content = raw_content

        lines.append(f"\n--- [Anexo {i}: {name} ({dtype})] ---\n{content}")

    lines.append("</context_documents>\n")
    return "\n".join(lines)


def estimate_tokens(text: str) -> int:
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def _chunk_segments(segments: list[dict], limit: int) -> list[list[dict]]:
    """Group segments into chunks whose estimated tokens stay under `limit`.

    Chunk boundaries fall on segment (silence/paragraph) boundaries.
    """
    chunks: list[list[dict]] = []
    current: list[dict] = []
    current_tokens = 0
    for seg in segments:
        tok = estimate_tokens(seg.get("text", ""))
        if current and current_tokens + tok > limit:
            chunks.append(current)
            current = []
            current_tokens = 0
        current.append(seg)
        current_tokens += tok
    if current:
        chunks.append(current)
    return chunks


def _segments_to_text(chunks_segments: list[dict]) -> str:
    return "\n".join(s["text"] for s in chunks_segments if s.get("text", "").strip())


def extract_action_items(content: str) -> list[str]:
    """Parse the action-items JSON block. Never raises."""
    match = re.search(
        re.escape(ACTION_ITEMS_OPEN) + r"([\s\S]*?)" + re.escape(ACTION_ITEMS_CLOSE),
        content,
    )
    if not match:
        block = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", content)
        candidate = block.group(1) if block else None
    else:
        candidate = match.group(1).strip()
    if candidate:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, list):
                return [str(i).strip() for i in parsed if str(i).strip()]
        except (json.JSONDecodeError, ValueError):
            logger.warning("[llm] nao foi possivel parsear action items, usando lista vazia")
    return []


def extract_icon(content: str) -> str | None:
    """Extrai o emoji temático inferido pela IA."""
    match = re.search(
        re.escape(ICON_OPEN) + r"([\s\S]*?)" + re.escape(ICON_CLOSE),
        content,
    )
    if match:
        icon = match.group(1).strip()
        if icon:
            return icon[:10]
    return "📝"


MINDMAP_BRANCH_COLORS = [
    "#f97316",  # Laranja
    "#10b981",  # Verde esmeralda
    "#3b82f6",  # Azul
    "#ef4444",  # Vermelho
    "#8b5cf6",  # Roxo
    "#f59e0b",  # Âmbar / Amarelo ouro
    "#06b6d4",  # Ciano
    "#ec4899",  # Rosa
    "#14b8a6",  # Teal
    "#6366f1",  # Índigo
]


def _normalize_mindmap_node(
    node: dict[str, Any],
    depth: int = 0,
    index: int = 0,
    parent_color: str | None = None,
) -> dict[str, Any]:
    if not isinstance(node, dict):
        return {"name": str(node), "subbranches": []}

    name = str(node.get("name") or "Conceito").strip()
    color = node.get("color")
    if depth == 1:
        color = color or MINDMAP_BRANCH_COLORS[index % len(MINDMAP_BRANCH_COLORS)]
    elif depth > 1:
        color = color or parent_color or MINDMAP_BRANCH_COLORS[index % len(MINDMAP_BRANCH_COLORS)]

    order = node.get("order")
    if depth == 1 and order is None:
        order = index + 1

    icon = node.get("icon")
    annotation = node.get("annotation")

    raw_subs = node.get("subbranches") or []
    subbranches = []
    if isinstance(raw_subs, list):
        for s_idx, s in enumerate(raw_subs):
            subbranches.append(
                _normalize_mindmap_node(s, depth=depth + 1, index=s_idx, parent_color=color)
            )

    res: dict[str, Any] = {
        "name": name,
        "subbranches": subbranches,
    }
    if color:
        res["color"] = color
    if order is not None:
        res["order"] = order
    if icon:
        res["icon"] = icon
    if annotation:
        res["annotation"] = annotation
    return res


def extract_mindmap(content: str) -> dict[str, Any] | None:
    """Parse e normalização estrutural do JSON de árvore do mapa mental."""
    match = re.search(
        re.escape(MINDMAP_OPEN) + r"([\s\S]*?)" + re.escape(MINDMAP_CLOSE),
        content,
    )
    candidate = None
    if match:
        candidate = match.group(1).strip()
    else:
        # Fallback: procura um bloco json contendo 'subbranches' ou 'name'
        blocks = re.findall(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", content)
        for b in blocks:
            if "subbranches" in b:
                candidate = b.strip()
                break
    if candidate:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict) and "name" in parsed:
                return _normalize_mindmap_node(parsed, depth=0)
        except (json.JSONDecodeError, ValueError):
            logger.warning("[llm] falha ao parsear mindmap json do bloco")
    return None


def _strip_marker_block(content: str) -> str:
    """Remove os blocos estruturados (action items, icon, mindmap) do corpo do markdown."""
    content = re.sub(
        re.escape(ACTION_ITEMS_OPEN) + r"[\s\S]*?" + re.escape(ACTION_ITEMS_CLOSE),
        "",
        content,
    )
    content = re.sub(
        re.escape(ICON_OPEN) + r"[\s\S]*?" + re.escape(ICON_CLOSE),
        "",
        content,
    )
    content = re.sub(
        re.escape(MINDMAP_OPEN) + r"[\s\S]*?" + re.escape(MINDMAP_CLOSE),
        "",
        content,
    )
    # Remove eventuais blocos de código JSON residuais no final
    content = re.sub(r"```(?:json)?\s*\{[\s\S]*?\}\s*```\s*$", "", content)
    return content.strip()


async def _fetch_pricing(model: str) -> tuple[float, float] | None:
    """Best-effort per-token USD pricing from OpenRouter /models, cached forever."""
    async with _pricing_lock:
        if model in _pricing_cache:
            return _pricing_cache[model]
    s = get_settings()
    if not is_real_secret(s.openrouter_api_key):
        return None
    url = f"{s.openrouter_base_url}/models"
    headers = {"Authorization": f"Bearer {s.openrouter_api_key}"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            for item in resp.json().get("data", []):
                if item.get("id") == model:
                    pricing = item.get("pricing", {}) or {}
                    prompt = float(pricing.get("prompt") or 0)
                    completion = float(pricing.get("completion") or 0)
                    if prompt <= 0 and completion <= 0:
                        return None
                    async with _pricing_lock:
                        _pricing_cache[model] = (prompt, completion)
                    return (prompt, completion)
    except (httpx.HTTPError, ValueError, KeyError):
        logger.debug("[llm] nao foi possivel obter precos do modelo %s", model)
    return None


def _estimate_cost(usage: dict | None, model: str) -> float | None:
    if not usage:
        return None
    cost = usage.get("cost")
    if isinstance(cost, (int, float)) and cost:
        return round(float(cost), 6)
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    if prompt_tokens <= 0 and completion_tokens <= 0:
        return None
    pricing = None
    try:
        pricing = _pricing_cache.get(model)
    except Exception:  # noqa: BLE001
        pricing = None
    if pricing:
        prompt_rate, completion_rate = pricing
    else:
        prompt_rate, completion_rate = FALLBACK_PROMPT_RATE, FALLBACK_COMPLETION_RATE
        logger.debug("[llm] custo estimado com tarifas genericas para %s", model)
    return round(prompt_tokens * prompt_rate + completion_tokens * completion_rate, 6)


async def _call_llm(
    system_prompt: str,
    user_prompt: str,
    *,
    retries: int | None = None,
) -> tuple[str, dict]:
    """One LLM request with exponential backoff on timeout/429/5xx (Universal OpenAI-compatible API)."""
    s = get_settings()
    cfg = s.get_effective_llm_config()
    provider = cfg["provider"]
    api_key = cfg["api_key"]
    model_name = cfg["model"]
    base_url = cfg["base_url"]

    if provider != "custom" and not is_real_secret(api_key):
        raise _ReadableLLMError(
            f"Chave de API para o provedor '{provider}' não configurada (ou placeholder). Configure em Configurações (menu) ou em backend/.env."
        )
    max_retries = s.llm_max_retries if retries is None else retries
    base_delay = s.llm_retry_base_delay
    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "openrouter":
        headers["HTTP-Referer"] = "https://github.com/hinoter/hinoter-lite"
        headers["X-Title"] = "HiNoter-Lite"

    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 8192,
        "stream": False,
    }
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=180) as client:
                resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (429, 500, 502, 503, 504):
                last_exc = httpx.HTTPStatusError(f"HTTP {resp.status_code}", request=resp.request, response=resp)
            else:
                resp.raise_for_status()
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                if content is None:
                    # Some reasoning models return content in one of several fields.
                    content = data["choices"][0]["message"].get("content") or ""
                if not content:
                    raise RuntimeError("Resposta vazia do modelo de IA.")
                usage = data.get("usage") or {}
                total_tokens = int(usage.get("total_tokens") or 0)
                cost = _estimate_cost(usage, model_name)
                logger.info(
                    "[llm] ok (%s / %s - tentativa %d): %d tokens totais, custo estimado=%s",
                    provider,
                    model_name,
                    attempt + 1,
                    total_tokens,
                    cost,
                )
                return content, usage
        except (httpx.HTTPError, RuntimeError, KeyError) as exc:
            last_exc = exc
        if attempt < max_retries:
            delay = base_delay * (2 ** attempt)
            logger.warning("[llm] falha (tentativa %d/%d): %s. Retentando em %.1fs", attempt + 1, max_retries + 1, last_exc, delay)
            await asyncio.sleep(delay)
    raise _ReadableLLMError(last_exc)


class _ReadableLLMError(RuntimeError):
    def __str__(self) -> str:
        if not self.args:
            return "Falha ao chamar o modelo de IA (sem detalhes)."
        exc = self.args[0]
        if isinstance(exc, httpx.HTTPStatusError):
            code = exc.response.status_code
            try:
                err_data = exc.response.json()
                err_msg = err_data.get("error", {}).get("message") or err_data.get("message")
                if err_msg:
                    return f"Falha na API da IA (HTTP {code}: {err_msg})."
            except Exception:
                pass
            return f"Falha na chamada à IA (HTTP {code}). Verifique a chave da API e o saldo."
        detail = str(exc)
        return f"Falha na chamada à IA ({detail[:160]})."


async def summarize_transcript(
    text: str,
    segments: list[dict],
    style: str = "ABSTRACT",
    context_docs: list[dict] | None = None,
    additional_instructions: str | None = None,
) -> dict[str, Any]:
    """Full summarization pipeline. Returns {summary_markdown, action_items, icon, mindmap, mindmap_json, llm_cost_usd, total_tokens}."""
    s = get_settings()
    total_limit = s.llm_chunk_token_limit
    chunks = _chunk_segments(segments, total_limit)
    selected_system_template = STYLE_PROMPTS.get(style.upper(), SYSTEM_ABSTRACT)
    system_prompt = selected_system_template.format(
        open=ACTION_ITEMS_OPEN,
        close=ACTION_ITEMS_CLOSE,
        icon_open=ICON_OPEN,
        icon_close=ICON_CLOSE,
        mindmap_open=MINDMAP_OPEN,
        mindmap_close=MINDMAP_CLOSE,
    )
    context_block = format_context_documents(context_docs)

    prompt_sections = []
    if context_block:
        prompt_sections.append(context_block)
    if additional_instructions and additional_instructions.strip():
        prompt_sections.append(
            f"<user_custom_instructions>\nOBSERVAÇÕES E INSTRUÇÕES ESPECÍFICAS DO USUÁRIO PARA ESTE RESUMO:\n{additional_instructions.strip()}\n</user_custom_instructions>"
        )

    if len(chunks) <= 1:
        prompt_sections.append(f"TRANSCRIÇÃO DO ÁUDIO:\n\n{text}")
        user_prompt = "\n\n".join(prompt_sections)
        content, usage = await _call_llm(system_prompt, user_prompt)
        body = _strip_marker_block(content)
        items = extract_action_items(content)
        icon = extract_icon(content)
        mindmap = extract_mindmap(content)
        mindmap_json = json.dumps(mindmap, ensure_ascii=False) if mindmap else None
        cost = _estimate_cost(usage, s.openrouter_model)
        return {
            "summary_markdown": body,
            "action_items": items,
            "icon": icon,
            "mindmap": mindmap,
            "mindmap_json": mindmap_json,
            "llm_cost_usd": cost,
            "total_tokens": int(usage.get("total_tokens") or 0),
        }

    logger.info("[llm] transcricao longa: %d blocos de resumo parcial (estilo=%s)", len(chunks), style)
    partial = []
    for idx, chunk in enumerate(chunks, start=1):
        chunk_text = _segments_to_text(chunk)
        chunk_input = f"Trecho {idx}/{len(chunks)}:\n\n{chunk_text}"
        if idx == 1 and context_block:
            chunk_input = f"{context_block}\n\n{chunk_input}"
        content, usage = await _call_llm(SYSTEM_CHUNK, chunk_input)
        logger.info("[llm] resumo parcial %d/%d gerado", idx, len(chunks))
        partial.append(content.strip())

    consolidate_input = "\n\n---\n\n".join(
        f"### Resumo parcial {i}/{len(partial)}\n{p}" for i, p in enumerate(partial, start=1)
    )
    prompt_sections.append(f"RESUMOS PARCIAIS DA TRANSCRIÇÃO:\n\n{consolidate_input}")
    consolidate_prompt = "\n\n".join(prompt_sections)

    content, usage = await _call_llm(system_prompt, consolidate_prompt)
    body = _strip_marker_block(content)
    items = extract_action_items(content)
    icon = extract_icon(content)
    mindmap = extract_mindmap(content)
    mindmap_json = json.dumps(mindmap, ensure_ascii=False) if mindmap else None
    cost = _estimate_cost(usage, s.openrouter_model)
    return {
        "summary_markdown": body,
        "action_items": items,
        "icon": icon,
        "mindmap": mindmap,
        "mindmap_json": mindmap_json,
        "llm_cost_usd": cost,
        "total_tokens": int(usage.get("total_tokens") or 0),
    }


def format_materials_for_prompt(docs: list[dict] | None) -> str:
    """Formata materiais de estudo quando a sessão é baseada em materiais com capacidade ampliada."""
    if not docs:
        return ""
    lines = [
        "\n\n<study_materials>",
        "FONTES E MATERIAIS DE ESTUDO FORNECIDOS PELO USUÁRIO (VÍDEOS, ARTIGOS WEB, DOCUMENTOS ESTRUTURADOS, ANOTAÇÕES, FOTOS):",
        "INSTRUÇÕES FUNDAMENTAIS PARA SÍNTESE EXAUSTIVA DE MATERIAIS:",
        "1. Sintetize, estruture e integre todas as fontes fornecidas em um corpo de conhecimento didático, coeso, denso e aprofundado.",
        "2. Identifique e detalhe rigorosamente TODOS os conceitos centrais, definições numeradas, teoremas, metodologias, fórmulas em LaTeX, tabelas e exemplos numéricos resolvidos.",
        "3. Mantenha 100% de fidelidade factual aos materiais fornecidos, cobrindo integralmente todas as seções e unidades.",
    ]
    for i, doc in enumerate(docs, 1):
        name = doc.get("filename") or f"Material {i}"
        dtype = str(doc.get("doc_type") or "material").upper()
        content = (doc.get("content_text") or "").strip()
        if content:
            lines.append(f"\n--- [Fonte {i}: {name} ({dtype})] ---\n{content[:60000]}")
    lines.append("</study_materials>\n")
    return "\n".join(lines)


async def summarize_materials(
    materials_docs: list[dict],
    style: str = "ABSTRACT",
    title: str | None = None,
    additional_instructions: str | None = None,
) -> dict[str, Any]:
    """Gera síntese analítica exaustiva, tarefas, emoji e mapa mental para uma sessão baseada em materiais."""
    s = get_settings()
    materials_block = format_materials_for_prompt(materials_docs)
    selected_system_template = STYLE_PROMPTS.get(style.upper(), SYSTEM_ABSTRACT)
    system_prompt = selected_system_template.format(
        open=ACTION_ITEMS_OPEN,
        close=ACTION_ITEMS_CLOSE,
        icon_open=ICON_OPEN,
        icon_close=ICON_CLOSE,
        mindmap_open=MINDMAP_OPEN,
        mindmap_close=MINDMAP_CLOSE,
    )

    custom_block = ""
    if additional_instructions and additional_instructions.strip():
        custom_block = f"\n\n<user_custom_instructions>\nOBSERVAÇÕES E INSTRUÇÕES ESPECÍFICAS DO USUÁRIO PARA ESTE RESUMO:\n{additional_instructions.strip()}\n</user_custom_instructions>"

    user_prompt = (
        f"TÍTULO DO ESTUDO: {title or 'Síntese de Materiais'}\n\n"
        f"{materials_block}{custom_block}\n\n"
        "Por favor, elabore a síntese analítica COMPLETA, EXAUSTIVA e APROFUNDADA integrando integralmente todas as definições, teoremas, fórmulas em LaTeX e exemplos resolvidos passo a passo de todas as fontes fornecidas acima."
    )
    content, usage = await _call_llm(system_prompt, user_prompt)
    body = _strip_marker_block(content)
    items = extract_action_items(content)
    icon = extract_icon(content)
    mindmap = extract_mindmap(content)
    mindmap_json = json.dumps(mindmap, ensure_ascii=False) if mindmap else None
    cfg = s.get_effective_llm_config()
    cost = _estimate_cost(usage, cfg["model"])
    return {
        "summary_markdown": body,
        "action_items": items,
        "icon": icon,
        "mindmap": mindmap,
        "mindmap_json": mindmap_json,
        "llm_cost_usd": cost,
        "total_tokens": int(usage.get("total_tokens") or 0),
    }


SYSTEM_MINDMAP_STANDALONE = """Você é um especialista em síntese visual e criação de Mapas Mentais Radiais e Orgânicos (metodologia Buzan).
Analise o conteúdo fornecido e elabore uma estrutura de Mapa Mental balanceada em torno de um tema central, com 4 a 8 ramos principais distribuídos radialmente, contendo verbos de ação/palavras-chave, ícones, cores, ordem sequencial (1 a N) e anotações explicativas.

Responda exclusivamente com um objeto JSON válido no formato exato:
{
  "name": "Tema Central da Aula/Reunião",
  "icon": "🧠",
  "subbranches": [
    {
      "name": "Defina o assunto / Conceitos Iniciais",
      "icon": "🎯",
      "color": "#f97316",
      "order": 1,
      "annotation": "Delimite o escopo e objetivos centrais",
      "subbranches": [
        { "name": "Conceitos preliminares", "annotation": "Fórmula ou regra chave", "subbranches": [] },
        { "name": "Critérios de aplicação", "subbranches": [] }
      ]
    },
    {
      "name": "Observe os pontos mais importantes",
      "icon": "🔍",
      "color": "#10b981",
      "order": 2,
      "annotation": "Propriedades essenciais e teoremas",
      "subbranches": [
        { "name": "Propriedades operacionais", "subbranches": [] }
      ]
    },
    {
      "name": "Comece a elaborar as resoluções",
      "icon": "📐",
      "color": "#3b82f6",
      "order": 3,
      "annotation": "Passo a passo de resolução e cálculo",
      "subbranches": []
    }
  ]
}
Não inclua explicações ou markdown fora do JSON."""


async def generate_standalone_mindmap(
    text: str,
    context_docs: list[dict] | None = None,
) -> dict[str, Any]:
    """Gera um mapa mental dedicado sob demanda para uma transcrição ou resumo."""
    s = get_settings()
    context_block = format_context_documents(context_docs)
    user_prompt = f"{context_block}\n\nCONTEÚDO:\n\n{text[:12000]}" if context_block else text[:12000]
    content, usage = await _call_llm(SYSTEM_MINDMAP_STANDALONE, user_prompt)
    mindmap = extract_mindmap(content)
    if not mindmap:
        # fallback: tenta extrair json cru
        try:
            mindmap = json.loads(content.strip())
        except Exception:
            mindmap = {"name": "Conteúdo", "subbranches": [{"name": "Síntese", "subbranches": []}]}
    mindmap_json = json.dumps(mindmap, ensure_ascii=False)
    cost = _estimate_cost(usage, s.openrouter_model)
    return {
        "mindmap": mindmap,
        "mindmap_json": mindmap_json,
        "llm_cost_usd": cost,
    }


async def chat_with_recording_context(
    messages: list[dict[str, str]],
    title: str,
    summary_markdown: str | None,
    raw_transcript: str | None,
    context_docs: list[dict] | None = None,
    action_items: list[str] | None = None,
) -> dict[str, Any]:
    """Conversa interativa com a IA tendo todo o contexto da gravação."""
    s = get_settings()
    cfg = s.get_effective_llm_config()
    provider = cfg["provider"]
    api_key = cfg["api_key"]
    model_name = cfg["model"]
    base_url = cfg["base_url"]

    if provider != "custom" and not is_real_secret(api_key):
        raise _ReadableLLMError(
            f"Chave de API para o provedor '{provider}' não configurada (ou placeholder). Configure em Configurações (menu) ou em backend/.env."
        )

    context_block = format_context_documents(context_docs)
    actions_text = "\n".join(f"- {a}" for a in (action_items or [])) if action_items else "Nenhuma tarefa listada."
    summary_text = (summary_markdown or "").strip() or "Nenhum resumo gerado ainda."
    transcript_snippet = (raw_transcript or "").strip()[:14000]

    system_instruction = f"""Você é o Tutor e Assistente de IA Especialista dedicado exclusivamente a esta gravação: "{title}".
Você tem acesso ao resumo analítico, materiais e documentos de apoio e à transcrição do áudio ministrado.

SEUS OBJETIVOS E DIRETRIZES:
1. Responda a dúvidas dos usuários com clareza, rigor conceitual e didática.
2. Aprofunde tópicos específicos, explique termos difíceis, deduza passos de fórmulas ou crie analogias simples.
3. Se solicitado, crie perguntas de fixação / simulado estilo teste ou flashcard sobre o assunto tratado.
4. Mantenha fidelidade factual ao conteúdo da gravação e aos anexos fornecidos.
5. Responda em português do Brasil, usando Markdown bem estruturado (listas, negrito, blocos de código).

---
### CONTEXTO DA GRAVAÇÃO:
- **Título**: {title}

#### RESUMO DA GRAVAÇÃO:
{summary_text}

#### ITENS DE AÇÃO E DELIBERAÇÕES:
{actions_text}

{context_block}

#### TRECHO DA TRANSCRIÇÃO ORIGINAL:
{transcript_snippet}
---"""

    llm_messages = [{"role": "system", "content": system_instruction}]
    for m in messages:
        role = m.get("role", "user")
        if role in ("user", "assistant"):
            llm_messages.append({"role": role, "content": m.get("content", "")})

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "openrouter":
        headers["HTTP-Referer"] = "https://github.com/hinoter/hinoter-lite"
        headers["X-Title"] = "HiNoter-Lite"

    payload = {
        "model": model_name,
        "messages": llm_messages,
        "temperature": 0.3,
        "max_tokens": 3000,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"].get("content") or ""
            usage = data.get("usage") or {}
            cost = _estimate_cost(usage, model_name)
            return {
                "reply": reply.strip(),
                "llm_cost_usd": cost,
                "total_tokens": int(usage.get("total_tokens") or 0),
            }
    except Exception as exc:
        raise _ReadableLLMError(exc)