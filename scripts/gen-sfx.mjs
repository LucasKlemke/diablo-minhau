// Generates sound effects with the ElevenLabs Sound Effects API into public/assets/sfx/.
// Usage: node --env-file=.env.local scripts/gen-sfx.mjs [name-filter]
// Existing files are skipped: delete one to regenerate it.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const OUT = "public/assets/sfx";
const STYLE = "dark fantasy ARPG, gritty, no music.";

// [file, seconds, prompt, loop?]; variations get one generation each.
const SOUNDS = [
  ...[1, 2, 3].map((i) => [`hit_0${i}`, 0.5, `${STYLE} Short sword slash impact on flesh, punchy and dry, quick decay.`]),
  ["hit_crit", 0.7, `${STYLE} Heavy critical hit, brutal blade impact with bone crunch and a low thump.`],
  ...[1, 2, 3].map((i) => [`hurt_0${i}`, 0.5, `${STYLE} Short male grunt of pain from a warrior being hit, no words.`]),
  ...[1, 2].map((i) => [`coin_0${i}`, 0.5, `${STYLE} A few gold coins clinking as they are picked up, short and bright.`]),
  ["buy", 0.6, `${STYLE} Leather coin pouch dropped on a wooden merchant counter, coins jingle.`],
  ["drop_rare", 0.8, `${STYLE} Item drops on the ground with a small magical chime, subtle.`],
  ["drop_epic", 1.2, `${STYLE} Magic item drop, purple arcane shimmer and soft impact on the ground.`],
  ["drop_legendary", 2, `${STYLE} Legendary loot drop, deep boom followed by a bright angelic shimmer and ringing.`],
  ["drop_unique", 2, `${STYLE} Unique artifact drop, golden heavenly choir hit with a deep resonant impact.`],
  ["levelUp", 2, "dark fantasy ARPG. Level up, heroic rising choir swell with magical sparkles and a holy resonance."],
  ["quest", 1.5, "dark fantasy ARPG. Quest complete, short triumphant medieval brass fanfare."],
  ["portal", 1.5, `${STYLE} Magic town portal opening, swirling blue whoosh with a low humming energy.`],
  ["boss", 3, `${STYLE} Ominous boss appears, deep earth rumble followed by a distant demonic roar.`],
  // Group 2: basic combat and world.
  ...[1, 2, 3, 4].map((i) => [`step_grass_0${i}`, 0.5, `${STYLE} Single leather boot footstep on soft grass.`]),
  ...[1, 2, 3, 4].map((i) => [`step_stone_0${i}`, 0.5, `${STYLE} Single leather boot footstep on dungeon stone floor, slight echo.`]),
  ...[1, 2, 3].map((i) => [`swing_0${i}`, 0.5, `${STYLE} Sword swing whoosh through the air, no impact.`]),
  ["bow_shot", 0.5, `${STYLE} Bow string release and arrow whizzing away.`],
  ["cast", 0.8, `${STYLE} Generic spell cast, magical energy charging and released.`],
  ["potion", 0.8, `${STYLE} Drinking a potion, quick gulp and glass bottle clink.`],
  ["chest_open", 1, `${STYLE} Old wooden chest creaking open with metal latch.`],
  ["die_goblin", 0.8, `${STYLE} Small goblin death squeal, high pitched and nasty.`],
  ["die_skeleton", 1, `${STYLE} Skeleton collapsing, dry bones clattering on stone.`],
  ["die_spider", 0.8, `${STYLE} Giant spider death, wet hiss and clicking legs.`],
  ["die_troll", 1.5, `${STYLE} Huge troll death groan and heavy body falling, ground thud.`],
  ["die_lich", 2, `${STYLE} Undead lich death, ghostly wail dissolving into dark magic wind.`],
  ["die_bandit", 0.8, `${STYLE} Human bandit death cry, short, no words.`],
  // Group 3: one sound per active skill.
  ["skill_cleave", 0.6, `${STYLE} Heavy two-handed axe swing, wide brutal arc, deep whoosh.`],
  ["skill_warcry", 1, `${STYLE} Barbarian whirlwind spin, axe whooshing around in a fast circle.`],
  ["skill_leap", 1, `${STYLE} Warrior leaps and lands with a massive ground slam, rocks cracking.`],
  ["skill_berserk", 1.5, `${STYLE} Barbarian berserker rage roar with a red aura power-up surge, no words.`],
  ["skill_quake", 2, `${STYLE} Earthquake slam, ground shattering, deep rumbling with falling rocks.`],
  ["skill_arrow", 0.5, `${STYLE} Quick bow shot, taut string twang and arrow whoosh.`],
  ["skill_multishot", 0.7, `${STYLE} Several arrows released at once from a bow, layered twangs and whooshes.`],
  ["skill_explosive", 1, `${STYLE} Bow shot followed by a fiery arrow explosion, small blast.`],
  ["skill_rain", 2, `${STYLE} Volley of many arrows falling from the sky, whistling down and thudding into the ground.`],
  ["skill_piercing", 0.8, `${STYLE} Charged bow shot, string creaking then a powerful piercing arrow release with a sonic whoosh.`],
  ["skill_firebolt", 0.8, `${STYLE} Fireball cast, roaring flame launched forward with a whoosh.`],
  ["skill_frostnova", 1.2, `${STYLE} Frost nova, icy blast expanding outward, ice crystals cracking and shattering.`],
  ["skill_chain", 1, `${STYLE} Chain lightning, crackling electric bolt arcing between targets with zaps.`],
  ["skill_shield", 1.2, `${STYLE} Arcane shield activating, magical barrier forming with a resonant hum and shimmer.`],
  ["skill_meteor", 2.5, `${STYLE} Meteor falling from the sky with a rising whistle, then a huge fiery explosion impact.`],
  ["skill_shadowbolt", 0.7, `${STYLE} Shadow bolt cast, dark whispering magic missile launched with a hiss.`],
  ["skill_drain", 1.2, `${STYLE} Soul drain curse, ghostly souls wailing as life energy is sucked away.`],
  ["skill_plague", 1.5, `${STYLE} Toxic plague cloud released, bubbling poison gas hiss.`],
  ["skill_corpse", 1, `${STYLE} Corpse explosion, wet gory flesh burst with bone fragments.`],
  ["skill_bloodpact", 1.5, `${STYLE} Blood pact ritual, dark heartbeat and a sinister blood magic surge.`],
  ["dash", 0.5, `${STYLE} Quick dodge dash, fast cloth and air whoosh.`],
  // Group 4: UI.
  ["ui_click", 0.5, `${STYLE} Short soft UI click, like a small stone button pressed.`],
  ["ui_open", 0.5, `${STYLE} Leather bag opening, inventory UI open.`],
  ["ui_close", 0.5, `${STYLE} Leather bag closing, inventory UI close.`],
  ["equip", 0.5, `${STYLE} Equipping armor, metal and leather rustle.`],
  // Group 4: looping ambience.
  ["amb_town", 20, "Peaceful medieval farm village ambience, birds, light wind, distant cows and chickens, no music.", true],
  ["amb_dungeon", 20, "Dark dungeon ambience, low drone, dripping water, distant echoes, faint wind, no music.", true],
];

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY missing (run with --env-file=.env.local)");
mkdirSync(OUT, { recursive: true });

const filter = process.argv[2];
for (const [name, seconds, text, loop] of SOUNDS) {
  if (filter && !name.includes(filter)) continue;
  const file = `${OUT}/${name}.mp3`;
  if (existsSync(file)) {
    console.log(`skip ${name}`);
    continue;
  }
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.5, ...(loop && { loop: true }) }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`ok   ${name}`);
}
