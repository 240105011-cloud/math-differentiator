# Report: AI Prompts and Differentiation

**Core problem.** A rectangle has a given area and a given fence length; find its dimensions. It is foundational, can be solved by guess-and-check or by a quadratic, and extends naturally to optimisation.

**Architecture.** JavaScript generates the numbers (integer solutions, verified), checks answers, and sends the verified facts to a serverless function. The function builds a level-specific system prompt and calls the Claude API; the key stays in an environment variable. This split guarantees mathematical correctness: the model never decides what the right answer is.

**Prompt design.** Every call uses a shared base prompt (plain-text maths, use only the verified facts) plus a level block and an action block (task, hint, check, solution).

- *Level 1 Foundation:* "Use very simple everyday context, short sentences, define key words, break the work into small guided steps, hints are direct and concrete, no quadratic formula needed." The task returns 3–4 guided sub-questions.
- *Level 2 Standard:* "Expect the learner to set up w + l = P/2, substitute, and solve a quadratic. Hints are Socratic: ask a guiding question and name the method, but do not do the step."
- *Level 3 Advanced:* "Real-world, multi-step; two valid designs exist; add a maximum-area extension; hints are strategic nudges only."

**Action prompts.** *Hint* (n of 3): gentlest to strongest but never the final answer, tailored to the learner's current input, ≤70 words. *Check:* receives the app's authoritative verdict and a diagnostic (e.g. "sum 14, needed 12"); if wrong it must not reveal the answer and gives one next step. *Solution:* numbered steps with verification, adapted to the level.

**How differentiation is achieved.** Differentiation changes four things at once: (1) the numbers and complexity (small integers → larger values → a one-sided fence with two solutions); (2) the scaffolding (guided steps → checkpoints → none); (3) the hint style (direct → Socratic → strategic); (4) the extension (none → none → optimisation). The learning goal is identical at every level.

**Testing.** Level 3 generator was tested on 5,000 random cases: the second design (l/2, 2w) always satisfies both equations and the discriminant is never negative. Fallback content keeps the app usable if the API is unavailable.
