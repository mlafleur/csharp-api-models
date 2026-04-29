import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src/templates");
const dest = resolve(root, "dist/templates");

mkdirSync(dest, { recursive: true });
for (const file of readdirSync(src)) {
  if (file.endsWith(".hbs")) {
    copyFileSync(resolve(src, file), resolve(dest, file));
  }
}
