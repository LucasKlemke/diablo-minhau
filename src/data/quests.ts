import type { Rarity, Slot } from "./items";
import type { Faction, UniqueId } from "./enemies";

export type NpcId = "elder" | "smith" | "hunter";

export const NPCS: Record<NpcId, { name: string; sprite: "npc_elder" | "npc_smith" | "npc_hunter"; idle: string[] }> = {
  elder: { name: "Ancião Bento", sprite: "npc_elder", idle: ["Que a luz guie seus passos, herói.", "A vila Minhau já viu dias melhores..."] },
  smith: { name: "Ferreira Marta", sprite: "npc_smith", idle: ["Aço bom é aço testado em goblin.", "Volte quando precisar de uma lâmina afiada."] },
  hunter: { name: "Caçador Ivo", sprite: "npc_hunter", idle: ["As trilhas estão cheias de pegadas estranhas.", "Fique atento à estrada. Bandidos não dormem."] },
};

export type Objective =
  | { type: "kill"; faction: Faction; count: number }
  | { type: "chests"; count: number }
  | { type: "dungeon"; count: number }
  | { type: "unique"; id: UniqueId; count: 1 };

export interface Quest {
  id: string;
  giver: NpcId;
  title: string;
  intro: string[];
  objective: Objective;
  goal: string; // short objective text for the tracker
  done: string[];
  reward: { xp: number; gold: number; potions: number; items: { rarity: Rarity; slot?: Slot }[] };
}

export const PROLOGUE = [
  "Há gerações, a vila Minhau vive em paz entre campos e florestas.",
  "Até que, numa noite sem lua, tambores de guerra ecoaram na mata. Os goblins voltaram.",
  "Atraído pelos boatos, você chega à vila. O Ancião Bento espera na praça.",
];

