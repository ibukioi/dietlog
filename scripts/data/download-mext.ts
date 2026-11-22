/**
 * 文部科学省の公式データファイルをダウンロードし、SHA-256 を記録する(§7.1 download)
 *
 *   pnpm data:download
 *
 * 取得先: https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html
 * ※ 食品成分データベース(fooddb.mext.go.jp)には一切アクセスしない
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MEXT_FILES = {
  main: {
    url: "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_02.xlsx",
    file: "mext_main.xlsx",
    title: "日本食品標準成分表（八訂）増補2023年 第2章（データ）",
  },
  errata: {
    url: "https://www.mext.go.jp/content/20260327-mxt_kagsei-mext-000029402_16.xlsx",
    file: "mext_errata.xlsx",
    title: "正誤表（データ） 令和8年3月27日",
  },
} as const;

const RAW_DIR = path.join(process.cwd(), "data", "raw");

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  const manifest: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(MEXT_FILES)) {
    const res = await fetch(f.url, { headers: { "User-Agent": "dietlog-data-import/0.1" } });
    if (!res.ok) throw new Error(`${f.url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const sha256 = createHash("sha256").update(buf).digest("hex");
    await writeFile(path.join(RAW_DIR, f.file), buf);
    manifest[key] = { ...f, sha256, bytes: buf.length, downloadedAt: new Date().toISOString() };
    console.log(`✓ ${f.file} (${buf.length} bytes) sha256=${sha256.slice(0, 16)}…`);
  }
  await writeFile(path.join(RAW_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
