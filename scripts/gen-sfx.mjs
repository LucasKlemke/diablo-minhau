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
  // Group 5: opening cutscene.
  ["cine_drums", 8, "Tribal goblin war drums at night, fast heavy pounding rhythm, deep and menacing, no melody.", true],
  ["cine_fire", 8, "Big campfire crackling and roaring at night, wood popping, no music.", true],
  ["cine_night", 10, "Dark forest at night ambience, crickets, a distant owl, faint cold wind, no music.", true],
  ...[1, 2, 3].map((i) => [`cine_laugh_0${i}`, 1.5, `${STYLE} Small goblin cackling an evil mischievous laugh, high pitched and nasal, no words.`]),
  ["cine_cheer", 3, `${STYLE} A horde of goblins cheering and howling around a fire, chaotic high pitched shrieks and cackles, no words.`],
  ["cine_grumm", 2.5, `${STYLE} Huge goblin king roaring a guttural raspy war cry, monstrous, no words.`],
  ["cine_bell", 4, `${STYLE} Distant village alarm bell ringing urgently at dusk, faint echo over fields.`],
  ["cine_ambush", 1.5, `${STYLE} Several goblins screeching a battle cry as they leap out of bushes, leaves rustling, no words.`],
  ["cine_title", 3, `${STYLE} Cinematic title hit, deep boom with a dark reverb tail and a metallic ring.`],
  // Group 5b: Act I prologue (castle, Jimmynelson's attack, Aldo's hut).
  ["cine_bark", 1.2, `${STYLE} Tiny spoiled yorkshire terrier growling and yapping angrily, high pitched, indoors.`],
  ["cine_pee", 2, `${STYLE} Small dog peeing on a thick carpet, a short liquid trickle, comedic, indoors.`],
  ["cine_thunder", 3, `${STYLE} Violent close thunder crack and rumbling lightning storm, very loud.`],
  ["cine_gate_break", 2, `${STYLE} Huge white wooden castle gate smashed open by a monster, splintering wood, metal hinges bursting, heavy crash.`],
  ["cine_roar", 3, `${STYLE} Colossal monstrous dog beast roaring, a deep wet toxic sonic howl with a gurgle, terrifying, no words.`],
  ["cine_choke", 2, `${STYLE} Armored castle guards coughing and choking on a foul gas and collapsing, metal armor clanging on stone.`],
  ["cine_glass", 2, `${STYLE} Large stained glass window shattering as a body crashes through it, glass shards raining down.`],
  ["cine_chains", 2.5, `${STYLE} Heavy rusty chains dragged across a stone floor, rattling, slow.`],
  ["cine_blaze", 8, "Castle balcony burning, roaring fire and crackling timber, wind, no music.", true],
  ["cine_hearth", 8, "Quiet dying hearth fire in a small hut, weak embers crackling softly, faint wind through straw roof, no music.", true],
  ["cine_heartbeat", 3, `${STYLE} Slow muffled heartbeat, waking up from a long coma, deep and soft.`],
  ["cine_gore", 1.5, `${STYLE} Gory wet flesh explosion, an armored body torn apart, splattering blood, bones cracking and metal armor clattering.`],
  ["cine_rend", 1.2, `${STYLE} Huge beast claws slashing and ripping through flesh and chainmail, a vicious snarl.`],
  ["cine_column_fall", 2.5, `${STYLE} Massive marble column cracking and crashing to the floor of a great hall, stone shattering, rumble.`],
  ["cine_fire_whoosh", 2.5, `${STYLE} Fire erupting and spreading fast across tapestries and wooden beams, a big whoosh and roaring flames.`],
  ["cine_scream", 2, `${STYLE} A young princess screaming in terror in a stone hall, echo.`],
  // Group 6: monsters of inimmigos.md (deaths, then their mechanics).
  ["die_wolf", 1, `${STYLE} Grey wolf death, pained yelp fading into a whimper.`],
  ["die_boar", 1, `${STYLE} Wild boar death squeal and heavy body thud.`],
  ["die_wasp", 0.7, `${STYLE} Giant wasp death, buzzing wings sputter out with a wet crunch.`],
  ["die_slime", 0.8, `${STYLE} Green slime death, wet gooey splat and bubbling squelch.`],
  ["die_worg_rider", 1.2, `${STYLE} Goblin rider screech and big wolf yelp, both falling to the ground.`],
  ["die_ent", 1.8, `${STYLE} Walking tree creature death, deep wooden groan, creaking and cracking branches, crashing down.`],
  ["die_mimic", 1.2, `${STYLE} Treasure chest monster death, wooden lid slamming, coins spilling, gurgling tongue.`],
  ["die_kobold", 0.8, `${STYLE} Small reptilian kobold death yip, raspy and high, no words.`],
  ["die_zombie", 1.2, `${STYLE} Zombie death, rotten wet moan and limp body collapsing.`],
  ["die_ghoul", 1, `${STYLE} Ghoul death, raspy shriek and clattering claws.`],
  ["die_lizardman", 1, `${STYLE} Lizardman death hiss and reptilian croak, spear clattering.`],
  ["die_cultist", 1, `${STYLE} Hooded cultist death, short gasp and dark magic fizzle, no words.`],
  ["die_leech", 0.8, `${STYLE} Giant leech death, wet squelch and deflating gurgle.`],
  ["die_wisp", 1, `${STYLE} Will-o-wisp death, ghostly light popping with a fading airy chime.`],
  ["die_ghost", 1.5, `${STYLE} Ghost death, hollow wail dissolving into wind.`],
  ["die_gargoyle", 1.3, `${STYLE} Stone gargoyle death, rock cracking and crumbling into rubble.`],
  ["die_orc", 1.2, `${STYLE} Big orc death, deep guttural roar cut short and heavy fall, no words.`],
  ["die_hobgoblin", 1, `${STYLE} Hobgoblin soldier death grunt, shield and helmet clanging on the ground, no words.`],
  ["die_armor", 1.5, `${STYLE} Empty suit of plate armor collapsing, metal plates clanging and scattering, helmet rolling.`],
  ["die_bat", 0.6, `${STYLE} Giant bat death, high pitched screech and flapping thud.`],
  ["die_ant", 0.7, `${STYLE} Giant ant death, chitinous crunch and clicking mandibles.`],
  ["die_beetle", 0.9, `${STYLE} Armored beetle death, hard shell cracking open with a crunch.`],
  ["die_centipede", 1, `${STYLE} Giant centipede death, hissing and many legs skittering to a stop.`],
  ["die_manticore", 2, `${STYLE} Manticore death, lion roar turning into an agonized scream, huge body falling.`],
  ["die_dragon", 3, `${STYLE} Young dragon death, mighty roar fading into a dying rumble, huge body crashing down.`],
  ["mon_howl", 2, `${STYLE} Alpha wolf howling to call the pack, eerie forest echo.`],
  ["mon_wisp_burst", 1, `${STYLE} Magical ghost light explosion, bright crackling burst with an airy whoosh.`],
  ["mon_mimic", 1.2, `${STYLE} Treasure chest suddenly bites, wooden lid snapping with teeth and a monstrous growl.`],
  ["mon_trap", 0.6, `${STYLE} Hidden snare trap snapping shut, metal and rope.`],
  ["mon_wake_tree", 1.5, `${STYLE} Tree creature waking up, deep wooden creak and groaning bark, leaves rustling.`],
  ["mon_wake_stone", 1.3, `${STYLE} Stone statue coming alive, grinding rock cracking, wings unfolding.`],
  ["mon_burrow", 1, `${STYLE} Creature bursting out of the ground, dirt and rocks erupting.`],
  ["mon_split", 0.7, `${STYLE} Slime splitting in two, wet gooey stretch and plop.`],
  ["mon_poison", 0.6, `${STYLE} Poison sting, short venomous hiss with a sickly bubble.`],
  ["mon_stun", 0.7, `${STYLE} Dazed stun hit, dull thump with a ringing in the ears.`],
  ["mon_fire_breath", 1.5, `${STYLE} Dragon breathing a jet of fire, roaring flames whoosh.`],
  ["mon_acid", 0.7, `${STYLE} Giant insect spitting acid, wet spit and sizzle.`],
  ["mon_spikes", 0.7, `${STYLE} Volley of bone spikes shot from a scorpion tail, sharp whooshes.`],
  ["mon_growl", 1, `${STYLE} Wild beast growling as it notices its prey, low and threatening.`],
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
