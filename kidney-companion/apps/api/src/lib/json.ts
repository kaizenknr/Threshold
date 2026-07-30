/**
 * Best-effort extraction of a single JSON object from an LLM text response:
 * strips ``` fences and slices from the first "{" to the last "}".
 */
export function safeParseJson(text: string): unknown {
  let t = text.trim();
  // Remove code fences if present.
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(t.slice(start, end + 1));
}
