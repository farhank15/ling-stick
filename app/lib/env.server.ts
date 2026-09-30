import fs from "node:fs";
import path from "node:path";

// Loader .env ringan (tanpa dependency) — jalan untuk `npm run dev` maupun `npm start`.
// Nilai process.env yang sudah ada selalu menang.
function loadDotEnv(file = ".env") {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function str(key: string, fallback = ""): string {
  return process.env[key]?.trim() || fallback;
}

function int(key: string, fallback: number): number {
  const n = Number.parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  APP_PASSWORD: str("APP_PASSWORD"),
  DATABASE_URL: str("DATABASE_URL", "file:./data/app.db"),
  // LLM utama: Groq (cepat) → fallback Poolside
  GROQ_API_KEY: str("GROQ_API_KEY"),
  GROQ_BASE_URL: str("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
  GROQ_MODEL: str("GROQ_MODEL", "openai/gpt-oss-120b"),
  POOLSIDE_API_KEY: str("POOLSIDE_API_KEY"),
  POOLSIDE_BASE_URL: str("POOLSIDE_BASE_URL", "https://inference.poolside.ai/v1"),
  POOLSIDE_MODEL: str("POOLSIDE_MODEL"),
  LARA_ACCESS_KEY_ID: str("LARA_ACCESS_KEY_ID"),
  LARA_ACCESS_KEY_SECRET: str("LARA_ACCESS_KEY_SECRET"),
  LARA_MONTHLY_CHAR_LIMIT: int("LARA_MONTHLY_CHAR_LIMIT", 10000),
  NEW_CARDS_PER_DAY: int("NEW_CARDS_PER_DAY", 8),
  DAILY_QUIZ_SIZE: int("DAILY_QUIZ_SIZE", 20),
  DAILY_LLM_CALL_LIMIT: int("DAILY_LLM_CALL_LIMIT", 200),
  SESSION_TTL_DAYS: int("SESSION_TTL_DAYS", 30),
};

export function resolveDbPath(databaseUrl: string): string {
  const raw = databaseUrl.replace(/^file:/, "");
  const p = path.resolve(process.cwd(), raw);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}
