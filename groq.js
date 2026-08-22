// ---------------------------------------------------------------------------
// Groq call — same system prompt design as the browser FAQ assistant:
// answer only from retrieved KB excerpts, synthesize across all of them.
// ---------------------------------------------------------------------------

async function askGroq({ question, matches, apiKey, model }) {
  const context = matches.length
    ? matches.map((m, i) => `[${i + 1}] Q: ${m.question}\nA: ${m.answer}`).join("\n\n")
    : "No relevant entries were found in the knowledge base.";

  const systemPrompt = `You are the FAQ assistant for Kalaza Care, a senior living, at-home care, and medical recovery facility. You are answering questions over WhatsApp. Answer the user's question using ONLY the knowledge base excerpts provided below, which have been retrieved from the full knowledge base as the entries most relevant to this question.
Rules:
- Read through ALL of the excerpts below before answering, not just the first one — they may each cover a different piece of the answer (e.g. separate excerpts for shared-room pricing, single-room pricing, palliative pricing, and discounts all together answer a general question about "cost").
- Synthesize every excerpt that is relevant into one complete, well-organized answer. Do not ignore relevant excerpts just because an earlier one already partly answered the question.
- If the question is broad (e.g. "what is the cost?", "what do you offer?"), cover all the relevant angles found in the excerpts rather than picking just one.
- Give a clear, warm, concise answer in your own words. Keep it readable on a phone screen — short paragraphs or a simple dashed list, no markdown headers or tables.
- If none of the excerpts actually answer the question, say you don't have that information in the knowledge base and suggest the user contact Kalaza Care directly. Do not make anything up or answer from general knowledge.
- Do not mention "excerpts", "context", "knowledge base", or that you are an AI model; just answer naturally as Kalaza Care's assistant.

Knowledge base excerpts (most relevant to this question, in order):
${context}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "qwen/qwen3.6-27b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    let detail = errBody;
    try {
      detail = JSON.parse(errBody).error?.message || errBody;
    } catch (e) {
      /* keep raw body */
    }
    throw new Error(`Groq API error (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response.");
  return content.trim();
}

module.exports = { askGroq };
