// Vercel serverless function. The API key lives ONLY in env variables (GEMINI_API_KEY is free; ANTHROPIC_API_KEY is optional).
// System prompts are kept server-side so the endpoint cannot be used as a free generic proxy.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20; // 20 requests / minute / IP (best effort)
}

const BASE = `You are a friendly, precise maths tutor embedded in a web app about ONE core problem: finding the dimensions of a rectangle from its area and a perimeter-type constraint (this leads to a quadratic equation).
Output rules: plain text only. No markdown, no LaTeX, no asterisks. Write maths with unicode (x², √, ×, ≈).
Correctness rules: the app supplies VERIFIED FACTS. Use only those numbers and never contradict them. Do not invent other numbers.`;

const LEVELS = {
  1: {
    name: "Level 1 - Foundation",
    rules: `Audience: learners who need support. Use very simple everyday context, short sentences, and define key words (perimeter, area) in plain language. Break the work into small guided steps. Hints are direct and concrete; guess-and-check with a table of number pairs is welcome. The quadratic formula is NOT needed: use "two numbers with a given sum and product".`,
  },
  2: {
    name: "Level 2 - Standard",
    rules: `Audience: standard grade-level learners. Use a realistic but compact context. Expect the learner to set up w + l = P/2, substitute to get a quadratic, and solve it by factoring or the quadratic formula. Hints are Socratic: ask a guiding question and name the method, but do not do the step for them.`,
  },
  3: {
    name: "Level 3 - Advanced",
    rules: `Audience: strong learners. The task is a real-world, multi-step challenge with a river on one side, so two different valid designs exist, and there is an optimisation extension (largest possible area). Hints are strategic nudges only (what to define, which equation to substitute, how to think about the discriminant or the vertex), never full steps.`,
  },
};

function factsText(level, f) {
  if (level === 3) {
    return `VERIFIED FACTS: A farmer fences a rectangular field using a straight river as one side (no fence along the river). Fence available F = ${f.F} m. Required area A = ${f.A} m². Let w = each of the two sides perpendicular to the river and l = the side parallel to the river. Equations: 2w + l = ${f.F} and w·l = ${f.A}. Valid designs (w, l): ${f.sols.map((s) => `(${s[0]}, ${s[1]})`).join(" and ")}. Extension: the largest area possible with ${f.F} m of fence is ${f.maxArea} m² (at w = ${f.F / 4}, l = ${f.F / 2}).`;
  }
  return `VERIFIED FACTS: A rectangle has perimeter P = ${f.P} and area A = ${f.A}. With sides w and l: w + l = ${f.P / 2} and w·l = ${f.A}. The sides are ${f.w} and ${f.l}.`;
}

function build(action, level, f, body) {
  const L = LEVELS[level];
  const system = `${BASE}\n\n${L.name}. ${L.rules}\n\n${factsText(level, f)}`;
  const attempt = String(body.attempt || "").slice(0, 300);
  let user;
  if (action === "task") {
    user = `Write the task for this level. Show the numbers exactly as in the verified facts. Do not state the answer.
Return ONLY a JSON object: {"title": short title, "story": 2-4 sentences of context including all given numbers, "question": one clear question, "guide": array of ${level === 1 ? "3 or 4 short guided sub-steps phrased as small questions" : level === 2 ? "0 to 2 brief checkpoints" : "an empty array"}}.`;
  } else if (action === "hint") {
    const n = Math.min(3, Math.max(1, Number(body.hintNumber) || 1));
    user = `The learner asks for hint ${n} of 3 (1 = gentlest, 3 = strongest, but still do NOT give the final answer). Learner's current work: "${attempt || "nothing yet"}". Tailor the hint to this level and to their work. Maximum 70 words.`;
  } else if (action === "check") {
    const v = body.verdict || {};
    user = `The learner submitted: "${attempt}". The app's authoritative verdict: main answer ${v.mainCorrect ? "CORRECT" : "INCORRECT"}${v.extensionCorrect === null || v.extensionCorrect === undefined ? "" : "; extension answer " + (v.extensionCorrect ? "CORRECT" : "INCORRECT")}. Diagnostic: ${String(v.info || "").slice(0, 300)}.
If correct: congratulate in one sentence, then explain in 2-3 sentences why it works${level === 3 ? " and mention the other valid design" : ""}. If incorrect: do NOT reveal the answer; diagnose the most likely mistake using the diagnostic and give one concrete next step. Maximum 90 words.`;
  } else {
    user = `Write a complete worked solution adapted to this level, as numbered steps, ending with a verification that the numbers satisfy both conditions${level === 3 ? ", both valid designs, and the extension" : ""}. Maximum ${level === 1 ? 170 : 150} words.`;
  }
  return { system, user };
}

function num(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw new Error("bad number");
  return n;
}

function cleanFacts(level, f) {
  if (level === 3) {
    return {
      F: num(f.F), A: num(f.A), maxArea: num(f.maxArea),
      sols: (f.sols || []).slice(0, 2).map((s) => [num(s[0]), num(s[1])]),
    };
  }
  return { P: num(f.P), A: num(f.A), w: num(f.w), l: num(f.l) };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "Too many requests, wait a minute." });
  const useGemini = !!process.env.GEMINI_API_KEY;
  if (!useGemini && !process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY (free) or ANTHROPIC_API_KEY." });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const level = [1, 2, 3].includes(body.level) ? body.level : null;
    if (!level || !["task", "hint", "check", "solution"].includes(body.action)) throw new Error("bad request");
    const facts = cleanFacts(level, body.facts || {});
    const { system, user } = build(body.action, level, facts, body);

    let text;
    if (useGemini) {
      // Free option: Google AI Studio key. gemini-flash-latest is an alias to the current Flash model.
      const gm = process.env.GEMINI_MODEL || "gemini-flash-latest";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gm}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: 2500 },
        }),
      });
      if (!r.ok) return res.status(502).json({ error: "AI provider error", status: r.status });
      const data = await r.json();
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      text = parts.map((p) => p.text || "").join("").trim();
    } else {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 900, system, messages: [{ role: "user", content: user }] }),
      });
      if (!r.ok) return res.status(502).json({ error: "AI provider error", status: r.status });
      const data = await r.json();
      text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    }
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(400).json({ error: "Invalid request" });
  }
};
