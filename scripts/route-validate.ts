/**
 * Validasi konten Rute: `npm run route:validate`.
 * Glob content/route, parse + Zod + aturan silang. Exit 1 bila ada error.
 * Dipakai manusia DAN agent lain sebelum merge materi baru.
 */
import { loadAllSteps } from "../app/lib/route.server";

try {
  const steps = loadAllSteps();
  const byLevel = new Map<string, number>();
  for (const { step } of steps) byLevel.set(step.level, (byLevel.get(step.level) ?? 0) + 1);
  console.log(
    `route:validate OK — ${steps.length} step (${[...byLevel.entries()].map(([k, v]) => `${k}:${v}`).join(", ") || "-"})`,
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
