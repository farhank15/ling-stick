/**
 * Unduh KRADFILE (EDRDG) → data/kanji-krad.json { char: [radikal...] }
 * untuk fallback cari-kanji via tap radikal. Usage: npm run kanji:krad
 */
import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

async function main() {
  const urls = [
    "http://ftp.edrdg.org/pub/Nihongo/kradfile.gz",
    "https://www.edrdg.org/krad/kradfile.gz",
  ];
  let buf: Buffer | null = null;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) {
        buf = Buffer.from(await r.arrayBuffer());
        break;
      }
    } catch {
      /* coba mirror */
    }
  }
  if (!buf) throw new Error("KRADFILE tak bisa diunduh");
  // KRADFILE = gzip + dikodekan EUC-JP (bukan UTF-8).
  const text = new TextDecoder("euc-jp").decode(gunzipSync(buf));
  const map: Record<string, string[]> = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [char, rest] = line.split(":");
    if (!char || !rest) continue;
    map[char.trim()] = rest.trim().split(/\s+/);
  }
  writeFileSync("data/kanji-krad.json", JSON.stringify(map) + "\n");
  console.log(`kanji:krad OK — ${Object.keys(map).length} kanji`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
