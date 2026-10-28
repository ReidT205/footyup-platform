/**
 * Bundles the admin dashboard into public/admin with esbuild.
 *   pnpm admin:build          one-off production build
 *   pnpm admin:build --watch  rebuild on change (use with `pnpm dev`)
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const outdir = "public/admin";

async function writeHtml(result: esbuild.BuildResult) {
  const outputs = Object.keys(result.metafile?.outputs ?? {});
  const js = outputs.find((f) => f.endsWith(".js"));
  const css = outputs.find((f) => f.endsWith(".css"));
  if (!js || !css) throw new Error("Admin build produced no JS or CSS");
  const template = await readFile("admin/index.html", "utf8");
  await writeFile(`${outdir}/index.html`, template.replace("__JS__", basename(js)).replace("__CSS__", basename(css)));
}

const options: esbuild.BuildOptions = {
  entryPoints: ["admin/src/main.tsx"],
  bundle: true,
  outdir,
  entryNames: watch ? "app" : "app-[hash]",
  format: "esm",
  target: ["es2022", "safari16"],
  jsx: "automatic",
  minify: !watch,
  sourcemap: watch,
  metafile: true,
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  logLevel: "info",
  plugins: [
    {
      name: "html",
      setup(build) {
        build.onEnd(async (result) => {
          if (!result.errors.length) await writeHtml(result);
        });
      },
    },
  ],
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("Watching admin/ for changes…");
} else {
  await esbuild.build(options);
}
