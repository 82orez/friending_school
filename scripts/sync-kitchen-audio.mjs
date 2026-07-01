/**
 * One-time sync: download the kitchen per-sentence audio clips from the live
 * reference site and upload them to Supabase Storage (public bucket).
 *
 * Source : https://friending-kitchen-ver01.netlify.app/audio/<data-audio>
 * Target : bucket "textbook-audio", key "kitchen/<data-audio>"
 *          → served at <SUPABASE_URL>/storage/v1/object/public/textbook-audio/kitchen/<data-audio>
 *
 * The list of clips is derived from the `data-audio="..."` attributes in the
 * kitchen unit HTML (content/textbook/kitchen/unit-NN.html), so it always
 * matches the buttons rendered in the viewer.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (read from .env/.env.local automatically).
 * Idempotent: re-running overwrites (upsert) existing objects.
 *
 * Run: node scripts/sync-kitchen-audio.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KITCHEN_DIR = path.join(ROOT, "content", "textbook", "kitchen");
const LIVE_BASE = "https://friending-kitchen-ver01.netlify.app/audio/";
const BUCKET = "textbook-audio";
const KEY_PREFIX = "kitchen/";
const CONCURRENCY = 8;

// --- minimal .env loader (no dotenv dependency) ---
function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] ??= v;
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// --- collect data-audio paths from the unit HTML ---
function collectClips() {
  const set = new Set();
  for (const file of fs.readdirSync(KITCHEN_DIR).filter((f) => /^unit-\d+\.html$/.test(f))) {
    const html = fs.readFileSync(path.join(KITCHEN_DIR, file), "utf8");
    for (const m of html.matchAll(/data-audio="([^"]+)"/g)) set.add(m[1]);
  }
  return [...set].sort();
}

async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !/already exists/i.test(error.message)) throw error;
  // make sure it's public even if it pre-existed
  await supabase.storage.updateBucket(BUCKET, { public: true }).catch(() => {});
}

async function syncOne(clip) {
  const res = await fetch(LIVE_BASE + clip);
  if (!res.ok) return { clip, status: "download-failed", code: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(KEY_PREFIX + clip, buf, {
    contentType: "audio/mpeg",
    upsert: true,
  });
  if (error) return { clip, status: "upload-failed", code: error.message };
  return { clip, status: "ok", bytes: buf.length };
}

async function main() {
  const clips = collectClips();
  console.log(`Found ${clips.length} clips across kitchen units. Ensuring bucket "${BUCKET}"...`);
  await ensureBucket();

  let ok = 0;
  const failures = [];
  for (let i = 0; i < clips.length; i += CONCURRENCY) {
    const batch = clips.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(syncOne));
    for (const r of results) {
      if (r.status === "ok") ok++;
      else failures.push(r);
    }
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, clips.length)}/${clips.length} processed (ok=${ok}, fail=${failures.length})`);
  }
  console.log("");
  if (failures.length) {
    console.error(`\n${failures.length} failed:`);
    for (const f of failures) console.error(`  ${f.clip}: ${f.status} (${f.code})`);
    process.exit(1);
  }
  console.log(`\n✓ Uploaded ${ok} clips to ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${KEY_PREFIX}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
