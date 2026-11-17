import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";

/**
 * F2 — bukti isolasi data lintas-akun lewat fungsi service asli
 * (items/bank/quiz). DB in-memory diarahkan SEBELUM modul dimuat
 * (pola sama dengan auth-local.test.ts) supaya singleton `db`
 * yang dipakai service mengarah ke DB test ini.
 */
let db: any;
let userA = 0;
let userB = 0;

beforeAll(async () => {
  process.env.DATABASE_URL = "file::memory:";
  process.env.DATABASE_AUTH_TOKEN = "";
  process.env.APP_PASSWORD = "secret-bootstrap";
  const clientMod = await import("~/lib/db/client.server");
  await clientMod.ensureDbReady();
  db = clientMod.db;

  const { claimLegacyData } = await import("~/lib/claim.server");
  const now = Date.now();
  const [{ id: a }] = await db
    .insert(schema.users)
    .values({ username: "alice", displayName: "alice", provider: "local", createdAt: now })
    .returning({ id: schema.users.id });
  const [{ id: b }] = await db
    .insert(schema.users)
    .values({ username: "bob", displayName: "bob", provider: "local", createdAt: now })
    .returning({ id: schema.users.id });
  userA = a;
  userB = b;
  // Klaim legacy → alice jadi pemilik data.
  await claimLegacyData(userA);
});

async function addItem(userId: number, text: string) {
  const now = Date.now();
  const { id } = (
    await db
      .insert(schema.items)
      .values({
        text,
        textNorm: text.toLowerCase(),
        type: "word",
        register: "neutral",
        meaningId: `arti ${text}`,
        status: "learning",
        lang: "en",
        createdAt: now,
        userId,
      })
      .returning({ id: schema.items.id })
  )[0];
  await db.insert(schema.cards).values({
    itemId: id,
    due: now,
    reps: 0,
    lapses: 0,
    state: 0,
    learningSteps: 0,
    userId,
  });
  return id as number;
}

describe("F2 — isolasi data lintas-akun", () => {
  it("listItems hanya mengembalikan item milik user aktif", async () => {
    await addItem(userA, "alice-word");
    await addItem(userB, "bob-word");

    const { setCurrentUser } = await import("~/lib/user-context");
    const { listItems } = await import("~/lib/items.server");

    setCurrentUser(userA);
    const textsA = (await listItems({ status: "all" })).map((r: any) => r.text);
    expect(textsA).toContain("alice-word");
    expect(textsA).not.toContain("bob-word");

    setCurrentUser(userB);
    const textsB = (await listItems({ status: "all" })).map((r: any) => r.text);
    expect(textsB).toContain("bob-word");
    expect(textsB).not.toContain("alice-word");
  });

  it("getItemDetail menolak item milik user lain", async () => {
    const bItem = await addItem(userB, "bob-secret");
    const { setCurrentUser } = await import("~/lib/user-context");
    const { getItemDetail } = await import("~/lib/items.server");

    setCurrentUser(userA);
    expect(await getItemDetail(bItem)).toBeNull();
    setCurrentUser(userB);
    expect(await getItemDetail(bItem)).not.toBeNull();
  });

  it("getReviewQueue hanya memuat kartu milik user aktif", async () => {
    await addItem(userA, "alice-due");
    await addItem(userB, "bob-due");
    const { setCurrentUser } = await import("~/lib/user-context");
    const { getReviewQueue } = await import("~/lib/items.server");

    setCurrentUser(userA);
    const qA = await getReviewQueue();
    const textsA = [...qA.due, ...qA.newCards].map((c: any) => c.itemText);
    expect(textsA).toContain("alice-due");
    expect(textsA).not.toContain("bob-due");

    setCurrentUser(userB);
    const qB = await getReviewQueue();
    const textsB = [...qB.due, ...qB.newCards].map((c: any) => c.itemText);
    expect(textsB).toContain("bob-due");
    expect(textsB).not.toContain("alice-due");
  });

  it("bank progress per-user terisolasi", async () => {
    const now = Date.now();
    const [bankRow] = await db
      .insert(schema.wordbank)
      .values({
        text: "serendipity",
        textNorm: "serendipity",
        type: "word",
        register: "neutral",
        cefr: "B2",
        meaningId: "kebetulan beruntung",
        examplesJson: "[]",
        status: "new",
        source: "seed",
        lang: "en",
        createdAt: now,
      })
      .returning();

    const { setCurrentUser } = await import("~/lib/user-context");
    const { startLearning, listBank } = await import("~/lib/bank.server");

    setCurrentUser(userA);
    await startLearning(bankRow.id);
    const aBank = await listBank({ status: "learning" });
    expect(aBank.map((r: any) => r.text)).toContain("serendipity");

    setCurrentUser(userB);
    const bBank = await listBank({ status: "learning" });
    expect(bBank.map((r: any) => r.text)).not.toContain("serendipity");
    const bNew = await listBank({ status: "new" });
    expect(bNew.map((r: any) => r.text)).toContain("serendipity");
  });

  it("quiz set per-user terisolasi (day+mode sama, set sendiri-sendiri)", async () => {
    const { setCurrentUser } = await import("~/lib/user-context");
    const { getSetForDay } = await import("~/lib/quiz.server");

    setCurrentUser(userA);
    const setA = await getSetForDay("daily", "2026-11-17", 5);
    expect(setA).not.toBeNull();

    setCurrentUser(userB);
    const setB = await getSetForDay("daily", "2026-11-17", 5);
    expect(setB).not.toBeNull();
    expect(setA!.id).not.toBe(setB!.id);
  });
});
