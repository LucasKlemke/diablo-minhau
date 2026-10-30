// Generates background music with the ElevenLabs Music API into public/assets/music/.
// Usage: node --env-file=.env.local scripts/gen-music.mjs [name-filter]
// Existing files are skipped: delete one to regenerate it.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/assets/music";
const STYLE = "Instrumental dark fantasy ARPG game soundtrack, seamless loop, no vocals.";

// [file, seconds, prompt]
const TRACKS = [
  // town_01/town_02 were made on the ElevenLabs site from this prompt.
  ["town", 90, `${STYLE} Calm, melancholic medieval village theme: fingerpicked acoustic guitar, soft wooden flute, light strings, slow tempo, in the style of Tristram from Diablo.`],
  ["dungeon", 90, `${STYLE} Dark, tense dungeon exploration: low cello and bass drones, distant dark choir pads, slow sparse percussion, eerie and oppressive.`],
  ["menu", 120, `${STYLE} Epic main menu title theme: slow ominous opening with a lone cello and dark choir, building into a grand orchestral swell with soaring strings, heavy war drums, low brass fanfare and a solemn heroic melody, then settling back for a smooth loop. Gothic and majestic, haunting and epic.`],
  ["boss", 75, `${STYLE} Intense boss battle: heavy tribal war drums, aggressive low brass, driving strings, dark choir hits, fast and epic.`],
  // Act I (rewrite)
  ["court", 60, "Instrumental medieval royal court music, no vocals. Gentle solo lute with soft recorder and harp, warm, serene and graceful, a peaceful white marble throne hall, light and innocent."],
  ["attack", 60, `${STYLE} Sudden horror attack on a castle at night: out-of-tune pounding war drums, dissonant brass stabs, shrieking strings, monstrous and chaotic, red lightning storm.`],
  ["aldo", 90, `${STYLE} Sad tender theme for a dethroned old king tending a wounded hero in a poor straw hut: slow solo cello and a soft music box melody, faint crackling warmth, grief with a small ember of hope.`],
  ["village_ruin", 90, `${STYLE} Melancholic besieged medieval village in ruins: sparse fingerpicked acoustic guitar, lonely wooden flute, low string drone, slow, weary and hopeful, haunting folk ambience.`],
  ["forest", 90, `${STYLE} Dense dark forest exploration: low woodwinds, plucked harp, soft frame drums, mysterious and earthy, goblins lurking among twisted trees, slow and tense.`],
];

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY missing (run with --env-file=.env.local)");
mkdirSync(OUT, { recursive: true });

const filter = process.argv[2];
for (const [name, seconds, prompt] of TRACKS) {
  if (filter && !name.includes(filter)) continue;
  const file = `${OUT}/${name}.mp3`;
  if (existsSync(file)) {
    console.log(`skip ${name}`);
    continue;
  }
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: seconds * 1000, model_id: "music_v1", force_instrumental: true }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`ok   ${name}`);
}
