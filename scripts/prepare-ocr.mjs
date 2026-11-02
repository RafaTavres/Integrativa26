/**
 * Copia o leitor de texto (Tesseract.js) para `public/tesseract`.
 *
 * O OCR roda no navegador. Servir o worker e o núcleo WebAssembly pelo próprio
 * app evita depender de CDN e mantém a leitura funcionando no Docker/Vercel.
 * O arquivo de português (`por.traineddata.gz`) é versionado junto do projeto.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "node_modules");
const target = path.join(root, "public", "tesseract");

const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  [
    "tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "core/tesseract-core-simd-lstm.wasm.js",
  ],
  [
    "tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    "core/tesseract-core-relaxedsimd-lstm.wasm.js",
  ],
];

async function ensureLanguageFile() {
  const language = path.join(target, "por.traineddata.gz");
  try {
    const info = await stat(language);
    if (info.size > 100_000) return;
  } catch {
    // Cai no erro abaixo.
  }
  throw new Error(
    "Falta public/tesseract/por.traineddata.gz. Baixe de @tesseract.js-data/por/4.0.0_best_int.",
  );
}

async function main() {
  await mkdir(path.join(target, "core"), { recursive: true });
  await Promise.all(
    files.map(async ([from, to]) => {
      await copyFile(path.join(source, from), path.join(target, to));
    }),
  );
  await ensureLanguageFile();
  console.log("OCR pronto em public/tesseract.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
