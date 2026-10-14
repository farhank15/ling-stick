import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { routeStepSchema, type RouteStep } from "./route.schema";

/**
 * Loader materi Rute JA dari content/route/{n5,n4,n3}/*.md.
 * Format: frontmatter YAML sederhana (key: value, list "- item", inline
 * {a: 1, b: 2}) + body Markdown (## Penjelasan / ## Contoh / dst — opsional,
 * frontmatter adalah sumber kebenaran). Tanpa lib baru: parser ~60 baris,
 * cukup untuk subset yang ditulis template. Zod yang memvalidasi isi.
 */

const CONTENT_DIR = join(process.cwd(), "content", "route");

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function coerceScalar(s: string): unknown {
  const t = stripQuotes(s.trim());
  if (/^-?\d+$/.test(t)) return Number(t);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null" || t === "~") return null;
  return t;
}

/** Split koma level-atas — hormati {}, [], dan quotes. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function parseInlineList(s: string): unknown[] {
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "");
  return splitTopLevel(inner)
    .map((p) => coerceScalar(p))
    .filter((v) => v !== "" && v !== null);
}

function parseInlineMap(s: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const inner = s.trim().replace(/^\{/, "").replace(/\}$/, "");
  for (const part of splitTopLevel(inner)) {
    const eq = part.indexOf(":");
    if (eq === -1) continue;
    const raw = part.slice(eq + 1).trim();
    out[stripQuotes(part.slice(0, eq))] =
      raw.startsWith("[") && raw.endsWith("]") ? parseInlineList(raw) : coerceScalar(raw);
  }
  return out;
}

type Ctx = { obj: Record<string, unknown>; key: string };

/** Parse subset YAML frontmatter → object. Mendukung: scalar, list "- ", list inline [a, b], map inline {a: b}. */
export function parseFrontmatter(src: string): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const stack: { indent: number; ctx: Ctx; list: unknown[] | null }[] = [];
  const lines = src.split("\n");
  const current = (): Ctx | null => (stack.length ? stack[stack.length - 1]!.ctx : null);

  const pushVal = (ctx: Ctx, val: unknown) => {
    ctx.obj[ctx.key] = val;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    while (stack.length && indent <= stack[stack.length - 1]!.indent) stack.pop();

    if (trimmed.startsWith("- ")) {
      const item = stripQuotes(trimmed.slice(2));
      const top = stack[stack.length - 1];
      if (!top) continue;
      if (item.startsWith("{") && item.endsWith("}")) {
        (top.list ??= []).push(parseInlineMap(item));
        pushVal(top.ctx, top.list);
      } else {
        (top.list ??= []).push(item);
        pushVal(top.ctx, top.list);
      }
      continue;
    }

    const colon = trimmed.indexOf(":");
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    const parent = stack.length ? stack[stack.length - 1]!.ctx.obj : obj;

    if (!rest) {
      // Blok list/map berikut — tentukan saat baris anak datang; default list.
      const ctx: Ctx = { obj: parent as Record<string, unknown>, key };
      (parent as Record<string, unknown>)[key] = [];
      stack.push({ indent, ctx, list: [] });
    } else if (rest.startsWith("{") && rest.endsWith("}")) {
      (parent as Record<string, unknown>)[key] = parseInlineMap(rest);
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      (parent as Record<string, unknown>)[key] = rest
        .slice(1, -1)
        .split(",")
        .map((s) => stripQuotes(s))
        .filter(Boolean);
    } else if (/^-?\d+$/.test(rest)) {
      (parent as Record<string, unknown>)[key] = Number(rest);
    } else {
      (parent as Record<string, unknown>)[key] = stripQuotes(rest);
    }
    void current;
  }
  return obj;
}

export function splitFrontmatter(file: string): { front: Record<string, unknown>; body: string } {
  const m = file.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: file };
  return { front: parseFrontmatter(m[1]!), body: (m[2] ?? "").trim() };
}

export type LoadedStep = { step: RouteStep; file: string };

/** Muat + validasi SEMUA step. Throw dengan daftar error per file. */
export function loadAllSteps(): LoadedStep[] {
  const out: LoadedStep[] = [];
  const errors: string[] = [];
  if (!existsSync(CONTENT_DIR)) return out;
  for (const level of readdirSync(CONTENT_DIR)) {
    const dir = join(CONTENT_DIR, level);
    let files: string[] = [];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
    } catch {
      continue;
    }
    for (const f of files) {
      const full = join(dir, f);
      try {
        const { front, body } = splitFrontmatter(readFileSync(full, "utf8"));
        // Body Markdown boleh melengkapi explanation kosong — tapi skema
        // mewajibkan explanation_id di frontmatter (single source of truth).
        void body;
        const step = routeStepSchema.parse(front);
        // Aturan silang: jawaban tidak boleh muncul di distractors.
        for (const c of step.cloze_items) {
          if (c.distractors.map((d) => d.trim()).includes(c.answer.trim())) {
            throw new Error(`cloze answer "${c.answer}" muncul di distractors`);
          }
        }
        out.push({ step, file: full });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${full}:\n  ${msg.split("\n").join("\n  ")}`);
      }
    }
  }
  if (errors.length) throw new Error(`Route content errors:\n${errors.join("\n")}`);
  // Duplikat step_id / order.
  const ids = new Map<string, string>();
  const orders = new Map<number, string>();
  for (const { step, file } of out) {
    if (ids.has(step.step_id)) throw new Error(`Duplikat step_id ${step.step_id}: ${ids.get(step.step_id)} vs ${file}`);
    if (orders.has(step.order)) throw new Error(`Duplikat order ${step.order}: ${orders.get(step.order)} vs ${file}`);
    ids.set(step.step_id, file);
    orders.set(step.order, file);
  }
  return out.sort((a, b) => a.step.order - b.step.order);
}