/** The story, in order. Each completed quest makes the world more dangerous. */
export const QUESTS: Quest[] = [
  {
    id: "goblins", giver: "elder", title: "Os Goblins na Porta",
    intro: [
      "Graças aos céus, um aventureiro! Os goblins cercam a vila há dias.",
      "Eles roubam nossas colheitas e atacam quem sai da cerca.",
      "Mate 10 goblins na floresta e mostre que Minhau ainda sabe se defender.",
    ],
    objective: { type: "kill", faction: "goblin", count: 10 },
    goal: "Mate goblins",
    done: ["Você voltou inteiro! E coberto de sangue de goblin...", "Tome isto. É pouco, mas é tudo o que a vila pode dar. Fale com a Marta, ela precisa de ajuda."],
    reward: { xp: 150, gold: 50, potions: 2, items: [{ rarity: "magic" }] },
  },
  {
    id: "chests", giver: "smith", title: "Ferramentas Roubadas",
    intro: [
      "Ah, o famoso matador de goblins. Escute: aqueles ladrõezinhos levaram minhas ferramentas.",
      "Eles escondem o que roubam em baús espalhados pela mata.",
      "Abra 3 baús e traga minhas coisas de volta. Eu forjo algo bom para você.",
    ],
    objective: { type: "chests", count: 3 },
    goal: "Abra baús na floresta",
    done: ["Minhas ferramentas! Um pouco amassadas, mas servem.", "Como prometido: uma arma forjada com carinho. O Ivo andou falando de bandidos na estrada..."],
    reward: { xp: 250, gold: 80, potions: 2, items: [{ rarity: "rare", slot: "weapon" }] },
  },
  {
    id: "bandits", giver: "hunter", title: "Sombras na Estrada",
    intro: [
      "Não são só goblins. Homens de bandana vermelha saqueiam as caravanas.",
      "Os bandidos acampam longe da vila, perto das estradas. Os brutos deles são enormes.",
      "Elimine 12 bandidos. Vamos ver se eles continuam tão corajosos.",
    ],
    objective: { type: "kill", faction: "bandit", count: 12 },
    goal: "Mate bandidos",
    done: ["Encontrei isto num dos corpos: um mapa com a marca de um tal Krag.", "Ele lidera os bandidos e paga os goblins com aço. Precisamos dele morto."],
    reward: { xp: 400, gold: 150, potions: 3, items: [{ rarity: "rare" }] },
  },
  {
    id: "krag", giver: "hunter", title: "O Esmaga-Crânios",
    intro: [
      "Marquei no seu mapa o acampamento do Krag. Siga a marca vermelha.",
      "Dizem que ele esmagou um cavalo com uma só pancada. Não deixe ele te acertar.",
    ],
    objective: { type: "unique", id: "krag", count: 1 },
    goal: "Derrote Krag, o Esmaga-Crânios",
    done: ["Krag está morto?! Você é mais louco do que eu pensava.", "Com ele fora do caminho, os goblins perderam as armas. Volte ao Ancião: é hora de acabar com isso."],
    reward: { xp: 600, gold: 300, potions: 3, items: [{ rarity: "rare" }, { rarity: "magic" }] },
  },
  {
    id: "grumm", giver: "elder", title: "O Rei Goblin",
    intro: [
      "Então foi o Krag que armou os goblins... mas quem os comanda é Grumm, o Rei Goblin.",
      "Ele se esconde no acampamento mais distante da floresta. Marquei-o no seu mapa.",
      "Acabe com Grumm e Minhau estará livre. Mas cuidado: a mata ficou mais perigosa.",
    ],
    objective: { type: "unique", id: "grumm", count: 1 },
    goal: "Derrote Grumm, o Rei Goblin",
    done: [
      "A coroa do Rei Goblin! Você conseguiu!",
      "Os tambores se calaram. Pela primeira vez em semanas, as crianças brincam fora da cerca.",
      "Minhau nunca esquecerá seu nome, herói. Fique com isto: um tesouro da vila.",
    ],
    reward: { xp: 1000, gold: 500, potions: 4, items: [{ rarity: "unique" }] },
  },
  {
    id: "swamp", giver: "elder", title: "O Pântano Sombrio",
    intro: [
      "Grumm está morto, mas os goblins não fugiram para a mata... fugiram para o Pântano Sombrio.",
      "Lá, os mortos não descansam. Esqueletos marcham entre as árvores podres.",
      "O Portal de Pedra na praça agora leva até lá. Destrua 15 mortos-vivos e descubra o que os desperta.",
    ],
    objective: { type: "kill", faction: "undead", count: 15 },
    goal: "Destrua mortos-vivos no Pântano",
    done: ["Ossos que andam... isso é magia antiga.", "Ivo tem notícias de uma fera que manda no pântano. Fale com ele."],
    reward: { xp: 1400, gold: 600, potions: 3, items: [{ rarity: "epic" }] },
  },
  {
    id: "gorlak", giver: "hunter", title: "A Fera do Pântano",
    intro: [
      "Gorlak. Um troll do tamanho de uma casa, que arranca árvores para usar como clava.",
      "Ele guarda o coração do pântano. Quando ele bater o chão, CORRA (use a esquiva!).",
    ],
    objective: { type: "unique", id: "gorlak", count: 1 },
    goal: "Derrote Gorlak, o Troll do Pântano",
    done: ["Você derrubou o Gorlak?! As canções vão falar disso por anos.", "No covil dele achei runas de gelo. Elas apontam para os Picos Gelados. Fale com a Marta."],
    reward: { xp: 2000, gold: 900, potions: 4, items: [{ rarity: "legendary" }] },
  },
  {
    id: "dungeon", giver: "smith", title: "As Casas Abandonadas",
    intro: [
      "Essas runas... meu avô falava delas. Vêm dos Picos Gelados, onde vive um necromante antigo.",
      "O portal agora alcança os picos. Nas terras dele existem casas abandonadas que descem para masmorras.",
      "Limpe uma dessas masmorras e traga o que o chefe de lá guardava. Precisamos saber como ele pensa.",
    ],
    objective: { type: "dungeon", count: 1 },
    goal: "Derrote o chefe de uma masmorra",
    done: ["Pelos deuses, que cheiro de cripta! Mas isso é o que eu precisava.", "Vou forjar algo à altura. Agora vá: o Ancião sabe onde o necromante se esconde."],
    reward: { xp: 2600, gold: 1200, potions: 4, items: [{ rarity: "legendary", slot: "weapon" }] },
  },
  {
    id: "malakar", giver: "elder", title: "Malakar, o Lich",
    intro: [
      "Malakar. Um mago que trocou a alma pela imortalidade, séculos atrás.",
      "Foi ele quem despertou os mortos e enlouqueceu os goblins. Ele vive no ponto mais distante dos Picos Gelados.",
      "Destrua o Lich, herói. É a última esperança de Minhau.",
    ],
    objective: { type: "unique", id: "malakar", count: 1 },
    goal: "Destrua Malakar, o Lich",
    done: [
      "O frio se foi... o Lich não existe mais!",
      "Você salvou não só Minhau, mas o reino inteiro. Fique com o tesouro mais precioso da vila.",
    ],
    reward: { xp: 4000, gold: 3000, potions: 5, items: [{ rarity: "unique" }, { rarity: "legendary" }] },
  },
];

export const EPILOGUE = [
  "E assim a vila Minhau voltou a dormir em paz.",
  "Mas nas profundezas da floresta, algo antigo despertou com o sangue derramado...",
  "Os inimigos continuam ficando mais fortes. Até onde você consegue ir?",
];
