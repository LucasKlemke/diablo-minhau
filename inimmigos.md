# Novos inimigos — Diablo Minhau

Lista organizada por **zona do jogo**, já pensada para o motor atual (`src/data/enemies.ts`): cada mob tem facção,
papel no combate, a mecânica que pede e uma ficha inicial de números no mesmo formato do `EnemyDef`.

## Como ler

- **Facção** decide em quais acampamentos ele aparece (`camps` em `zones.ts`) e qual missão de matar ele conta.
  As atuais são `goblin`, `bandit`, `undead` e `spider`; os novos pedem `beast` (animais) e `swamp` (criaturas do pântano).
- **Mecânica**: ✅ o motor já faz · 🛠️ precisa de código novo (lista no fim).
- **Ficha**: `hp`, `dmgMin`, `dmgMax` e `xp` são `[base, por nível]`, como nos inimigos atuais. São um ponto de partida para testar,
  não valores finais.
- **Prioridade**: ⭐⭐⭐ fazer primeiro (variedade grande com pouco código) · ⭐⭐ depois · ⭐ quando sobrar tempo.

### Referência: o que já existe

| Inimigo | Facção | hp | dano | vel. | papel |
|---|---|---|---|---|---|
| Goblin | goblin | 18 / +11 | 1–3 | 55 | corpo a corpo fraco, em bando |
| Bandido | bandit | 30 / +13 | 2–4 | 64 | corpo a corpo médio |
| Bandido Bruto | bandit | 90 / +30 | 5–9 | 44 | tanque lento |
| Esqueleto | undead | 26 / +12 | 2–4 | 50 | corpo a corpo médio |
| Aranha das Cavernas | spider | 16 / +9 | 2–3 | 78 | rápida e frágil |
| Troll do Pântano | goblin | 140 / +40 | 8–14 | 40 | mini-chefe |
| Lich | undead | 110 / +32 | 6–10 | 46 | conjurador à distância |

---

## Ato I — Floresta de Minhau (níveis 1–8)

| Mob | Facção | Papel | Mecânica | Prioridade |
|---|---|---|---|---|
| **Lobo Cinzento** | beast | rápido, em matilha | 🛠️ bônus de dano quando 2+ atacam o mesmo alvo | ⭐⭐⭐ |
| **Lobo Alfa** | beast | campeão da matilha | 🛠️ uivo: acelera a matilha; ao morrer os lobos fogem | ⭐⭐ |
| **Javali Selvagem** | beast | investida | ✅ `charge` (já usado por chefes) num mob comum | ⭐⭐⭐ |
| **Vespa Gigante** | beast | voa, irrita | 🛠️ veneno (dano ao longo do tempo); ✅ rápida e frágil | ⭐⭐ |
| **Gosma (Slime)** | — (neutro) | divide ao morrer | 🛠️ ao morrer vira 2 gosmas menores | ⭐⭐⭐ |
| **Cavaleiro de Worg** | goblin | goblin montado em lobo | ✅ só números (rápido + forte); liga goblins e lobos | ⭐⭐ |
| **Ent Jovem** | beast | emboscada | 🛠️ parado igual às árvores do mapa até o herói chegar perto | ⭐⭐ |
| **Mímico** | — | baú falso | 🛠️ um dos baús do mapa vira inimigo ao ser aberto | ⭐⭐⭐ |

**Fichas sugeridas**
```ts
wolf:     { hp: [14, 9],  dmgMin: [1, 1.1], dmgMax: [3, 1.7], speed: 82, reach: 16, hitRange: 24, cooldown: 1000, xp: [8, 4],  flinch: 0.55, aggro: 160, body: 5, height: 16 },
alpha:    { hp: [40, 16], dmgMin: [3, 1.6], dmgMax: [6, 2.4], speed: 80, reach: 18, hitRange: 28, cooldown: 1200, xp: [25, 10], flinch: 0.3,  aggro: 170, body: 6, height: 20 },
boar:     { hp: [34, 14], dmgMin: [3, 1.5], dmgMax: [6, 2.2], speed: 50, reach: 18, hitRange: 26, cooldown: 1600, xp: [14, 6], flinch: 0.3,  aggro: 130, body: 6, height: 18 },
wasp:     { hp: [10, 6],  dmgMin: [1, 0.8], dmgMax: [2, 1.2], speed: 95, reach: 14, hitRange: 22, cooldown: 800,  xp: [6, 3],  flinch: 0.7,  aggro: 150, body: 4, height: 12 },
slime:    { hp: [24, 10], dmgMin: [1, 1.0], dmgMax: [3, 1.5], speed: 38, reach: 15, hitRange: 22, cooldown: 1400, xp: [7, 4],  flinch: 0.6,  aggro: 100, body: 6, height: 12 },
mimic:    { hp: [60, 20], dmgMin: [4, 2.0], dmgMax: [8, 3.0], speed: 60, reach: 18, hitRange: 28, cooldown: 1300, xp: [30, 12], flinch: 0.2,  aggro: 60,  body: 7, height: 18 },
```

