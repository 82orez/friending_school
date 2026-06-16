/**
 * One-time content transform: inject the per-sentence audio layer into the
 * workhol textbook unit HTML files (content/textbook/workhol/unit-NN.html).
 *
 * Mirrors the reference site (survival-english-au.netlify.app): a ▶ button next
 * to every TALK / EXTENSION / ASK sentence, wired by an inline <script> to
 * `new Audio(AUDIO_BASE + data-audio)`. PICK and MISSION get no buttons.
 *
 * AUDIO_BASE is written as the token `__AUDIO_BASE__workhol/` and resolved at
 * serve time in src/app/textbook/[course]/[unit]/page.tsx to the Supabase
 * Storage public URL. data-audio numbering follows DOM order (talk_1.., ext_1..,
 * ask_1..) per unit, matching the mp3 filenames uploaded by sync-workhol-audio.mjs.
 *
 * Idempotent: files that already contain `audio-btn` are skipped.
 *
 * Run: node scripts/add-workhol-audio-buttons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "textbook", "workhol");

const AUDIO_CSS = `        /* ═══ 음성 듣기 버튼 ═══ */
        .audio-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px; height: 22px;
            border-radius: 50%;
            background: #f0f0f0;
            border: 1px solid #e0e0e0;
            cursor: pointer;
            flex-shrink: 0;
            transition: all .18s;
            vertical-align: middle;
            padding: 0;
        }
        .audio-btn:hover {
            background: #ff4757;
            border-color: #ff4757;
            transform: scale(1.1);
        }
        .audio-btn:hover svg path { fill: #fff; }
        .audio-btn svg { width: 9px; height: 9px; pointer-events: none; }
        .audio-btn svg path { fill: #999; transition: fill .18s; }
        .audio-btn.playing {
            background: #ff4757;
            border-color: #ff4757;
            animation: pulse 1.2s ease-in-out infinite;
        }
        .audio-btn.playing svg path { fill: #fff; }
        @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255,71,87,.4); }
            50%      { box-shadow: 0 0 0 7px rgba(255,71,87,0); }
        }
        /* 대화: 화자 라벨 옆에 버튼 정렬 */
        .speaker-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 3px;
        }
        .speaker-row .speaker { margin-bottom: 0; }
        /* EXTENSION: 문장과 버튼 한 줄 정렬 */
        .ext-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .ext-item .ext-sentence { flex: 1; }
        /* ASK: 질문과 버튼 한 줄 정렬 */
        .ask-item .audio-btn { margin-left: auto; align-self: center; }
        @media print {
            .audio-btn { display: none; }
        }
`;

const SCRIPT = `<script>
(function(){
  const AUDIO_BASE = '__AUDIO_BASE__workhol/';
  let currentAudio = null;
  let currentButton = null;

  document.querySelectorAll('.audio-btn').forEach(btn => {
    btn.addEventListener('click', function(e){
      e.preventDefault();
      const file = this.getAttribute('data-audio');
      if (!file) return;

      // 같은 버튼 다시 누르면 정지
      if (currentButton === this && currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        this.classList.remove('playing');
        currentAudio = null;
        currentButton = null;
        return;
      }

      // 다른 음성 재생 중이면 중지
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        if (currentButton) currentButton.classList.remove('playing');
      }

      currentAudio = new Audio(AUDIO_BASE + file);
      currentButton = this;
      this.classList.add('playing');

      currentAudio.play().catch(err => {
        this.classList.remove('playing');
        const note = document.createElement('div');
        note.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;font-size:12px;font-family:Verdana,sans-serif;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);';
        note.textContent = '🔊 음성 파일이 아직 준비되지 않았습니다 (' + file + ')';
        document.body.appendChild(note);
        setTimeout(()=>note.remove(), 2500);
      });

      currentAudio.addEventListener('ended', () => {
        this.classList.remove('playing');
        currentAudio = null;
        currentButton = null;
      });
    });
  });
})();
</script>
`;

const btn = (unitPad, kind, n) =>
  `<button class="audio-btn" data-audio="unit${unitPad}/${kind}_${n}.mp3" aria-label="play"><svg viewBox="0 0 12 12"><path d="M3 2 L9 6 L3 10 Z"/></svg></button>`;

const RE_SPEAKER = /^(\s*)<div class="speaker">(.*)<\/div>\s*$/;
const RE_EXT = /^(\s*)<div class="ext-item">(.*)<\/div>\s*$/;
const RE_ASK = /^(\s*)<div class="ask-text">(.*)<\/div>\s*$/;

let changed = 0;
let skipped = 0;
const counts = [];

for (let u = 1; u <= 24; u++) {
  const pad = String(u).padStart(2, "0");
  const file = path.join(DIR, `unit-${pad}.html`);
  if (!fs.existsSync(file)) {
    console.error(`MISSING: ${file}`);
    continue;
  }
  const raw = fs.readFileSync(file, "utf8");
  if (raw.includes("audio-btn")) {
    skipped++;
    console.log(`skip (already has audio): unit-${pad}.html`);
    continue;
  }
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  let talk = 0;
  let ext = 0;
  let ask = 0;
  const out = [];

  for (const line of lines) {
    let m;
    if ((m = line.match(RE_SPEAKER))) {
      const ws = m[1];
      talk++;
      out.push(`${ws}<div class="speaker-row">`);
      out.push(`${ws}    <div class="speaker">${m[2]}</div>`);
      out.push(`${ws}    ${btn(pad, "talk", talk)}`);
      out.push(`${ws}</div>`);
      continue;
    }
    if ((m = line.match(RE_EXT))) {
      const ws = m[1];
      ext++;
      out.push(`${ws}<div class="ext-item"><span class="ext-sentence">${m[2]}</span>${btn(pad, "ext", ext)}</div>`);
      continue;
    }
    if ((m = line.match(RE_ASK))) {
      const ws = m[1];
      ask++;
      out.push(line);
      out.push(`${ws}${btn(pad, "ask", ask)}`);
      continue;
    }
    if (line.includes("</style>")) {
      out.push(...AUDIO_CSS.split("\n").slice(0, -1)); // drop trailing empty from template
      out.push(line);
      continue;
    }
    if (line.includes("</body>")) {
      out.push(...SCRIPT.split("\n").slice(0, -1));
      out.push("");
      out.push(line);
      continue;
    }
    out.push(line);
  }

  fs.writeFileSync(file, out.join(eol), "utf8");
  changed++;
  counts.push(`unit-${pad}: talk=${talk} ext=${ext} ask=${ask} (total ${talk + ext + ask})`);
}

console.log("\n" + counts.join("\n"));
console.log(`\nchanged=${changed} skipped=${skipped}`);
