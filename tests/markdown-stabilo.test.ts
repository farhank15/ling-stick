import { describe, expect, it } from "vitest";
import { MarkdownLite } from "~/components/MarkdownLite";

describe("MarkdownLite stabilo", () => {
  it("==teks== jadi <mark> tunggal", () => {
    const el = MarkdownLite({ text: "Ingat: ==satu kunci== saja." }) as unknown as object;
    const dump = JSON.stringify(el);
    expect(dump).toContain("satu kunci");
    // mark muncul tepat 1x (aturan 1 isolate — selebihnya tanggung jawab penulis)
    expect(dump.match(/"type":"mark"/g)?.length ?? 0).toBe(1);
  });

  it("stabilo berisi kana tetap jadi mark", () => {
    const el = MarkdownLite({ text: "==は topik==." }) as unknown as object;
    expect(JSON.stringify(el)).toContain('"type":"mark"');
  });

  it("teks tanpa stabilo tak hasilkan mark", () => {
    const el = MarkdownLite({ text: "Biasa **tebal** saja." }) as unknown as object;
    expect(JSON.stringify(el)).not.toContain('"type":"mark"');
  });
});
