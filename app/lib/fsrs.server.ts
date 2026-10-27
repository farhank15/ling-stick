import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type Grade,
  type RecordLogItem,
} from "ts-fsrs";

/**
 * Wrapper ts-fsrs — BLUEPRINT §5. Semua state kartu disimpan di tabel cards.
 */

/**
 * Scheduler dibuat ulang hanya saat preferensi retensi/interval berubah.
 * matcha:explain dibaca dari tabel settings (bukan env) supaya user bisa
 * mengatur sendiri; cache 60 detik menghindari 1 query per rating.
 */
const CONFIG_TTL_MS = 60_000;
let scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));
let schedulerKey = "0.9|36500";
let configAt = 0;

async function getScheduler() {
  if (Date.now() - configAt > CONFIG_TTL_MS) {
    const { getFsrsSettings } = await import("~/lib/prefs.server");
    const cfg = await getFsrsSettings();
    const key = `${cfg.retention}|${cfg.maxInterval}`;
    if (key !== schedulerKey) {
      scheduler = fsrs(
        generatorParameters({
          request_retention: cfg.retention,
          maximum_interval: cfg.maxInterval,
          enable_fuzz: true,
        }),
      );
      schedulerKey = key;
    }
    configAt = Date.now();
  }
  return scheduler;
}

export type CardRow = {
  itemId: number;
  due: number;
  stability: number | null;
  difficulty: number | null;
  elapsedDays: number | null;
  scheduledDays: number | null;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
  learningSteps: number;
};

function toFsrsCard(row: CardRow): Card {
  if (!row.lastReview || row.reps === 0) {
    return createEmptyCard(new Date(row.due));
    // due menyimpan "kapan kartu ini masuk antrian" untuk kartu baru.
  }
  return {
    due: new Date(row.due),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsed_days: row.elapsedDays ?? 0,
    scheduled_days: row.scheduledDays ?? 0,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as Card["state"],
    last_review: new Date(row.lastReview),
    learning_steps: row.learningSteps,
  };
}

function fromFsrsCard(itemId: number, card: Card): CardRow {
  return {
    itemId,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps ?? 0,
    lapses: card.lapses ?? 0,
    state: card.state as number,
    lastReview: card.last_review ? card.last_review.getTime() : null,
    learningSteps: card.learning_steps ?? 0,
  };
}

/** Jadwal berikutnya untuk 4 rating, tanpa mengubah kartu. */
export async function previewGrades(row: CardRow): Promise<Record<Grade, RecordLogItem>> {
  const s = await getScheduler();
  return s.repeat(toFsrsCard(row), new Date());
}

/** Terapkan rating (1..4) → baris kartu baru + log. */
export async function applyRating(row: CardRow, rating: 1 | 2 | 3 | 4): Promise<CardRow> {
  const s = await getScheduler();
  const result = s.next(toFsrsCard(row), new Date(), rating as Grade);
  return fromFsrsCard(row.itemId, result.card);
}

export function newCardRow(itemId: number, now = Date.now()): CardRow {
  const card = createEmptyCard(now);
  return fromFsrsCard(itemId, card);
}

export const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type RatingValue = (typeof Rating)[keyof typeof Rating];
