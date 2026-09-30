/*
 * Share links for study groups, with no server: a flashcard deck or a question block is
 * compressed into the link itself (#/import?d=...). Opening the link shows a preview and
 * adds the items to the reader's own library. Nothing is uploaded anywhere.
 */
const VERSION = 1;
const MAX_ITEMS = 120;

const toB64u = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Keeps only the fields worth sharing (no personal review history). */
export function packItems(kind, title, items) {
  const clean =
    kind === 'cards'
      ? items.slice(0, MAX_ITEMS).map((c) => ({ q: c.q, a: c.a, topic: c.topic || '', deck: c.deck || '' }))
      : items.slice(0, MAX_ITEMS).map(({ concept, system, difficulty, stem, options, answer, clues, mechanism, highYield, prerequisites, flashcard, exam }) => ({
          concept, system, difficulty, stem, options, answer, clues, mechanism, highYield, prerequisites, flashcard, exam,
        }));
  return { v: VERSION, kind, title: String(title || '').slice(0, 120), items: clean };
}

export async function encodeShare(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed = typeof CompressionStream === 'function' ? await pipe(json, new CompressionStream('deflate-raw')) : json;
  return `${typeof CompressionStream === 'function' ? 'z' : 'j'}${toB64u(packed)}`;
}

export async function decodeShare(code) {
  if (!code || code.length < 2) throw new Error('This share link is empty.');
  const bytes = fromB64u(code.slice(1));
  const raw = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  const data = JSON.parse(new TextDecoder().decode(raw));
  if (data?.v !== VERSION || !['cards', 'questions'].includes(data.kind) || !Array.isArray(data.items)) throw new Error('This share link is not valid.');
  return data;
}

export const shareUrl = (code, origin = location.origin) => `${origin}/#/import?d=${code}`;
