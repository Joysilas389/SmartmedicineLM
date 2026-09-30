# SmartMedicineLM

An AI medical educator, not a chatbot. SmartMedicineLM teaches medicine from first principles (problem → mechanism → patient → investigations → treatment → differentials → USMLE reasoning → active recall), grounds its answers in **your own documents** with page-level citations, and turns lessons into spaced-repetition flashcards.

Built from the *SmartMedicineLM Engineering Specification* (83 sections). This repository implements **Phases 1, 2 and 3** (spec §71–73), including accounts and semantic vector search.

## What works now

- **Teaching engine**: a controller that detects how you asked (short question, "from absolute zero", "2-minute review", "test me", image) and assembles composable policy modules instead of one giant prompt. Depth: Quick / Standard / Deep / Full.
- **Claude-style workspace**: collapsible sidebar (off-canvas on phones), chat history with search, favourites, archive, rename, export to Markdown, streaming answers with a stop button.
- **Rich lessons**: rendered causal chains, Mermaid diagrams (validated and auto-repaired, colour-coded red = pathology, purple = mechanism, amber = compensation, green = normal), memory/high-yield/clinical callouts, inline flashcard decks.
- **Library**: upload PDF, DOCX, TXT, Markdown, CSV and images. PDFs are rebuilt layout-aware, split into heading-aware semantic chunks, topic-tagged, and indexed for retrieval (BM25 + medical synonyms).
- **Knowledge modes**: *My library* (source-locked: refuses rather than guesses), *Hybrid*, *General*.
- **Citations**: `[S1]` tags open the exact page in the built-in PDF viewer.
- **PDF viewer**: thumbnails, zoom, fit-width, in-document search, and page actions: *Explain this page*, *Teach this section*, *Generate questions*, *Create flashcards*.
- **Flashcard decks**: every card is filed under a basic-science discipline (Anatomy, Physiology, Biochemistry & Genetics, Pathology, Pharmacology, Microbiology, Immunology…) or a clinical specialty (Cardiology, Nephrology, Obstetrics & Gynecology, Pediatrics, Infectious disease…), from its linked concept and its wording, so a large collection stays organised. Review one deck or everything; existing cards are filed automatically the first time you open the page.
- **Flashcards**: FSRS spaced repetition (difficulty, stability, retrievability per card; SM-2 selectable), a live "recall now" estimate for every card and a due-count badge.
- **Learn**: system-by-system topic launcher.
- **Model-agnostic**: Anthropic (Claude), any OpenAI-compatible API (OpenAI, Groq, OpenRouter, Ollama, vLLM…), or **demo mode** when no key is set, so a fresh deployment always works.
- **Responsive**: tested at 390 px (phone) and 1366 px (desktop), light and dark themes, reduced-motion support.

### Phase 2

- **Knowledge graph** (§30): ~340 seeded concepts across 18 systems covering Step 1, Step 2 CK and Step 3 (basic sciences, organ systems, psychiatry, paediatrics, obstetrics & gynecology, surgery & emergency, dermatology, pharmacology, biostatistics, ethics and prevention) with prerequisites and clinical relations (causes, presents with, diagnosed by, treated by, differential of…). Every full lesson returns a hidden structured block that adds new concepts and relations, so the graph grows as you study. Browse it under **Knowledge**, with a map diagram per concept.
- **Prerequisite engine** (§29): before each lesson the app finds the topic's prerequisite chain and, from your learner model, tells the teacher to *teach*, *briefly review* or *skip* each one. The chosen plan is shown above the answer.
- **Learner model** (§28): every concept tracks understanding, recall and application separately, plus confidence calibration, errors by type and review dates. Evidence comes from lesson self-ratings ("How well did this make sense?"), flashcard reviews and question attempts.
- **Question engine** (§26, §51): USMLE-style vignettes by topic, system, weak areas, a document in your library (optionally source-locked) or your saved bank. Tutor mode explains after each question; timed exam mode has a 90 s/question timer, navigation grid, mark-for-review, answer changes and post-test analysis. Options can be eliminated, confidence is recorded, and options are shuffled so the answer position is unbiased. Every question explains why the answer is right, why each distractor is wrong and what finding would make it right, the clues, the mechanism chain and the high-yield point.
- **Error analysis** (§27): each miss is classified into the spec's eight error types (a suggestion is pre-selected from the distractor you chose and your confidence), linked to its prerequisites, and turned into a flashcard automatically.
- **Progress dashboard** (§52–53): overall and per-system mastery split into understanding / recall / application, weakness map (strong, moderate, needs review, critical gap), prerequisite bottlenecks with the chain that explains them, error-type breakdown with advice, and a 7-day review forecast.
- **Study plan** (§54): from exam date, hours per day and an optional first-pass target: phases, need-weighted system rotation, today's tasks with one-tap start, and a weekly plan. It is recomputed from your learner model every time, so it adapts.

