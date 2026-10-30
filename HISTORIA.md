# Chronicles of Minhau — História

Contexto narrativo do jogo: premissa, personagens, os três atos e onde cada parte da história acontece.
Tudo aqui vem do que já está no código (`src/data/quests.ts`, `src/data/zones.ts`, `src/data/enemies.ts`,
`src/scenes/IntroScene.ts`, `src/game/arrival.ts`). Ao mudar a história, atualize os dois lados.

## Premissa

Há gerações a **vila Minhau** vive em paz entre campos e florestas. Numa noite sem lua, tambores de guerra
ecoam na mata: **Grumm, o Rei Goblin**, reuniu sua horda e escolheu Minhau como alvo. O **Ancião Bento** vê a
fumaça subir da floresta e reza por um herói.

Um aventureiro atraído pelos boatos chega pela estrada da floresta. Ao longo de três atos ele descobre que os
goblins são só o começo: um bandido os arma, mortos-vivos despertam no pântano e, por trás de tudo, está
**Malakar, o Lich**, um mago que trocou a alma pela imortalidade séculos atrás. Foi ele quem despertou os mortos
e enlouqueceu os goblins.

## O herói

O jogador escolhe uma de quatro classes na fogueira. Cada uma tem sua própria fala de chegada:

| Classe | Estilo | Fala de chegada |
|---|---|---|
| **Bárbaro** | Guerreiro brutal, muita vida e armadura, ganha Fúria ao acertar | "Das terras do norte, um bárbaro ouviu o chamado da guerra." |
| **Arqueiro** | Ágil e certeiro, ataca de longe, muitos críticos | "Um arqueiro que nunca errou um alvo seguiu o rastro da fumaça." |
| **Mago** | Mestre do fogo, gelo e raio; frágil, devastador em área | "Um mago errante sentiu no ar o cheiro de magia sombria." |
| **Feiticeiro** | Conjurador sombrio: drena vida, espalha pragas, explode cadáveres | "Um feiticeiro de olhar verde sorriu. Havia almas a colher." |

## Abertura (cinemática)

1. **Tela preta** — "Há gerações, a vila Minhau vivia em paz entre campos e florestas."
2. **Acampamento goblin, à noite** — goblins dançam em volta da fogueira, tambores. Grumm, maior e dourado,
   ergue a arma e a horda grita.
3. **A vila ao entardecer** — o Ancião Bento olha a fumaça sobre a floresta; o sino toca.
4. **Chegada (dentro do jogo, no mapa real)** — o herói sobe a estrada, é emboscado por três goblins e os mata
   com o ataque da classe. "A estrada para Minhau estava tomada. E a vila precisava dele." Ele olha para a
   vila, faz o golpe característico da classe, aparece o título *Chronicles of Minhau* e: "E assim começa a
   sua lenda." O controle passa ao jogador ali mesmo.
5. **Defesa da vila** — Bento recebe o herói ("Os goblins estão atacando a vila!"). Três ondas de goblins
   entram pelos portões norte, oeste e leste. Vencida a defesa, Bento agradece e faz o primeiro pedido.

---

## Ato I — Floresta de Minhau

Floresta verde, campos e estradas. Inimigos: goblins, cavaleiros de worg, bandidos, javalis, vespas, gosmas,
ents e lobos.

### Lugares

| Área | Nível | O que é |
|---|---|---|
| **Vila de Minhau** | 1 | Vila inicial com os NPCs do ato e checkpoint |
| **Bosque dos Goblins** | 2 | Mata cheia de acampamentos goblin. Masmorra: *Casa Abandonada* (Aranha Rainha) |
| **Estrada dos Bandidos** | 4 | Estrada das caravanas, acampamentos de bandana vermelha. Chefe: Krag. Masmorra: *Porão do Açougueiro* (O Açougueiro) |
| **Mata dos Lobos** | 5 | Território de feras. Chefe: Presa-Negra. Masmorra: *Caverna dos Morcegos* (Brugo, o Ogro) |
| **Clareira do Rei Goblin** | 6 | Covil de Grumm, depois da Estrada dos Bandidos |

