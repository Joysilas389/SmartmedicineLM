/*
 * Rough cost of each AI answer, so learners can budget their API credit. It is an ESTIMATE:
 * tokens are approximated from characters (about 4 per token for English), and prices come
 * from Settings (defaults are typical for a Sonnet-class model; check your provider's page).
 */
export const DEFAULT_PRICES = { input: 3, output: 15 }; // US$ per million tokens

export const estimateTokens = (chars) => Math.ceil(Math.max(0, chars) / 4);

/** inputChars: everything sent (prompt, history, sources, ~system); outputChars: the answer. */
export function estimateCost(inputChars, outputChars, prices = DEFAULT_PRICES) {
  const inTok = estimateTokens(inputChars);
  const outTok = estimateTokens(outputChars);
  const usd = (inTok * (prices.input ?? DEFAULT_PRICES.input) + outTok * (prices.output ?? DEFAULT_PRICES.output)) / 1e6;
  return { inTok, outTok, usd };
}

export const SYSTEM_PROMPT_CHARS = 11000; // the teaching brief the server adds (about 9–14k characters)

export function formatUsd(usd) {
  if (usd < 0.01) return '<$0.01';
  return `$${usd < 1 ? usd.toFixed(2) : usd.toFixed(2)}`;
}
