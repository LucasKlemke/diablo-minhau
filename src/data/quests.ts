import { L } from "../i18n";
import type { Rarity, Slot } from "./items";
import type { EnemyType, Faction, UniqueId } from "./enemies";
import type { AreaId, ZoneId } from "./zones";
import type { IconId } from "../ui/icons";
import type { SpriteName } from "../kiln";

export type NpcId = "aldo" | "smith" | "hunter" | "healer" | "boatman" | "merchant" | "captain" | "dwarf" | "seer";
/** Where an NPC stands in its act's village: the leader in the plaza, the shop and the guide around it. */
export type NpcRole = "leader" | "shop" | "guide";

export const NPCS: Record<NpcId, { name: string; title: string; icon: IconId; sprite: SpriteName; act: ZoneId; role: NpcRole; idle: string[] }> = {
  aldo: { act: "forest", role: "leader", name: L("Rei Aldo", "King Aldo"), title: L("O Ancião · Rei Destronado", "The Elder · Dethroned King"), icon: "staff", sprite: "npc_aldo",
    idle: [L("Enquanto houver um guardião respirando, Minhau ainda não morreu.", "As long as a guardian still breathes, Minhau is not dead."), L("Fale baixo... os bandidos não podem saber quem eu sou.", "Speak softly... the bandits must not know who I am.")] },
  smith: { act: "forest", role: "shop", name: L("Ferreira Marta", "Marta the Smith"), title: L("Ferreira · Loja", "Blacksmith · Shop"), icon: "axe", sprite: "npc_smith",
    idle: [L("Dez anos de estrume. Dez! E ninguém aqui sabe o que é sabão.", "Ten years of manure. Ten! And nobody here knows what soap is."), L("Essas ferramentas vieram da corte real. Cuide bem do que eu forjar.", "These tools came from the royal court. Take good care of what I forge.")] },
  hunter: { act: "forest", role: "guide", name: L("Caçador Ivo", "Ivo the Hunter"), title: L("Caçador · Rastreador", "Hunter · Tracker"), icon: "bow", sprite: "npc_hunter",
    idle: [L("Conheço cada toca desta mata. E ultimamente elas andam cheias.", "I know every den in these woods. And lately they're full."), L("Pegada fresca não mente, guardião.", "A fresh track never lies, guardian.")] },
  // Act II: the swamp camp
  healer: { act: "swamp", role: "leader", name: L("Curandeira Nádia", "Nadia the Healer"), title: L("Líder do Acampamento", "Camp Leader"), icon: "staff", sprite: "npc_healer",
    idle: [L("O pântano cura e mata com as mesmas ervas.", "The swamp heals and kills with the same herbs."), L("Não beba da água parada, herói.", "Don't drink the still water, hero.")] },
  merchant: { act: "swamp", role: "shop", name: L("Mercador Osvaldo", "Osvaldo the Merchant"), title: L("Mercador · Loja", "Merchant · Shop"), icon: "amulet", sprite: "npc_merchant",
    idle: [L("Tudo tem preço, até no fim do mundo.", "Everything has a price, even at the end of the world."), L("Trouxe mercadoria de três reinos!", "I've brought goods from three kingdoms!")] },
  boatman: { act: "swamp", role: "guide", name: L("Barqueiro Tito", "Tito the Boatman"), title: L("Barqueiro", "Boatman"), icon: "staff", sprite: "npc_boatman",
    idle: [L("Conheço cada canal deste brejo.", "I know every channel of this marsh."), L("À noite, luzes dançam sobre a água. Não siga nenhuma.", "At night, lights dance over the water. Don't follow any.")] },
  // Act III: the mountain fort
  captain: { act: "peaks", role: "leader", name: L("Capitã Helena", "Captain Helena"), title: L("Comandante do Forte", "Fort Commander"), icon: "helm", sprite: "npc_captain",
    idle: [L("O forte ainda está de pé. Por enquanto.", "The fort still stands. For now."), L("Meus soldados viram mortos marchando na neve.", "My soldiers have seen the dead marching in the snow.")] },
  dwarf: { act: "peaks", role: "shop", name: L("Ferreiro Brum", "Brum the Smith"), title: L("Ferreiro · Loja", "Blacksmith · Shop"), icon: "axe", sprite: "npc_dwarf",
    idle: [L("Aço anão não quebra no frio.", "Dwarven steel doesn't break in the cold."), L("Barba congelada é barba de respeito!", "A frozen beard is a beard of respect!")] },
  seer: { act: "peaks", role: "guide", name: L("Vidente Lia", "Lia the Seer"), title: L("Vidente", "Seer"), icon: "amulet_silver", sprite: "npc_seer",
    idle: [L("Vejo sua sombra na torre... e ela ainda está de pé.", "I see your shadow in the tower... and it is still standing."), L("O cristal canta quando o Lich desperta.", "The crystal sings when the Lich awakens.")] },
};