---

## Ato II — Pântano Sombrio (níveis 8–13)

| Mob | Facção | Papel | Mecânica | Prioridade |
|---|---|---|---|---|
| **Zumbi** | undead | lento e resistente, em grupo | ✅ só números | ⭐⭐⭐ |
| **Carniçal (Ghoul)** | undead | rápido, paralisa | 🛠️ golpe atordoa o herói por ~0,6 s | ⭐⭐ |
| **Homem-Lagarto** | swamp | lanceiro; alguns arremessam dardos | ✅ ataque à distância como o Lich (`reach` alto) | ⭐⭐⭐ |
| **Sanguessuga Gigante** | swamp | escondida na lama, drena vida | 🛠️ emboscada + cura ao acertar | ⭐ |
| **Fogo-Fátuo** | swamp | luz que flutua e foge | 🛠️ mantém distância; explode se encostar | ⭐⭐ |
| **Cultista** | bandit | humano conjurador | ✅ projéteis como o Lich, com menos vida | ⭐⭐⭐ |

**Fichas sugeridas**
```ts
zombie:   { hp: [48, 16], dmgMin: [3, 1.5], dmgMax: [6, 2.2], speed: 34, reach: 18, hitRange: 26, cooldown: 1700, xp: [13, 6], flinch: 0.15, aggro: 110, body: 6, height: 30 },
ghoul:    { hp: [30, 12], dmgMin: [3, 1.6], dmgMax: [5, 2.2], speed: 76, reach: 17, hitRange: 26, cooldown: 1100, xp: [14, 6], flinch: 0.4,  aggro: 140, body: 5, height: 28 },
lizard:   { hp: [36, 14], dmgMin: [3, 1.6], dmgMax: [6, 2.3], speed: 60, reach: 26, hitRange: 36, cooldown: 1300, xp: [15, 7], flinch: 0.35, aggro: 140, body: 5, height: 32 },
cultist:  { hp: [24, 10], dmgMin: [3, 1.6], dmgMax: [6, 2.4], speed: 50, reach: 140, hitRange: 0, cooldown: 1800, xp: [15, 7], flinch: 0.5,  aggro: 180, body: 5, height: 30 },
```

---

## Ato III — Picos Gelados (níveis 13+)

| Mob | Facção | Papel | Mecânica | Prioridade |
|---|---|---|---|---|
| **Hobgoblin** | goblin | soldado disciplinado, lidera goblins | 🛠️ goblins perto dele ganham dano | ⭐⭐ |
| **Orc** | goblin | goblin "adulto", forte | ✅ só números | ⭐⭐⭐ |
| **Lobo Sombrio** | beast | some na escuridão | 🛠️ semitransparente até atacar | ⭐ |
| **Armadura Animada** | undead | guarda lento, armadura alta | 🛠️ reduz dano físico; magia passa | ⭐⭐ |
| **Fantasma** | undead | atravessa obstáculos | 🛠️ sem colisão com o cenário; reduz dano físico | ⭐⭐ |
| **Gárgula** | undead | estátua que acorda | 🛠️ parada e invulnerável até o herói chegar perto | ⭐⭐ |

**Fichas sugeridas**
```ts
orc:      { hp: [70, 22], dmgMin: [5, 2.2], dmgMax: [9, 3.2], speed: 52, reach: 20, hitRange: 30, cooldown: 1500, xp: [22, 9], flinch: 0.2,  aggro: 140, body: 6, height: 36 },
hobgob:   { hp: [55, 18], dmgMin: [4, 2.0], dmgMax: [7, 2.8], speed: 58, reach: 22, hitRange: 32, cooldown: 1300, xp: [20, 8], flinch: 0.25, aggro: 150, body: 5, height: 32 },
armor:    { hp: [90, 26], dmgMin: [6, 2.4], dmgMax: [10, 3.4], speed: 36, reach: 22, hitRange: 34, cooldown: 1900, xp: [28, 11], flinch: 0.05, aggro: 120, body: 7, height: 36 },
ghost:    { hp: [32, 12], dmgMin: [4, 2.0], dmgMax: [7, 2.6], speed: 58, reach: 17, hitRange: 26, cooldown: 1200, xp: [18, 8], flinch: 0.3,  aggro: 160, body: 5, height: 30 },
```

