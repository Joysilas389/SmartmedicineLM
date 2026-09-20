/*
 * Web Worker that turns text into 384-dimensional sentence embeddings with
 * all-MiniLM-L6-v2 (transformers.js, ONNX in WebAssembly). Runs off the main thread.
 */
let extractor = null;
let loading = null;

function load(config) {
  loading ||= (async () => {
    const T = await import(config.libUrl);
    T.env.allowLocalModels = false;
    if (config.remoteHost) {
      T.env.remoteHost = config.remoteHost;
      T.env.remotePathTemplate = config.remotePathTemplate || '{model}/resolve/{revision}/';
    }
    if (config.wasmPaths) T.env.backends.onnx.wasm.wasmPaths = config.wasmPaths;
    T.env.backends.onnx.wasm.numThreads = 1; // the page is not cross-origin isolated
    extractor = await T.pipeline('feature-extraction', config.model, {
      quantized: true,
      progress_callback: (p) => {
        if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, progress: p.progress });
      },
    });
    self.postMessage({ type: 'ready' });
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

self.onmessage = async (e) => {
  const { id, type, texts, config } = e.data;
  try {
    await load(config);
    if (type !== 'embed') return self.postMessage({ id, ok: true });
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    const dim = out.dims[out.dims.length - 1];
    const vecs = texts.map((_, i) => out.data.slice(i * dim, (i + 1) * dim));
    self.postMessage({ id, vecs }, vecs.map((v) => v.buffer));
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};