export const npcsOf = (act: ZoneId) => (Object.keys(NPCS) as NpcId[]).filter((id) => NPCS[id].act === act);

export type Objective =
  | { type: "kill"; faction: Faction; count: number }
  | { type: "chests"; count: number }
  | { type: "dungeon"; count: number }
  | { type: "unique"; id: UniqueId; count: 1 }
  /** Several named bosses (any order). */
  | { type: "uniques"; ids: UniqueId[]; count: number }
  /** Quest objects found in the step's area (see QUEST_ITEMS): click one to pick it up. */
  | { type: "collect"; item: QuestItemId; count: number };

/** World-state flags set by the story; the village of Minhau changes with them. */
export type WorldFlag = "forge_lit" | "kira_home" | "dogs_home" | "polvo_broom" | "act1_clean" | "polvo_met" | "dogs_met";

/** Objects picked up for a quest. `where`: ruined huts around the village, or the area's enemy camps.
 * `keep`: the object stays where it is (the cauldron) and only what it held is taken. */
export const QUEST_ITEMS = {
  beam: { name: L("Viga de Carvalho", "Oak Beam"), sprite: "oak_beam", where: "ruins", tint: 0xb07a48, ms: 1600,
    verb: L("Soltando a viga...", "Prying the beam loose...") },
  tools: { name: L("Baú de Ferramentas Pesadas", "Heavy Tool Chest"), sprite: "tool_chest", where: "camps", tint: 0x8a8f9a, ms: 1800,
    verb: L("Arrombando o baú...", "Forcing the chest open...") },
  soap: { name: L("Fardo de Sabão de Lavanda Real", "Bale of Royal Lavender Soap"), sprite: "goblin_cauldron", where: "camps", tint: 0xb68aff, ms: 2200,
    verb: L("Pescando o sabão no caldeirão...", "Fishing the soap out of the cauldron..."), keep: true },
} as const satisfies Record<string, { name: string; sprite: SpriteName; where: "ruins" | "camps"; tint: number; ms: number; verb: string; keep?: boolean }>;
export type QuestItemId = keyof typeof QUEST_ITEMS;

export interface QuestStep {
  objective: Objective;
  goal: string; // short objective text for the tracker
  /** Area where the objective is: marked on the minimap and the world map. */
  area: AreaId;
  /** Extra enemies the step brings into its area (e.g. scouts prowling the village's south fence). */
  spawn?: { type: EnemyType; count: number; near: "south_fence" };
}

export interface Quest {
  id: string;
  giver: NpcId;
  /** Who takes the quest back (default: the giver), e.g. the next act's leader. */
  turnIn?: NpcId;
  title: string;
  intro: string[];
  /** Done in order; the quest is ready to turn in after the last one. */
  steps: QuestStep[];
  done: string[];
  /** A document found on the way, read after the turn-in (title + lines). */
  note?: { title: string; lines: string[] };
  reward: {
    xp: number; gold: number; potions: number; items: { rarity: Rarity; slot?: Slot; name?: string }[];
    flags?: WorldFlag[];
  };
}