---

## Masmorras (qualquer ato)

| Mob | Onde | Papel | Mecânica | Prioridade |
|---|---|---|---|---|
| **Morcego Gigante** | cavernas | bando rápido no escuro | ✅ rápido e frágil, em grupos de 5–8 | ⭐⭐⭐ |
| **Formiga Soldado** | formigueiro | resistente, em grupo | ✅ só números | ⭐⭐ |
| **Besouro Carapaça** | formigueiro / cavernas | lento, armadura altíssima | 🛠️ reduz dano físico | ⭐ |
| **Centopeia das Profundezas** | cavernas | sai da terra | 🛠️ emboscada enterrada | ⭐ |
| **Cubo Gelatinoso** | corredores | quase invisível, guarda itens | 🛠️ semitransparente; dropa vários itens | ⭐ |
| **Kobold** | covis | fraco, deixa armadilhas | 🛠️ armadilhas no chão | ⭐ |

Variações do que já existe: a **Aranha Gigante** pode ganhar teia (deixa o herói lento) e o **Troll** pode regenerar vida,
parando só quando toma dano de fogo.

---

## Novos chefes (`UNIQUES`)

| Chefe | Ato / lugar | Base | Habilidades (✅ já existem) |
|---|---|---|---|
| **Presa-Negra, o Worg Alfa** | I, floresta | lobo alfa | ✅ `charge`, ✅ `summon` lobos |
| **Rainha Formiga** | masmorra do formigueiro | formiga | ✅ `summon` formigas, ✅ `bolts` (ácido) |
| **Bruxa do Pântano** | II, pântano | cultista | ✅ `bolts`, ✅ `summon` zumbis, ✅ `slam` |
| **Necromante** | II ou III | cultista | ✅ `summon` esqueletos e zumbis, ✅ `shockwave` |
| **Ogro** | I → II | bruto | ✅ `slam`, ✅ `charge` |
| **Mantícora** | III | fera grande | ✅ `bolts` (espinhos), ✅ `charge` |
| **Dragão Jovem** | final do Ato III | fera enorme | ✅ `bolts` (fogo), ✅ `slam`, ✅ `shockwave` |

---

## Ordem sugerida

1. **Só números (sem código novo):** Zumbi, Orc, Cultista, Homem-Lagarto, Morcego, Cavaleiro de Worg, Javali (com `charge`).
   Cada um é uma entrada no `ENEMIES`, um sprite no SpriteKiln e a facção nos acampamentos.
2. **Uma mecânica nova cada:** Lobo (matilha), Gosma (divide), Mímico (baú falso).
3. **Chefes:** Worg Alfa e Bruxa do Pântano, montados só com habilidades que já existem.
4. **Mecânicas maiores:** resistência a dano físico (Armadura, Fantasma, Besouro), emboscadas (Ent, Gárgula,
   Centopeia, Sanguessuga), veneno e atordoamento no herói.

### Mecânicas 🛠️ que precisam de código

| Mecânica | Usada por |
|---|---|
| Bônus de matilha / aura de líder | Lobo, Lobo Alfa, Hobgoblin |
| Dividir ao morrer | Gosma |
| Baú falso | Mímico |
| Veneno (dano ao longo do tempo) | Vespa, Aranha |
| Atordoar / deixar o herói lento | Carniçal, Aranha (teia) |
| Emboscada (escondido até chegar perto) | Ent, Gárgula, Centopeia, Sanguessuga |
| Resistência a dano físico | Armadura Animada, Fantasma, Besouro |
| Fugir / manter distância | Fogo-Fátuo, matilha sem o alfa |
| Regeneração | Troll |
| Sem colisão com o cenário | Fantasma |

### Ficaram de fora

Ideias boas para RPG de mesa, mas que dependem de diálogo e não de combate: Dríade Corrompida (purificar),
Ogro que negocia comida, Homens-Lagarto aliados, Mercenários que trocam de lado e Fantasma com assunto pendente.
O **Basilisco** (olhar que petrifica) também fica de fora, porque num jogo de clique não dá para "desviar o olhar".
