/**
 * An honest quizzer. The state carries the right answer, so a bot that read it
 * would go 10/10 every night and nobody would want it at the table. Instead the
 * index is used only to model KNOWING the answer: one draw from ctx.random per
 * question decides whether this bot happens to know it. When it doesn't, it
 * guesses uniformly among the wrong choices — exactly what a person does.
 */

/** How often each level actually knows the answer. */
const KNOWS: Record<string, number> = { easy: 0.35, normal: 0.6, sharp: 0.85 };

export const knowsOf = (level: string): number => KNOWS[level] ?? KNOWS['normal']!;

/**
 * How long the bot sits on a question before tapping. Answering in the same
 * instant every time reads as a machine, so the wait moves with the seat and
 * the question — 1.8s to 5.6s, well inside the 15 second timer.
 */
export function thinkMs(seat: number, qIdx: number, level: string): number {
  const base = level === 'sharp' ? 1_800 : level === 'normal' ? 2_200 : 2_600;
  return base + ((seat * 7 + qIdx * 13) % 5) * 600;
}

/**
 * The choice to tap. `roll` and `spin` are two draws from ctx.random: the first
 * decides whether the bot knows this one, the second picks which wrong answer
 * it falls for.
 */
export function pickChoice(correct: number, choices: number, knows: number, roll: number, spin: number): number {
  if (roll < knows) return correct;
  const wrong: number[] = [];
  for (let i = 0; i < choices; i++) if (i !== correct) wrong.push(i);
  if (wrong.length === 0) return correct;
  return wrong[Math.min(wrong.length - 1, Math.floor(spin * wrong.length))]!;
}