### Accounts, sync and semantic search

- **Accounts (optional)**: connect Vercel's Postgres and learners sign in (PBKDF2-hashed passwords, signed HttpOnly session cookies, lock-out after repeated failures, sign out everywhere, account deletion, optional sign-up code). Without a database the app stays single-user.
- **Cross-device sync**: every device keeps a full local copy; changes queue in an outbox and sync in the background (last write wins), including settings. Signing out leaves the device clean; a second person on the same device never sees the first person's data.
- **Semantic search**: passages are embedded in the browser with all-MiniLM-L6-v2 (Web Worker, WebAssembly) and fused with BM25 by reciprocal rank fusion, so "why do my ankles swell" finds a passage about oncotic pressure. No API key; a 23 MB model downloads once. Toggle in Settings.

### Study system

- **Today**: one screen with the day's session in order — due flashcards (interleaved across decks), open mistakes to re-test, 10 mixed questions from weak areas, your weakest concepts to re-learn, and a calculation drill — with an estimated time and your exam countdown.
- **Notebook**: *Mistakes* (missed questions not yet answered correctly, grouped by error type, with one-tap re-tests, plus lessons you rated "lost me"), *Highlights* by ink colour (each can become a fill-in-the-blank card), *Bookmarks* (saved passages with notes), and *Reports*.
- **Practice**: worked calculations with fresh numbers every time (anion gap, Winter's formula, A–a gradient, corrected calcium, osmolality, creatinine clearance, 2×2 tables, NNT) with step-by-step solutions; and image-reading practice on your own library images.
- **Search** across lessons, flashcards, questions, highlights, bookmarks, concepts and library documents.
- **Practice exam scores** (Progress): enter NBME/UWSA results; after three, a line through your own scores relates app mastery to real results, shown with its error.
- **Full-length blocks**: 40 questions, timed at exam pace.
- **Under every answer**: *Explain differently*, *Explain it back* (your explanation is graded), *Listen* (read aloud), *Print summary* (one page), *Report an error* (open reports are checked in future answers on that topic), *From my sources* (dims what is not cited from your documents), *Deeper / Simpler* on each section, and an estimated cost.
- **Knowledge**: *Map it yourself* — rebuild a concept's links from memory, with distractors; *Explain it back*.
- **Clinical rotation** (Settings): lessons add an "On the ward" note for your current rotation.
- **Guideline flags**: management points that commonly change appear in a "Check the current guideline" box.
- **Sharing**: share a flashcard deck or question block as a link; the items travel inside the link, nothing is uploaded.
- **Chat tags**: tag chats and filter with `#tag` in the chat search.
- **Offline**: once visited, flashcards, notebook, practice and saved lessons work without a connection (network-first, so updates are never hidden).

### Prompt coach

As you type or paste, the app works out what you have (a topic, a passage from a book, a question vignette, lab values, a question) and offers the prompts most likely to produce understanding: for a vignette, *walk me through it*, *hint only, no answer*, *next best step* or *mechanism* depending on your exam, *what if one detail changed*; for a passage, *explain in plain language*, *what must I remember*, *what does it assume I know*; for a topic, prompts built from the knowledge graph such as *compare with its classic differential*, *why does it cause its hallmark finding* and *what do I need first*. The lightbulb in the composer opens a categorised library of prompt templates.

Typeface: Source Sans Pro (published today as Source Sans 3), the U.S. Web Design System face used on America.gov, across the whole interface, lessons, diagrams and whiteboard.

### The teaching engine

The master education specification (learner levels, layered architecture, the 80/20 knowledge hierarchy, first-principles derivation, "why" and "why not" reasoning, negative findings, misconceptions and exceptions, analogies with their limits, cross-linking, cognitive-load management, synthesis and retention, evidence honesty and safety) lives in `ai/teacher/pedagogy.js` as composable modules rather than one giant prompt. The controller assembles only what the turn needs:

- **Learner level** (Settings → Teach me as a): beginner, medical student, exam candidate, resident, specialist, or detected from your question.
- **Subject frameworks** switch on from the question itself: ECG (rate → rhythm → axis → intervals → ST/T), imaging, acid–base (pH → primary → compensation → gap → delta), laboratory interpretation, pharmacology (target → mechanism → effect → adverse → contraindications), anatomy, microbiology, physiology-first, pathology, emergency ABCDE, and differential frameworks. At most two per answer.
- **Situational modes**: *compare* ("X vs Y") builds a discriminator table; *case* ("give me a clinical case") withholds the diagnosis and makes you reason; *re-explain* fires on "I don't understand" (or the **Explain differently** button on any answer) and is forbidden from repeating the same explanation.
- **Lean when it should be**: a one-line factual question gets a short brief, not the whole doctrine; a full lesson gets hierarchy, misconceptions, synthesis and a quality self-check.

### Phase 3: images, interactive diagrams, whiteboard

- **Medical image understanding**: when you attach an image, choose ECG, X-ray/CT/MRI, histology, pathology, clinical photo or diagram (or auto-detect). Each type gets a systematic read (e.g. ECG: rate → rhythm → axis → intervals → P → QRS → ST/T → interpretation), then the mechanism behind every finding.
- **Image practice**: "Let me read it first" hides the answer and gives you a checklist; your reading is then graded against the image (what you got right, what you missed, the systematic reading, mechanism, memory anchor, error types).
- **Interactive diagrams**: tap any box in a diagram or step in a causal chain to ask about it; "Test me" hides a chain's steps so you rebuild it from memory. On Knowledge pages, diagram boxes open that concept.
- **Whiteboard**: pen (pressure-sensitive with a stylus), highlighter, arrow, line, box, text, eraser, undo/redo, image backgrounds for annotating ECGs or X-rays, PNG export. **Ask SmartMedicine** sends the drawing to be explained or checked, and **Draw from memory** challenges you to sketch a mechanism and have it graded.

### Where your data lives (no subscription needed)

The browser's IndexedDB is only a fast working copy. The lasting record is an **Excel workbook** you control, with one sheet per kind of data (Flashcards, Progress, Chats, Messages, Questions, Attempts, Documents, Document text, Whiteboards, Settings, Files). Readable columns are for reading in Excel; the `Record` columns hold the exact data so restoring is lossless (long lessons are split over several cells because Excel caps a cell at 32,767 characters).

| How | Where it works | What happens |
|---|---|---|
| **Save / restore a backup** | everywhere, including the hosted site | One tap writes `SmartMedicineLM-<date>.xlsx` to Downloads, originals included. Restore merges (newest wins) or replaces. The sidebar nags when a backup is overdue. |
| **A folder on your computer** | Chrome/Edge on desktop | Pick a folder once; `SmartMedicineLM.xlsx` is kept up to date automatically, the previous copy is kept, and PDFs/images go into `files/`. |
| **Local mode (Termux)** | Android/any computer with Node | `npm run local` serves the app from your device and writes the workbook to your storage (`Internal storage/SmartMedicineLM/`) with 10 hourly backups. Clearing the browser loses nothing: the app reloads from the file. |

You can edit the **Flashcards** sheet in Excel: change a question, answer or concept, or type new cards into empty rows, and they come back when you restore (the review schedule is preserved). Accounts and server sync remain optional extras, not a requirement.

Everything is **local-first**: chats, documents, flashcards, questions and progress live in the browser's IndexedDB. No database is required to deploy. The PostgreSQL + pgvector schema for the server phase is in `database/`.

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
api/              Vercel edge functions: /api/chat (streaming), /api/generate (questions), /api/auth, /api/sync, /api/models, /api/health
ai/providers/     ModelProvider abstraction: anthropic, openai-compatible, demo
ai/teacher/       Teaching policy modules + controller (intent, mode, depth, sources, prerequisites)
ai/tasks/         Structured generation tasks (question writer) + demo items
frontend/         Static Bootstrap 5 app (served as-is)
  js/             app (router), chat, render, library, ingestion, retrieval, viewer,
                  flashcards, learn, settings, validators, store (IndexedDB), state, ui,
                  graph-seed + graph (knowledge graph), learner-model, knowledge-store,
                  srs (FSRS/SM-2), questions + question-parse, progress, study-plan, knowledge,
                  account + sync, embeddings + embed-worker (semantic search), whiteboard
  css/app.css     Design system (light/dark, responsive)
database/         PostgreSQL + pgvector schema and migrations (001 initial, 002 Phase 2, 003 accounts/sync)
docs/             Deployment, architecture, roadmap
tests/            node --test suite: controller, providers, renderer, graph, learner model, FSRS, questions, study plan
```

## Local development

```bash
npm run local     # run the whole app from your own device, saving to an Excel file
npm install && npm test   # full suite; set TEST_DATABASE_URL to also run the account/sync tests against PostgreSQL
npx vercel dev    # serves frontend + /api locally on http://localhost:3000
```

## Safety

SmartMedicineLM is an educational tool. It can be wrong and it does not replace clinical judgement. Only upload material you own or are licensed to use.

---
© Joysilas389 · joysilas389@gmail.com
