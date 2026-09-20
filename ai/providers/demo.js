/**
 * Demo provider: used when no API key is configured, so a fresh deployment
 * still works end to end (UI, library, retrieval, rendering) and explains setup.
 */
const encoder = new TextEncoder();

export function createDemoProvider() {
  function lesson({ messages, meta = {} }) {
    const last = messages[messages.length - 1]?.content || '';
    const sourceLine = meta.sourceCount
      ? `I also found **${meta.sourceCount} relevant passage${meta.sourceCount > 1 ? 's' : ''}** in your library for this question [S1], so retrieval is working.`
      : 'No passages from your library were attached to this question. Upload a PDF in the Library to test retrieval.';
    return `## SmartMedicineLM is running in demo mode

Your deployment works, but no AI model is connected yet, so I can't write a real lesson about *"${last.slice(0, 120)}"*.

The teaching controller classified this request as **${meta.mode || 'standard'}** mode at **${meta.depth || 'standard'}** depth. ${sourceLine}

### Connect a model in about two minutes

1. Open your project on vercel.com and go to **Settings → Environment Variables**.
2. Add **ANTHROPIC_API_KEY** (from console.anthropic.com), or add **OPENAI_API_KEY** with **OPENAI_BASE_URL** and **OPENAI_MODEL** for any OpenAI-compatible service.
3. Go to **Deployments**, open the latest one and choose **Redeploy**.

### What a real answer looks like

Here is how the renderer shows a causal chain:

\`\`\`chain
Loss of nephron function :: fewer working filters
↓ GFR :: less plasma is filtered each minute
↓ phosphate excretion :: phosphate that should leave in urine stays behind
↑ serum phosphate
Phosphate binds calcium :: calcium phosphate forms and deposits
↓ ionized calcium
↑ PTH secretion :: the parathyroid glands sense low calcium and respond
\`\`\`

And a diagram:

\`\`\`mermaid
flowchart TD
  A["Primary abnormality"] --> B["Physiological consequence"]
  B --> C["Compensation"]
  C --> D["Clinical manifestation"]
  class A pathology
  class B mechanism
  class C compensation
  class D normal
\`\`\`

> [!MEMORY]
> Once a model is connected, facts that must be memorised appear in boxes like this one.
`;
  }

  async function stream(args) {
    const text = lesson(args);
    const parts = text.match(/[\s\S]{1,24}/g) || [];
    return new ReadableStream({
      async start(controller) {
        for (const p of parts) {
          controller.enqueue(encoder.encode(p));
          await new Promise((r) => setTimeout(r, 12));
        }
        controller.close();
      },
    });
  }

  return {
    id: 'demo',
    name: 'Demo (no model connected)',
    model: 'none',
    supportsVision: false,
    configured: false,
    stream,
    vision: stream,
    async generate(args) {
      return lesson(args);
    },
    async embed() {
      return [];
    },
  };
}
