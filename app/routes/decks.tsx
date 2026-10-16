import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { requireUser } from "~/lib/auth.server";
import { deckNeedsId, listDecks } from "~/lib/decks.server";
import { guessMap, parseTable, type ColMap } from "~/lib/deck-parse";
import { Layers, Trash2, Upload } from "lucide-react";

export async function loader({ request }: { request: Request }) {
  await requireUser(request);
  const decks = await listDecks();
  const needs = await Promise.all(decks.map((d) => deckNeedsId(d.id)));
  return { decks: decks.map((d, i) => ({ ...d, needsId: needs[i] ?? 0 })) };
}

export default function DecksPage() {
  const { decks } = useLoaderData<typeof loader>();
  const reval = useRevalidator();
  const [raw, setRaw] = useState("");
  const [maps, setMaps] = useState<ColMap[]>([]);
  const [name, setName] = useState("");
  const [lang, setLang] = useState("ja");
  const [level, setLevel] = useState("N5");
  const [source, setSource] = useState("OpenJLPT");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rows = parseTable(raw);
  const cols = rows.length > 0 ? Math.max(...rows.map((r) => r.length)) : 0;
  if (rows.length > 0 && maps.length !== cols) setMaps(guessMap(rows));

  const doImport = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const mapped = rows.map((r) => {
        const extra: Record<string, string> = {};
        let text = "", reading = "", meaningId = "", type = "", lvl = "";
        r.forEach((cell, i) => {
          const m = maps[i] ?? "extra";
          if (m === "text") text = cell;
          else if (m === "reading") reading = cell;
          else if (m === "meaningId") meaningId = cell;
          else if (m === "type") type = cell;
          else if (m === "level") lvl = cell;
          else if (m === "extra" && cell) extra[`kolom${i + 1}`] = cell;
        });
        return { text, reading, meaningId, type, level: lvl, extra };
      });
      const r = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "import",
          meta: { name: name || `Deck ${new Date().toLocaleDateString("id-ID")}`, lang, level, source, license },
          rows: mapped,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error ?? "Impor gagal");
      setMsg(`Masuk ${d.imported} baris${d.skipped > 0 ? `, lewat ${d.skipped} (duplikat/kosong)` : ""}.`);
      setRaw("");
      setMaps([]);
      reval.revalidate();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Impor gagal");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (deckId: number, deckName: string) => {
    if (!confirm(`Hapus deck "${deckName}" + semua isinya?`)) return;
    await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delete", deckId }),
    });
    reval.revalidate();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Decks</h1>
        <p className="text-xs text-zinc-500">
          Koleksi impor (TSV/CSV) — terpisah dari Library. File milikmu = tanggung jawabmu (pakai deck berlisensi terbuka).
        </p>
      </div>

      {decks.length === 0 ? (
        <div className="card p-4 text-center text-sm text-zinc-500">
          <Layers className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 font-medium text-zinc-700 dark:text-zinc-200">Belum ada deck</p>
          <p className="text-xs">Tempel TSV di bawah — mis. dari OpenJLPT.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {decks.map((d) => (
            <div key={d.id} className="card flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{d.name}</p>
                <p className="text-[11px] text-zinc-400">
                  {d.lang.toUpperCase()} · {d.level ?? "—"} · {d.count} kartu
                  {d.skipped > 0 ? ` · lewat ${d.skipped}` : ""}
                  {d.needsId > 0 ? ` · ${d.needsId} butuh arti ID` : ""}
                  {d.source ? ` · ${d.source}` : ""}
                  {d.license ? ` · lisensi: ${d.license}` : ""}
                </p>
              </div>
              <button
                className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                title="Hapus deck"
                onClick={() => void doDelete(d.id, d.name)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-3 p-4">
        <p className="font-semibold">Impor deck baru</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs">
            <span className="label">Nama deck</span>
            <input className="input-area" value={name} onChange={(e) => setName(e.target.value)} placeholder="JLPT N5" />
          </label>
          <label className="space-y-1 text-xs">
            <span className="label">Bahasa</span>
            <select className="input-area" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="ja">Jepang</option>
              <option value="en">Inggris</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="label">Level</span>
            <input className="input-area" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="N5" />
          </label>
          <label className="space-y-1 text-xs">
            <span className="label">Sumber</span>
            <input className="input-area" value={source} onChange={(e) => setSource(e.target.value)} placeholder="OpenJLPT" />
          </label>
        </div>
        <label className="space-y-1 text-xs">
          <span className="label">Lisensi (wajib diisi kalau deck publik)</span>
          <input className="input-area" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="MIT / CC-BY-SA / milik sendiri" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="label">Tempel TSV/CSV (maks 10.000 baris)</span>
          <textarea
            className="input-area min-h-28 font-mono text-xs"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"猫\tねこ\tkucing\n水\tみず\tair"}
          />
        </label>
        <label className="btn-secondary w-full cursor-pointer justify-center gap-1.5 text-sm">
          <Upload className="h-4 w-4" /> …atau pilih file .tsv / .csv
          <input
            type="file"
            accept=".tsv,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 5 * 1024 * 1024) {
                setMsg("File > 5 MB — kecilkan dulu.");
                return;
              }
              void f.text().then(setRaw);
            }}
          />
        </label>

        {rows.length > 0 ? (
          <div className="space-y-2">
            <p className="label">Petakan kolom → field ({rows.length} baris)</p>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 4)}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }).map((_, i) => (
                <select
                  key={i}
                  className="input-area text-xs"
                  value={maps[i] ?? "extra"}
                  onChange={(e) =>
                    setMaps((m) => {
                      const n = [...m];
                      n[i] = e.target.value as ColMap;
                      return n;
                    })
                  }
                >
                  <option value="skip">Lewati</option>
                  <option value="text">Kata (wajib)</option>
                  <option value="reading">Bacaan</option>
                  <option value="meaningId">Arti</option>
                  <option value="type">Tipe</option>
                  <option value="level">Level</option>
                  <option value="extra">Ekstra</option>
                </select>
              ))}
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <tbody>
                  {rows.slice(0, 5).map((r, ri) => (
                    <tr key={ri} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                      {r.map((c, ci) => (
                        <td key={ci} className="max-w-32 truncate px-2 py-1.5 text-zinc-600 dark:text-zinc-300">
                          {c || <span className="text-zinc-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary w-full" disabled={busy} onClick={() => void doImport()}>
              {busy ? "Mengimpor…" : `Impor ${rows.length} baris`}
            </button>
          </div>
        ) : null}
        {msg ? <p className="text-center text-sm font-medium">{msg}</p> : null}
      </div>
    </div>
  );
}
