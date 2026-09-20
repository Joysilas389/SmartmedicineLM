# SmartMedicineLM

An AI medical educator, not a chatbot. SmartMedicineLM teaches medicine from first principles (problem → mechanism → patient → investigations → treatment → differentials → USMLE reasoning → active recall), grounds its answers in **your own documents** with page-level citations, and turns lessons into spaced-repetition flashcards.

Built from the *SmartMedicineLM Engineering Specification* (83 sections). This repository is **Phase 1 (MVP)**.

## What works now

- **Teaching engine**: a controller that detects how you asked (short question, "from absolute zero", "2-minute review", "test me", image) and assembles composable policy modules instead of one giant prompt. Depth: Quick / Standard / Deep / Full.
- **Claude-style workspace**: collapsible sidebar (off-canvas on phones), chat history with search, favourites, archive, rename, export to Markdown, streaming answers with a stop button.
- **Rich lessons**: rendered causal chains, Mermaid diagrams (validated and auto-repaired, colour-coded red = pathology, purple = mechanism, amber = compensation, green = normal), memory/high-yield/clinical callouts, inline flashcard decks.
- **Library**: upload PDF, DOCX, TXT, Markdown, CSV and images. PDFs are rebuilt layout-aware, split into heading-aware semantic chunks, topic-tagged, and indexed for retrieval (BM25 + medical synonyms).
- **Knowledge modes**: *My library* (source-locked: refuses rather than guesses), *Hybrid*, *General*.
- **Citations**: `[S1]` tags open the exact page in the built-in PDF viewer.
- **PDF viewer**: thumbnails, zoom, fit-width, in-document search, and page actions: *Explain this page*, *Teach this section*, *Generate questions*, *Create flashcards*.
- **Flashcards**: SM-2 spaced repetition with a due-count badge.
- **Learn**: system-by-system topic launcher.
- **Model-agnostic**: Anthropic (Claude), any OpenAI-compatible API (OpenAI, Groq, OpenRouter, Ollama, vLLM…), or **demo mode** when no key is set, so a fresh deployment always works.
- **Responsive**: tested at 390 px (phone) and 1366 px (desktop), light and dark themes, reduced-motion support.

Phase 1 is **local-first**: chats, documents and flashcards live in the browser's IndexedDB. No database is required to deploy. The PostgreSQL + pgvector schema for the server phase is in `database/`.

## Quick deploy

1. Push this folder to GitHub (see [docs/DEPLOY.md](docs/DEPLOY.md) for Termux step-by-step).
2. On [vercel.com](https://vercel.com) → **Add New… → Project** → import the repository → **Deploy**. No settings to change: there is no build step.
3. Add an API key under **Settings → Environment Variables**, then **Redeploy**:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Use Claude (recommended) |
| `ANTHROPIC_MODEL` | Optional, defaults to `claude-sonnet-5` |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | Any OpenAI-compatible service instead |
| `OPENAI_VISION` | `true` if that model accepts images |
| `MODEL_PROVIDER` | Force `anthropic`, `openai` or `demo` |
| `APP_ACCESS_CODE` | Optional password so strangers cannot spend your API credit |

Without a key the app runs in demo mode and explains how to connect a model.

## Project layout

```
api/              Vercel edge functions: /api/chat (streaming), /api/models, /api/health
ai/providers/     ModelProvider abstraction: anthropic, openai-compatible, demo
ai/teacher/       Teaching policy modules + controller (intent, mode, depth, sources)
frontend/         Static Bootstrap 5 app (served as-is)
  js/             app (router), chat, render, library, ingestion, retrieval, viewer,
                  flashcards, learn, settings, validators, store (IndexedDB), state, ui
  css/app.css     Design system (light/dark, responsive)
database/         PostgreSQL + pgvector schema and migrations (Phase 2+)
docs/             Deployment, architecture, roadmap
tests/            node --test suite for the teaching controller and providers
```

## Local development

```bash
npm test          # runs the controller/provider tests (Node 18+)
npx vercel dev    # serves frontend + /api locally on http://localhost:3000
```

## Safety

SmartMedicineLM is an educational tool. It can be wrong and it does not replace clinical judgement. Only upload material you own or are licensed to use.

---
© Joysilas389 · joysilas389@gmail.com