/** Single-step quests are written flat; `steps` is filled in below. */
type QuestDef = Omit<Quest, "steps"> & ({ steps: QuestStep[] } | QuestStep);

/** Act I starts with the hero waking up in Aldo's hut (IntroScene); Aldo then gives the first quest. */
export const AWAKEN_HINT = L("Fale com o Rei Aldo (!) na praça da vila.", "Speak with King Aldo (!) in the village square.");

/** The story, in order. Each completed quest makes the world more dangerous. */
const QUEST_DEFS: QuestDef[] = [
  // ---------------- Act I: Minhau Forest
  {
    id: "ashes", giver: "aldo", title: L("As Cinzas da Coroa", "The Ashes of the Crown"),
    intro: [
      L("Os goblins estão testando os últimos limites das nossas paliçadas. Se a cerca cair, ninguém aqui sobrevive.", "The goblins are testing the last of our palisades. If the fence falls, no one here survives."),
      L("Minhas mãos velhas já não conseguem empunhar a espada real. Os goblins farejam a nossa fraqueza.", "My old hands can no longer wield the royal sword. The goblins smell our weakness."),
      L("Mostre a eles que o Primeiro Guardião de Minhau despertou. Abata os batedores da cerca sul...", "Show them that the First Guardian of Minhau has awakened. Cut down the scouts at the south fence..."),
      L("...e traga vigas de carvalho das cabanas desabadas para escorarmos a paliçada.", "...and bring oak beams from the collapsed huts so we can shore up the palisade."),
    ],
    steps: [
      { objective: { type: "kill", faction: "goblin", count: 8 }, goal: L("Abata os goblins batedores da cerca sul", "Slay the goblin scouts at the south fence"), area: "minhau",
        spawn: { type: "goblin", count: 8, near: "south_fence" } },
      { objective: { type: "collect", item: "beam", count: 4 }, goal: L("Recolha vigas de carvalho das cabanas desabadas", "Gather oak beams from the collapsed huts"), area: "minhau" },
    ],
    done: [
      L("Eles fugiram espantados! Havia dez anos que eu não via um goblin correr de medo nestas matas.", "They fled in terror! It has been ten years since I saw a goblin run scared in these woods."),
      L("Mas veja o que você arrancou da cintura daquele batedor... um panfleto selado com tinta vermelha.", "But look at what you tore from that scout's belt... a pamphlet sealed in red ink."),
    ],
    note: {
      title: L("Aviso de Notificação Fiscal", "Notice of Tax Assessment"),
      lines: [
        L("Toda couve e todo litro de leite recolhidos no perímetro da cerca devem ser entregues ao Gabinete Provisório.", "Every cabbage and every pint of milk gathered within the fence must be handed over to the Provisional Office."),
        L("Desobediência resultará em desapropriação via porrete goblin.", "Disobedience will result in expropriation by goblin club."),
        L("— Assinado: Lula, Presidente do Governo de Salvação Nacional", "— Signed: Lula, President of the Government of National Salvation"),
      ],
    },
    reward: { xp: 120, gold: 35, potions: 2, items: [{ rarity: "magic", slot: "boots", name: L("Perneiras de Couro Rústico", "Rustic Leather Leggings") }] },
  },
  {
    id: "soap", giver: "smith", title: L("Fogo, Ferro e Sabão", "Fire, Iron and Soap"),
    intro: [
      L("Se você vai encarar essa corja, não vai ser com essa lâmina cega!", "If you're going to face that rabble, it won't be with that dull blade!"),
      L("Aqueles vermes verdes levaram minhas marretas, meus alicates e o último lote de sabão de lavanda da Princesa Sarah!", "Those green worms took my hammers, my pliers and the last batch of Princess Sarah's lavender soap!"),
      L("Sabão, me ouviu?! Essa vila fede a estrume há dez anos, e eu me recuso a trabalhar num lugar que cheira a chiqueiro!", "Soap, you hear me?! This village has stunk of manure for ten years, and I refuse to work in a place that smells like a pigsty!"),
      L("Os baús estão nos acampamentos do Bosque dos Goblins. E o sabão... eles guardam num caldeirão. Não me pergunte por quê.", "The chests are in the camps of the Goblin Woods. And the soap... they keep it in a cauldron. Don't ask me why."),
    ],
    steps: [
      { objective: { type: "collect", item: "tools", count: 3 }, goal: L("Recupere os baús de ferramentas", "Recover the tool chests"), area: "goblin_woods" },
      { objective: { type: "collect", item: "soap", count: 1 }, goal: L("Recupere o sabão no caldeirão goblin", "Recover the soap from the goblin cauldron"), area: "goblin_woods" },
    ],
    done: [
      L("Minhas ferramentas! E o sabão ainda está seco!", "My tools! And the soap is still dry!"),
      L("Finalmente vou conseguir acender essa forja sem vomitar. Venha cá, deixe-me bater esse aço para você.", "At last I can light this forge without retching. Come here, let me hammer that steel for you."),
    ],
    reward: { xp: 200, gold: 60, potions: 2, items: [{ rarity: "rare", slot: "weapon" }], flags: ["forge_lit"] },
  },
  {
    id: "flea", giver: "smith", area: "goblin_woods", title: L("O Parasita das Sombras", "The Parasite of Shadows"),
    intro: [
      L("A forja acende, mas não respira. O fole real sumiu na noite do ataque.", "The forge lights, but it can't breathe. The royal bellows vanished the night of the attack."),
      L("Ivo viu goblins arrastando ele para a Casa Abandonada, no fundo do Bosque.", "Ivo saw goblins dragging it into the Abandoned House, deep in the Woods."),
      L("Dizem que a adega está infestada de parasitas que caíram do pelo daquele monstro. Leve fogo. E sabão.", "They say the cellar is crawling with parasites that fell from that monster's fur. Bring fire. And soap."),
    ],
    objective: { type: "dungeon", count: 1 },
    goal: L("Limpe a Casa Abandonada e resgate o fole", "Clear the Abandoned House and rescue the bellows"),
    done: [
      L("O Fole de Forja Real! Grudento, fedido... e inteiro!", "The Royal Forge Bellows! Sticky, smelly... and whole!"),
      L("Agora sim essa chaminé vai cuspir fumaça limpa. Volte quando quiser uma armadura de verdade.", "Now that chimney will breathe clean smoke. Come back whenever you want real armor."),
    ],
    reward: { xp: 320, gold: 90, potions: 2, items: [{ rarity: "rare", slot: "armor" }] },
  },
  {
    id: "kira", giver: "hunter", area: "wolf_wood", title: L("O Resgate da Guarda Desatenta", "Rescue of the Absent-Minded Guard"),
    intro: [
      L("Ouvi ganidos e rugidos na Mata dos Lobos. Pegadas gigantes, de pata branca.", "I heard yelps and roars in the Wolf Wood. Giant tracks, white paws."),
      L("Se for quem eu penso, é uma fera sagrada que escapou das ruínas do castelo. Os lobos vão despedaçá-la.", "If it's who I think, it's a sacred beast that escaped the castle ruins. The wolves will tear her apart."),
      L("Siga as pegadas e acabe com a matilha. Depressa.", "Follow the tracks and finish off the pack. Hurry."),
    ],
    objective: { type: "kill", faction: "beast", count: 5 },
    goal: L("Elimine a matilha selvagem da Mata dos Lobos", "Wipe out the wild pack in the Wolf Wood"),
    done: [
      L("Lady Kira! A husky da corte, viva depois de dez anos... e assistindo uma joaninha enquanto a matilha a cercava.", "Lady Kira! The court's husky, alive after ten years... watching a ladybug while the pack closed in."),
      L("Ela já foi trotando para a praça. Onde ela deita, a terra floresce. Você vai sentir.", "She's already trotted off to the square. Where she lies, the earth blooms. You'll feel it."),
    ],
    reward: { xp: 450, gold: 120, potions: 3, items: [{ rarity: "rare" }], flags: ["kira_home"] },
  },
  {
    id: "dogs", giver: "hunter", area: "wolf_wood", title: L("A Purificação dos Três Vira-Latas", "Cleansing the Three Mutts"),
    intro: [
      L("Lembra dos três vira-latas que guardavam os celeiros? Caramelo, Trovão e Mancha.", "Remember the three mutts who guarded the barns? Caramelo, Trovão and Mancha."),
      L("As tropas do Lula jogaram restos podres na mata. Os cães comeram e enlouqueceram de peste.", "Lula's thugs dumped rotten scraps in the woods. The dogs ate them and went mad with plague."),
      L("Não os mate se puder evitar... o Rei disse que o medalhão dele guarda a essência da princesa.", "Don't kill them if you can help it... the King says his medallion holds the princess's essence."),
    ],
    objective: { type: "uniques", ids: ["caramelo", "trovao", "mancha"], count: 3 },
    goal: L("Derrote Caramelo, Trovão e Mancha", "Defeat Caramelo, Trovão and Mancha"),
    done: [
      L("Olhe para eles! Abanando o rabo, correndo em formação para os portões.", "Look at them! Wagging their tails, running in formation to the gates."),
      L("Com esses três de vigia, nenhum goblin se aproxima da vila de novo.", "With those three on watch, no goblin comes near the village again."),
    ],
    reward: { xp: 600, gold: 160, potions: 3, items: [{ rarity: "rare" }, { rarity: "magic" }], flags: ["dogs_home"] },
  },
  {
    id: "polvo", giver: "aldo", area: "bandit_road", title: L("O Impeachment no Machado", "Impeachment by Axe"),
    intro: [
      L("Lula montou um palanque sobre três carroças viradas na antiga Alfândega Real.", "Lula has built a podium on three overturned carts at the old Royal Customs House."),
      L("Ele extorque quem tenta fugir ou comerciar. Chama isso de governo.", "He extorts anyone who tries to flee or trade. He calls it government."),
      L("Os capangas dele barricaram a Alfândega com carroças e estacas. Até hoje ninguém passou. Você vai passar.", "His thugs barred the Customs House with carts and stakes. No one has got through. You will."),
      L("Chegou a hora de destituir o falso presidente. Traga-o vivo, guardião.", "The time has come to remove the false president. Bring him back alive, guardian."),
    ],
    objective: { type: "unique", id: "polvo", count: 1 },
    goal: L("Derrote Lula, o Demagogo do Lamaçal", "Defeat Lula, the Demagogue of the Mire"),
    done: [
      L("Neste reino, canalhas não ganham forca nem martírio. Ganham vassoura.", "In this kingdom, scoundrels get neither the noose nor martyrdom. They get a broom."),
      L("Ele passou dez anos cobrando pedágio sobre a miséria do meu povo. Agora vai aprender o valor de um chão limpo.", "He spent ten years charging tolls on my people's misery. Now he'll learn the value of a clean floor."),
    ],
    reward: { xp: 800, gold: 300, potions: 3, items: [{ rarity: "rare" }, { rarity: "rare" }], flags: ["polvo_broom"] },
  },
  {
    id: "grumm", giver: "aldo", area: "goblin_hollow", title: L("O Trono de Sucata e a Tiara de Sarah", "The Junk Throne and Sarah's Tiara"),
    intro: [
      L("Sem o dinheiro do Lula, os goblins se refugiaram no coração da floresta.", "Without Lula's money, the goblins have retreated to the heart of the forest."),
      L("Grumm, o Rei dos Catadores, guarda o maior troféu do saque de dez anos atrás: a tiara de flores e ouro da minha Sarah.", "Grumm, the King of Scavengers, keeps the greatest trophy of the sacking ten years ago: my Sarah's tiara of flowers and gold."),
      L("Traga-a de volta, guardião. Ela é tudo o que me resta dela.", "Bring it back, guardian. It's all I have left of her."),
    ],
    objective: { type: "unique", id: "grumm", count: 1 },
    goal: L("Derrote Grumm, o Rei dos Catadores", "Defeat Grumm, the King of Scavengers"),
    done: [
      L("A tiara... as rosas floresceram de novo. E essa voz... era a minha menina.", "The tiara... the roses have bloomed again. And that voice... it was my girl."),
      L("Minha filha ainda vive. Dez anos no cativeiro e a luz dela ainda queima as trevas.", "My daughter is still alive. Ten years in captivity and her light still burns through the dark."),
      L("O pântano ao sul virou o quintal de dejetos daquele monstro. Vá... encontre minha menina. E traga o coração de Minhau para casa.", "The swamp to the south has become that monster's dung yard. Go... find my girl. And bring the heart of Minhau home."),
    ],
    reward: { xp: 1000, gold: 500, potions: 4, items: [{ rarity: "unique" }], flags: ["act1_clean"] },
  },
  // ---------------- Act II: the Shadow Swamp (old story, to be rewritten)
  {
    id: "swamp", area: "sunken_ruins", turnIn: "healer", giver: "aldo", title: L("O Pântano Sombrio", "The Shadow Swamp"),
    intro: [
      L("Grumm fugiu ganindo para o sul, para o Pântano Sombrio. A luz da tiara aponta para lá.", "Grumm fled south, whimpering, into the Shadow Swamp. The tiara's light points there."),
      L("Lá, os mortos não descansam. Esqueletos marcham entre as árvores podres.", "There, the dead do not rest. Skeletons march among the rotting trees."),
      L("A trilha ao norte da Clareira agora está aberta. No pântano há um acampamento; procure a curandeira Nádia.", "The trail north of the Hollow is open now. There is a camp in the swamp; look for Nadia the healer."),
      L("Destrua 15 mortos-vivos e descubra o que os desperta.", "Destroy 15 undead and find out what is raising them."),
    ],
    objective: { type: "kill", faction: "undead", count: 15 },
    goal: L("Destrua mortos-vivos no Pântano", "Destroy undead in the Swamp"),
    done: [L("Aldo mandou você? Então é verdade: ossos que andam... isso é magia antiga.", "Aldo sent you? Then it's true: walking bones... this is ancient magic."), L("Tito, o barqueiro, tem notícias de uma fera que manda no pântano. Fale com ele.", "Tito, the boatman, has news of a beast that rules the swamp. Talk to him.")],
    reward: { xp: 1400, gold: 600, potions: 3, items: [{ rarity: "epic" }] },
  },
  {
    id: "gorlak", area: "gorlak_lair", giver: "boatman", title: L("A Fera do Pântano", "The Swamp Beast"),
    intro: [
      L("Gorlak. Um troll do tamanho de uma casa, que arranca árvores para usar como clava.", "Gorlak. A troll the size of a house, who tears up trees to use as clubs."),
      L("Ele guarda o coração do pântano. Quando ele bater o chão, CORRA (use a esquiva!).", "He guards the heart of the swamp. When he pounds the ground, RUN (use your dodge!)."),
    ],
    objective: { type: "unique", id: "gorlak", count: 1 },
    goal: L("Derrote Gorlak, o Troll do Pântano", "Defeat Gorlak, the Swamp Troll"),
    done: [L("Você derrubou o Gorlak?! As canções vão falar disso por anos.", "You brought down Gorlak?! The songs will speak of this for years."), L("No covil dele achei runas de gelo. Elas apontam para os Picos Gelados. Mostre ao Osvaldo, ele conhece runas.", "In his lair I found frost runes. They point to the Frozen Peaks. Show them to Osvaldo, he knows runes.")],
    reward: { xp: 2000, gold: 900, potions: 4, items: [{ rarity: "legendary" }] },
  },
  {
    id: "dungeon", area: "frozen_trail", turnIn: "captain", giver: "merchant", title: L("As Casas Abandonadas", "The Abandoned Houses"),
    intro: [
      L("Essas runas... meu avô falava delas. Vêm dos Picos Gelados, onde vive um necromante antigo.", "These runes... my grandfather spoke of them. They come from the Frozen Peaks, where an ancient necromancer dwells."),
      L("A passagem ao norte do covil de Gorlak leva ao Forte da Montanha. Nas terras dele existem casas abandonadas que descem para masmorras.", "The pass north of Gorlak's lair leads to the Mountain Fort. In his lands there are abandoned houses that lead down into dungeons."),
      L("Limpe uma dessas masmorras e leve o que o chefe guardava à Capitã Helena, no forte.", "Clear one of those dungeons and bring what its master was guarding to Captain Helena, at the fort."),
    ],
    objective: { type: "dungeon", count: 1 },
    goal: L("Derrote o chefe de uma masmorra", "Defeat a dungeon boss"),
    done: [L("Osvaldo mandou você? Pelos deuses, que cheiro de cripta! Mas é disto que precisávamos.", "Osvaldo sent you? By the gods, you reek of the crypt! But this is what we needed."), L("Fique com esta arma do arsenal do forte. E fale comigo de novo: sei onde o necromante se esconde.", "Take this weapon from the fort's armory. And talk to me again: I know where the necromancer hides.")],
    reward: { xp: 2600, gold: 1200, potions: 4, items: [{ rarity: "legendary", slot: "weapon" }] },
  },
  {
    id: "malakar", area: "malakar_tower", giver: "captain", title: L("Malakar, o Lich", "Malakar the Lich"),
    intro: [
      L("Malakar. Um mago que trocou a alma pela imortalidade, séculos atrás.", "Malakar. A mage who traded his soul for immortality, centuries ago."),
      L("Foi ele quem despertou os mortos e enlouqueceu os goblins. Ele vive na torre além do Cemitério de Gelo.", "It was he who raised the dead and drove the goblins mad. He dwells in the tower beyond the Ice Graveyard."),
      L("Destrua o Lich, herói. É a última esperança de Minhau.", "Destroy the Lich, hero. You are Minhau's last hope."),
    ],
    objective: { type: "unique", id: "malakar", count: 1 },
    goal: L("Destrua Malakar, o Lich", "Destroy Malakar the Lich"),
    done: [
      L("O frio se foi... o Lich não existe mais!", "The cold is gone... the Lich is no more!"),
      L("Você salvou não só Minhau, mas o reino inteiro. Fique com o tesouro mais precioso do forte.", "You saved not just Minhau, but the whole kingdom. Take the fort's most precious treasure."),
    ],
    reward: { xp: 4000, gold: 3000, potions: 5, items: [{ rarity: "unique" }, { rarity: "legendary" }] },
  },
];

export const QUESTS: Quest[] = QUEST_DEFS.map((q) => ("steps" in q ? q : { ...q, steps: [{ objective: q.objective, goal: q.goal, area: q.area }] }) as Quest);

export const EPILOGUE = [
  L("E assim a vila Minhau voltou a dormir em paz.", "And so the village of Minhau slept in peace once more."),
  L("Mas nas profundezas da floresta, algo antigo despertou com o sangue derramado...", "But deep in the forest, something ancient awoke with the blood that was spilled..."),
  L("Os inimigos continuam ficando mais fortes. Até onde você consegue ir?", "The enemies keep growing stronger. How far can you go?"),
];
