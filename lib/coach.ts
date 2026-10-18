import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { sql } from "./db";
import { buildSnapshot, renderSnapshot } from "./context";

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// Server-side refusal fallback: if the model declines for policy reasons the
// API retries on Anthropic's recommended fallback model within the same call.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
};

const COACH_SYSTEM = `You are an experienced endurance and strength coach acting as the personal trainer of one athlete. You have access to their Strava training history and WHOOP recovery, sleep and strain data, summarised below.

How you coach:
- Ground every recommendation in the athlete's actual data: today's recovery, HRV and resting HR versus their own baseline, recent sleep, the last days' sessions and the training-load trend. Cite the specific numbers that drove your decision.
- Respect physiology: hard days hard, easy days easy. Avoid stacking intense sessions back-to-back, and keep week-over-week load increases moderate (roughly ≤10-15%) unless the athlete is returning from a planned break.
- Recovery guides intensity: WHOOP green (≥67%) supports quality work if the plan calls for it; yellow (34-66%) favours aerobic or technique work, or a reduced-volume quality session; red (≤33%) means rest, mobility or very easy movement. Downgrade further when HRV is clearly below baseline, resting HR is elevated, or sleep was short for several nights.
- Fit the athlete's goals, sports, available time, constraints and preferences. If something important is missing (goals, available time, injuries), still give a sensible recommendation and briefly say what information would improve it.
- Distinguish measured data (from Strava/WHOOP) from the app's calculated estimates (training load, fitness, fatigue, form).
- Prescribe concretely: sport, duration, intensity (HR zones, RPE, pace or power where the data allows) and a warm-up / main set / cool-down structure.
- You are not a doctor. If the data or the athlete's words suggest illness, injury or overtraining, recommend rest and, where appropriate, seeing a professional.`;

export const PlanSchema = z.object({
  mode: z.enum([
    "rest",
    "active_recovery",
    "easy_endurance",
    "long_endurance",
    "tempo",
    "threshold",
    "vo2max",
    "strength",
    "mobility",
  ]),
  readiness: z.enum(["green", "yellow", "red"]),
  headline: z.string().describe("One short line for a phone notification, max ~90 characters"),
  summary: z.string().describe("2-3 sentences: what to do today and why"),
  workout: z.object({
    sport: z.string(),
    duration_min: z.number(),
    intensity: z.string().describe("Target zones / RPE / pace / power"),
    structure: z.array(z.string()).describe("Ordered steps: warm-up, main set, cool-down"),
  }),
  alternatives: z.array(z.string()).describe("1-3 alternatives if the athlete feels better/worse or is short on time"),
  rationale: z.array(z.string()).describe("Data points that drove the decision"),
  recovery_tips: z.array(z.string()),
});

export type Plan = z.infer<typeof PlanSchema>;

export class CoachRefusalError extends Error {}

export async function generateDailyPlan(): Promise<{ day: string; plan: Plan }> {
  const snapshot = await buildSnapshot();
  const response = await client.beta.messages.parse({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(PlanSchema) },
    system: [
      { type: "text", text: COACH_SYSTEM },
      { type: "text", text: `# Athlete data\n\n${renderSnapshot(snapshot)}` },
    ],
    messages: [
      {
        role: "user",
        content:
          "Write today's training recommendation. Pick the single best training mode for today, then prescribe the session.",
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new CoachRefusalError("The coach declined to generate a plan.");
  if (!response.parsed_output) throw new Error(`Plan generation failed (stop_reason=${response.stop_reason})`);

  const plan = response.parsed_output;
  await sql`
    INSERT INTO daily_plans (day, plan) VALUES (${snapshot.today}, ${sql.json(plan as never)})
    ON CONFLICT (day) DO UPDATE SET plan = EXCLUDED.plan, created_at = now()`;
  return { day: snapshot.today, plan };
}

export async function getPlan(day: string): Promise<Plan | null> {
  const rows = await sql<{ plan: Plan }[]>`SELECT plan FROM daily_plans WHERE day = ${day}`;
  return rows[0]?.plan ?? null;
}

export async function getThread(threadId: string) {
  return sql<{ role: "user" | "assistant"; content: string; created_at: Date }[]>`
    SELECT role, content, created_at FROM chat_messages WHERE thread_id = ${threadId} ORDER BY id`;
}

/**
 * Streams the coach's reply to `userMessage` as plain text chunks and stores
 * both sides of the exchange once the reply completes.
 */
export async function streamChat(threadId: string, userMessage: string): Promise<ReadableStream<Uint8Array>> {
  const [snapshot, history] = await Promise.all([buildSnapshot(), getThread(threadId)]);
  const todaysPlan = await getPlan(snapshot.today);

  await sql`INSERT INTO chat_messages (thread_id, role, content) VALUES (${threadId}, 'user', ${userMessage})`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const dataBlock =
    `# Athlete data\n\n${renderSnapshot(snapshot)}` +
    (todaysPlan ? `\n\n## Today's plan already sent to the athlete\n${JSON.stringify(todaysPlan)}` : "");

  const stream = client.beta.messages.stream({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    cache_control: { type: "ephemeral" },
    system: [
      {
        type: "text",
        text:
          COACH_SYSTEM +
          "\n\nYou are chatting with the athlete in a mobile app. Keep answers focused and skimmable: short paragraphs, bullet points for workouts, no long preambles. Begin your visible answer promptly.",
      },
      { type: "text", text: dataBlock },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n_I can't help with that request._";
          full += note;
          controller.enqueue(encoder.encode(note));
        }
      } catch (err) {
        const note =
          err instanceof Anthropic.RateLimitError
            ? "\n\n_The coach is busy right now (rate limited). Try again in a minute._"
            : err instanceof Anthropic.APIError
              ? `\n\n_Coach error (${err.status ?? "network"}). Please try again._`
              : "\n\n_Something went wrong. Please try again._";
        console.error("chat stream failed", err);
        full += note;
        controller.enqueue(encoder.encode(note));
      } finally {
        if (full.trim()) {
          await sql`INSERT INTO chat_messages (thread_id, role, content) VALUES (${threadId}, 'assistant', ${full})`;
        }
        controller.close();
      }
    },
  });
}
