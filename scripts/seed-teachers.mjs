/**
 * Dev seed: create fake approved teachers (role=teacher) with profile fields
 * and weekly availability slots, so the admin/teacher pages can be exercised
 * without going through the real signup → apply → approve flow.
 *
 * Creates auth users under the recognizable domain @seed.friendingschool.test,
 * promotes their profiles to role=teacher, syncs app_metadata.role, and fills
 * teacher_availability with a per-teacher pattern. Avatars are left null.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (read from .env/.env.local automatically).
 * Idempotent: re-running reuses existing accounts and replaces their slots.
 *
 * Run:   node scripts/seed-teachers.mjs
 * Clean: node scripts/seed-teachers.mjs --clean   (deletes all seed teachers)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAKE_DOMAIN = "seed.friendingschool.test";
const COMMON_PASSWORD = "SeedTeacher!123";

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

// --- fake teacher roster (mostly native-speaker names + a couple of Korean) ---
const TEACHERS = [
  {
    firstName: "Sarah",
    lastName: "Johnson",
    bio: "Certified TEFL instructor from Sydney with a love for conversational, real-world English.",
    experience: "5 years teaching ESL across Australia and online.",
    phone: "010-2000-0001",
  },
  {
    firstName: "Michael",
    lastName: "Brown",
    bio: "Friendly Canadian tutor focused on pronunciation and natural everyday speaking.",
    experience: "7 years of one-on-one and group lessons.",
    phone: "010-2000-0002",
  },
  {
    firstName: "Emily",
    lastName: "Davis",
    bio: "I help learners build confidence for working holidays and job interviews abroad.",
    experience: "4 years specializing in business and travel English.",
    phone: "010-2000-0003",
  },
  {
    firstName: "James",
    lastName: "Wilson",
    bio: "Patient teacher from London who makes grammar simple and practical.",
    experience: "8 years teaching grammar and writing.",
    phone: "010-2000-0004",
  },
  {
    firstName: "Olivia",
    lastName: "Taylor",
    bio: "Enthusiastic about kitchen and hospitality English for cafe and restaurant work.",
    experience: "3 years coaching hospitality staff.",
    phone: "010-2000-0005",
  },
  {
    firstName: "Daniel",
    lastName: "Martinez",
    bio: "Bilingual tutor who keeps lessons fun, relaxed, and goal-oriented.",
    experience: "6 years of conversation-focused teaching.",
    phone: "010-2000-0006",
  },
  {
    firstName: "Sophia",
    lastName: "Anderson",
    bio: "Specializing in cosmetics and beauty-industry English for overseas careers.",
    experience: "5 years in beauty-sector English coaching.",
    phone: "010-2000-0007",
  },
  {
    firstName: "William",
    lastName: "Thomas",
    bio: "Down-to-earth instructor helping students prepare for life abroad.",
    experience: "9 years teaching across three countries.",
    phone: "010-2000-0008",
  },
  {
    firstName: "Jessica",
    lastName: "White",
    bio: "I focus on fluency and listening so you can keep up in fast conversations.",
    experience: "4 years of immersive speaking classes.",
    phone: "010-2000-0009",
  },
  {
    firstName: "Ethan",
    lastName: "Harris",
    bio: "Easygoing American tutor who tailors every lesson to your goals.",
    experience: "6 years online and in-person teaching.",
    phone: "010-2000-0010",
  },
  {
    firstName: "Jiwoo",
    lastName: "Kim",
    bio: "Korean-English bilingual coach bridging the gap for first-time travelers.",
    experience: "5 years guiding Korean learners abroad.",
    phone: "010-2000-0011",
  },
  {
    firstName: "Minjun",
    lastName: "Lee",
    bio: "I make speaking practice approachable, especially for nervous beginners.",
    experience: "4 years of beginner conversation classes.",
    phone: "010-2000-0012",
  },
];

const emailFor = (i) => `teacher-${String(i + 1).padStart(2, "0")}@${FAKE_DOMAIN}`;
const zoomFor = (i) => `https://zoom.us/j/${1000000000 + (i + 1)}`;

// --- look up an existing auth user by email (paginated) ---
async function findUserByEmail(email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) break;
  }
  return null;
}

// --- build a varied weekly availability pattern for teacher index i ---
function slotsForTeacher(i) {
  const rows = [];
  // Weekday (Mon–Fri) evening block, start shifts a little per teacher.
  const eveningStart = 18 * 60 + (i % 4) * 30; // 18:00 / 18:30 / 19:00 / 19:30
  for (let day = 1; day <= 5; day++) {
    for (let k = 0; k < 4; k++) {
      const start = eveningStart + k * 30;
      if (start <= 1410) rows.push({ day_of_week: day, start_min: start });
    }
  }
  // Weekend (Sat=6, Sun=0) morning block.
  const morningStart = 9 * 60 + (i % 3) * 30; // 09:00 / 09:30 / 10:00
  for (const day of [6, 0]) {
    for (let k = 0; k < 5; k++) {
      const start = morningStart + k * 30;
      if (start <= 1410) rows.push({ day_of_week: day, start_min: start });
    }
  }
  return rows;
}

async function seedOne(i) {
  const email = emailFor(i);
  const t = TEACHERS[i];

  // 1. Create (or reuse) the auth user.
  let userId;
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: COMMON_PASSWORD,
    email_confirm: true,
  });
  if (createErr) {
    const existing = await findUserByEmail(email);
    if (!existing) throw createErr;
    userId = existing.id;
  } else {
    userId = created.user.id;
  }

  // 2. Promote profile to teacher + fill fields (service_role bypasses RLS & role-lock trigger).
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      role: "teacher",
      first_name: t.firstName,
      last_name: t.lastName,
      bio: t.bio,
      experience: t.experience,
      zoom_url: zoomFor(i),
      phone: t.phone,
    })
    .eq("id", userId);
  if (profErr) throw profErr;

  // Keep JWT app_metadata.role in sync with profiles.role.
  const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role: "teacher" },
  });
  if (metaErr) throw metaErr;

  // 3. Replace availability slots (delete-then-insert for idempotency).
  const { error: delErr } = await supabase.from("teacher_availability").delete().eq("teacher_id", userId);
  if (delErr) throw delErr;
  const rows = slotsForTeacher(i).map((r) => ({ teacher_id: userId, ...r }));
  const { error: insErr } = await supabase.from("teacher_availability").insert(rows);
  if (insErr) throw insErr;

  console.log(`✓ ${email}  ${t.firstName} ${t.lastName}  (${rows.length} slots)`);
}

async function seed() {
  console.log(`Seeding ${TEACHERS.length} fake teachers (@${FAKE_DOMAIN})...`);
  for (let i = 0; i < TEACHERS.length; i++) {
    try {
      await seedOne(i);
    } catch (err) {
      console.error(`✗ ${emailFor(i)} failed:`, err.message || err);
    }
  }
  console.log(`Done. Password for all seed teachers: ${COMMON_PASSWORD}`);
}

async function clean() {
  console.log(`Deleting seed teachers (@${FAKE_DOMAIN})...`);
  let deleted = 0;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const seeds = data.users.filter((u) => u.email?.toLowerCase().endsWith(`@${FAKE_DOMAIN}`));
    for (const u of seeds) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) {
        console.error(`✗ ${u.email} delete failed:`, delErr.message || delErr);
      } else {
        deleted++;
        console.log(`✓ deleted ${u.email}`);
      }
    }
    if (data.users.length < 1000) break;
  }
  console.log(`Done. Deleted ${deleted} seed teacher(s).`);
}

const isClean = process.argv.includes("--clean");
(isClean ? clean() : seed()).catch((err) => {
  console.error(err);
  process.exit(1);
});
