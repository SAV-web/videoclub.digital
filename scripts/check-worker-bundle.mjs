import esbuild from "esbuild";

try {
  await esbuild.build({
    entryPoints: ["cloudflare/worker.js"],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent",
  });
  console.log("Worker bundle verification passed (esbuild in-memory).");
} catch (err) {
  console.error("Worker bundle verification failed:", err);
  process.exit(1);
}
