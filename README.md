# One Problem, Three Paths – AI Math Differentiator

Web app for Topic 8 (AI for Differentiated Learning). One core problem – *find a rectangle's dimensions from its area and fence length* (a quadratic equation) – is adapted by an AI tutor into three levels:

| Level | Context | Support |
|---|---|---|
| 1 Foundation | Garden, small numbers | Guided sub-steps, direct hints, "two numbers with given sum and product" |
| 2 Standard | Plot, grade-level numbers | Set up and solve a quadratic, Socratic hints |
| 3 Advanced | Field beside a river | Two valid designs, maximum-area extension, strategic nudges only |

## How it works
- **Numbers are generated in JavaScript**, so every task has a verified answer. The AI only writes the story, hints, feedback and solution around those facts.
- **Answer checking is done locally**; the AI explains the verdict but cannot overrule it.
- **The API key is never in the browser.** `api/ai.js` is a Vercel serverless function that reads the key from environment variables. System prompts also live on the server.
- If the AI is unreachable, built-in tasks and hints keep the app usable.

## Run / deploy
1. Push this folder to a public GitHub repo.
2. Import it in Vercel (no build settings needed).
3. Add environment variable `GEMINI_API_KEY` (free key from aistudio.google.com). Alternatively use `ANTHROPIC_API_KEY` (paid); optional `GEMINI_MODEL` / `ANTHROPIC_MODEL`.
4. Deploy. Locally: `npm i -g vercel && vercel dev`.

## Files
- `index.html` – UI, task generation, answer checking
- `api/ai.js` – secure AI proxy and level-specific system prompts
- `REPORT.md` – one-page report (prompts and differentiation)