### Personagens

- **Ancião Bento** — líder da vila. Sábio e preocupado: "A vila Minhau já viu dias melhores..."
- **Ferreira Marta** — ferreira e loja. Direta e bem-humorada: "Aço bom é aço testado em goblin."
- **Caçador Ivo** — guia. Conhece as trilhas e desconfia da estrada: "Bandidos não dormem."

### Missões

1. **Os Goblins na Porta** (Bento) — o ataque não foi o primeiro; os goblins cercam a vila há dias, roubam
   colheitas e atacam quem sai da cerca. Matar 10 goblins no Bosque.
2. **Ferramentas Roubadas** (Marta) — os goblins levaram as ferramentas dela e escondem o roubo em baús pela
   mata. Abrir 3 baús. Recompensa: uma arma forjada por ela.
3. **Sombras na Estrada** (Ivo) — homens de bandana vermelha saqueiam as caravanas. Matar 12 bandidos.
   Num dos corpos, Ivo acha um mapa com a marca de **Krag**: ele lidera os bandidos e paga os goblins com aço.
4. **O Esmaga-Crânios** (Ivo) — derrotar **Krag** no acampamento dele ("esmagou um cavalo com uma só
   pancada"). Sem ele, os goblins perdem as armas.
5. **O Rei Goblin** (Bento) — Krag armava os goblins, mas quem os comanda é **Grumm**. Derrotá-lo na Clareira.
   Ao voltar com a coroa: "Os tambores se calaram. Pela primeira vez em semanas, as crianças brincam fora da
   cerca." Recompensa: um tesouro único da vila.

### Chefes do ato

- **Grumm, o Rei Goblin** — chefe final do ato, na Clareira do Rei Goblin.
- **Krag, o Esmaga-Crânios** — líder bandido, na Estrada dos Bandidos.
- **Presa-Negra, o Worg Alfa** — chefe opcional, na Mata dos Lobos.
- Masmorras: **Aranha Rainha**, **O Açougueiro**, **Brugo, o Ogro**.

---

## Ato II — Pântano Sombrio

Pântano escuro e enevoado, lama e árvores podres. Inimigos: zumbis, esqueletos, carniçais, homens-lagarto,
sanguessugas, fogos-fátuos, cultistas e goblins fugidos. Abre quando o Ato I termina.

### Lugares

| Área | Nível | O que é |
|---|---|---|
| **Acampamento do Pântano** | 8 | Vila do ato, ao norte da Clareira |
| **Brejo dos Lagartos** | 9 | Domínio dos homens-lagarto. Chefe: Morgana. Masmorra: *Toca da Rainha* (Aranha Rainha) |
| **Ruínas Afundadas** | 10 | Ruínas tomadas por mortos-vivos. Chefe: Vargas. Masmorra: *Cripta Afundada* (Cavaleiro Esqueleto) |
| **Covil de Gorlak** | 12 | Coração do pântano. Masmorra: *Formigueiro* (Rainha Formiga) |

### Personagens

- **Curandeira Nádia** — líder do acampamento: "O pântano cura e mata com as mesmas ervas."
- **Mercador Osvaldo** — loja. Viajado ("mercadoria de três reinos") e entende de runas.
- **Barqueiro Tito** — guia. Conhece cada canal: "À noite, luzes dançam sobre a água. Não siga nenhuma."

### Missões

6. **O Pântano Sombrio** (Bento → Nádia) — Grumm morreu, mas os goblins fugiram para o pântano, onde os mortos
   não descansam. Destruir 15 mortos-vivos. Nádia reconhece: "ossos que andam... isso é magia antiga."
7. **A Fera do Pântano** (Tito) — derrotar **Gorlak**, um troll do tamanho de uma casa que arranca árvores
   para usar como clava. No covil dele, Tito acha **runas de gelo** que apontam para os Picos Gelados.

### Chefes do ato

- **Gorlak, o Troll do Pântano** — chefe final do ato, no Covil de Gorlak.
- **Morgana, a Bruxa do Pântano** — no Brejo dos Lagartos.
- **Vargas, o Necromante** — nas Ruínas Afundadas.
- Masmorras: **Aranha Rainha**, **Cavaleiro Esqueleto**, **Rainha Formiga**.

---

## Ato III — Picos Gelados

Montanhas de neve e rocha. Inimigos: orcs, hobgoblins, esqueletos, armaduras animadas, fantasmas, gárgulas,
lobos sombrios, bandidos e cultistas. Abre depois de Gorlak.

### Lugares

| Área | Nível | O que é |
|---|---|---|
| **Forte da Montanha** | 13 | Vila do ato, passagem ao norte do covil de Gorlak |
| **Trilha Congelada** | 14 | Trilha com casas abandonadas que descem para masmorras. Chefe: Mantícora. Masmorra: *Fortaleza Saqueada* (O Açougueiro) |
| **Cemitério de Gelo** | 16 | Campo de mortos-vivos. Masmorra: *Catacumbas de Gelo* (Cavaleiro Esqueleto) |
| **Torre de Malakar** | 18 | Torre do Lich, além do Cemitério. Masmorra: *Covil do Dragão* (Ignir) |

### Personagens

- **Capitã Helena** — comandante do forte: "O forte ainda está de pé. Por enquanto." Seus soldados viram
  mortos marchando na neve.
- **Ferreiro Brum** — anão, ferreiro e loja: "Barba congelada é barba de respeito!"
- **Vidente Lia** — guia: "Vejo sua sombra na torre... e ela ainda está de pé." / "O cristal canta quando o
  Lich desperta."

### Missões

8. **As Casas Abandonadas** (Osvaldo → Helena) — as runas vêm dos Picos, onde vive um necromante antigo.
   Limpar uma masmorra nas terras do forte e levar o que o chefe guardava à Capitã Helena.
9. **Malakar, o Lich** (Helena) — Malakar trocou a alma pela imortalidade, despertou os mortos e enlouqueceu
   os goblins. Destruí-lo na torre. "O frio se foi... o Lich não existe mais!" O herói salvou não só Minhau,
   mas o reino inteiro.

### Chefes do ato

- **Malakar, o Lich** — vilão principal, na Torre de Malakar.
- **Mantícora** — na Trilha Congelada.
- Masmorras: **O Açougueiro**, **Cavaleiro Esqueleto**, **Ignir, o Dragão Jovem**.

---

## Epílogo

"E assim a vila Minhau voltou a dormir em paz. Mas nas profundezas da floresta, algo antigo despertou com o
sangue derramado... Os inimigos continuam ficando mais fortes. Até onde você consegue ir?"

O gancho deixa o jogo aberto: depois da história, o mundo segue ficando mais difícil (dificuldades maiores).

## Linha da cadeia de culpa

```
Malakar, o Lich  ──desperta──▶ mortos-vivos (Pântano, Picos)
       │
       └──enlouquece──▶ goblins ◀──armados por── Krag (bandidos)
                           │
                     comandados por Grumm ──ataca──▶ Minhau
```

## Mapa do mundo

Do sul (início) para o norte (fim). Cada área liga às vizinhas por estradas nas bordas do mapa.

```
                          Cemitério de Gelo (16) ── Torre de Malakar (18)
                                   │
ATO III                   Trilha Congelada (14) ─── Forte da Montanha (13)
                                                            │
                                                    Covil de Gorlak (12)
                                                            │
ATO II                    Brejo dos Lagartos (9) ── Ruínas Afundadas (10)
                                   │
                          Acampamento do Pântano (8)
                                   │
ATO I  Mata dos Lobos (5) ── Clareira do Rei Goblin (6)
              │                    │
       Bosque dos Goblins (2) ─ Estrada dos Bandidos (4)
              │
       Vila de Minhau (1)
```
