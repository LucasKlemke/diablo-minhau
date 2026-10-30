# Chronicles of Minhau — História

Contexto narrativo do jogo: premissa, personagens, os três atos e onde cada parte da história acontece.
Tudo aqui vem do que já está no código (`src/data/quests.ts`, `src/data/zones.ts`, `src/data/enemies.ts`,
`src/scenes/IntroScene.ts`). Ao mudar a história, atualize os dois lados.

> **Ato I reescrito (2026-10).** O Ato I segue a "Bíblia do Ato I" (Rei Aldo, Jimmynelson, Kira, Lula). Os Atos
> II e III ainda são a história antiga (Malakar) e serão reescritos depois, por isso há pontas soltas entre eles.

## Premissa

Há dez anos, **Minhau** era um reino de mármore branco governado pelo bondoso **Rei Aldo**. A **Princesa Sarah**
mimava **Jimmy**, seu yorkshire. Numa noite, Jimmy teve um acesso de raiva, fugiu para a tempestade e voltou
transformado em **Jimmynelson**, uma besta colossal envolta em névoa fétida. Ele arrombou os portões, levou
Sarah acorrentada e arremessou o **Primeiro Guardião** (o jogador) pelo vitral, para o abismo.

Aldo perdeu a coroa, o castelo e a filha. Recolheu o guardião nas pedras do rio e cuidou dele por dez anos,
escondido como o ancião de uma vila em ruínas, sitiada por goblins e pelo bando de **Lula**, um "presidente"
que taxa a miséria do povo. O eco da bênção de Sarah manteve o coração do guardião batendo. Agora ele acorda.

**Aparência canônica:** Jimmy é um yorkshire terrier (Jimmynelson é um yorkshire monstruoso, dourado e
azul-aço); Lisa é uma husky marrom e branca; Kira é uma husky toda branca; Sarah tem pele branca e cabelo
moreno; Aldo é totalmente careca.

## O herói

O jogador escolhe uma de quatro classes na fogueira (Bárbaro, Arqueiro, Mago, Feiticeiro). Em todas, o herói
é **o Primeiro Guardião de Minhau**.

## Prólogo (cinemática na engine, `IntroScene.ts`)

1. **A queda da corte (10 anos atrás)** — salão de mármore branco, alaúde. Sarah alimenta Jimmy na tigelinha
   dourada; Lisa se aproxima, Jimmy rosna, Sarah o repreende. Jimmy faz xixi no tapete persa e foge para a
   tempestade. Corte seco: relâmpagos vermelhos, tambores. Jimmynelson arromba os portões e despedaça os guardas
   (sangue pelo mármore); seu rugido derruba as colunas e incendeia o salão. O Guardião salta para defender Sarah, o rugido sônico em cone o joga pelo vitral. Última imagem:
   Sarah levada em correntes e Aldo gritando da sacada em chamas.
2. **O despertar na cabana (hoje)** — visão turva, teto de palha, brasas fracas. Aldo fala dos dez anos de
   unguentos; o reflexo na bacia revela a coroa de ferro sob o capuz: "eu sou Aldo". O jogo começa na praça
   da vila, com Aldo ao lado.

---

## Ato I — Floresta de Minhau

Floresta verde, campos e estradas. Inimigos: goblins, cavaleiros de worg, bandidos, javalis, vespas, gosmas,
ents e lobos.

### Lugares

| Área | Nível | O que é |
|---|---|---|
| **Vila de Minhau** | 1 | Hub em ruínas: cercas com cipó, lama, fonte seca. Muda com a história (ver abaixo) |
| **Bosque dos Goblins** | 2–3 | Mata retorcida, fogueiras de lixo. Masmorra: *Casa Abandonada* (A Pulga Demoníaca) |
| **Mata dos Lobos** | 4–5 | Névoa baixa, rochedos com musgo. Chefes: Caramelo, Trovão e Mancha; Presa-Negra (opcional). Masmorra: *Caverna dos Morcegos* (Brugo) |
| **Estrada dos Bandidos** | 5 | Antiga rota real, carroças saqueadas, pedágios. Chefe: Lula. Masmorra: *Porão do Açougueiro* |
| **Clareira do Rei Goblin** | 6–7 | Descampado com estacas e o trono de sucata de Grumm |

### Regiões (mapas desenhados à mão, `src/world/layouts/act1.ts`)

O Ato I é uma terra desolada: grama morta, chão de cinzas, árvores retorcidas e queimadas, névoa baixa e cinzas
caindo. Os mapas são fixos (iguais para todo jogador) e cada lugar tem um motivo para estar onde está.

- **Vila de Minhau:** paliçada amarrada com cipó; portão norte para o Bosque e a paliçada sul arrebentada
  (os batedores da Missão 1 rondam ali fora). Praça com a fonte seca; ao norte a cabana do Aldo, a oeste a
  ferraria da Marta, a leste o abrigo do Ivo. Sudeste: o Bairro Queimado (as vigas da Missão 1). Sudoeste: as
  barracas dos refugiados. Noroeste: o cemitério. Fora da cerca, fazendas mortas e carroças viradas. Quando o
  ato termina (`act1_clean`), a vila volta a ter cor.
- **Bosque dos Goblins:** três trilhas (vila ao sul, Mata dos Lobos ao norte, Estrada a leste). Os três
  acampamentos goblin (do Riacho, das Barricadas, dos Ossos) guardam os baús da Marta; a Cozinha dos Goblins,
  a nordeste, tem o caldeirão com o sabão; a Casa Abandonada fica no fundo da mata.
- **Mata dos Lobos:** rochas com musgo e névoa densa. A clareira rochosa da Kira (oeste), onde ela fica olhando
  uma joaninha enquanto a matilha a cerca (Missão 4), e a toca do Presa-Negra (sudoeste). A nordeste, o
  **Cruzamento das Pedras Altas**: um círculo de menires com uma única abertura a sudoeste. Dentro dele ficam a
  carroça virada dos capangas do Lula, os montes de restos podres que eles despejaram, poças de peste e ossos
  roídos. Os três vira-latas só aparecem ali durante a Missão 5. Ao entrar no círculo, a cutscene apresenta
  cada cão demoníaco, que uiva. Cada um derrotado não morre: cai, a peste sai num estouro verde, ele volta a
  ser o cão normal, sacode o pelo, late e corre para a vila.
- **Estrada dos Bandidos:** a antiga estrada real, larga e calçada, com carruagens saqueadas e pedágios. Um
  ramal a leste leva à Alfândega Real: um pátio cercado de paliçada, com o palanque do Lula sobre três
  carroças viradas. A única passagem é uma barricada (carroças, estacas e a faixa verde e amarela do Lula),
  trancada até o Rei Aldo dar a Missão 6. Ao chegar nela com a missão, o herói arromba a barricada e começa
  a cutscene de apresentação do Lula, que discursa no palanque e pula para a luta. Derrotado, ele não morre:
  implora, tenta negociar o pedágio, os capangas fogem, e a sentença do Rei Aldo chega na forma de uma
  vassoura. Ele sai varrendo da própria Alfândega ("Isso é golpe!").
- **Clareira do Rei Goblin:** um descampado de lama cercado de estacas com caveiras de javali, fogueiras de
  lixo e o trono de sucata do Grumm ao norte.

### Masmorras do ato

Cada masmorra é o lugar que a história diz que ela é (`src/world/dungeon.ts`, temas por masmorra em `zones.ts`):

- **Casa Abandonada** (Bosque dos Goblins): a adega de uma casa de fazenda em ruínas. Entrada pelas portas
  inclinadas do porão; lá embaixo, depósitos apertados com tábuas no chão, barris rachados, prateleiras de
  vinho, sacos podres e teias com ovos das pulgas. A Pulga Demoníaca no ninho, no fundo.
- **Porão do Açougueiro** (Estrada dos Bandidos): o porão frio sob a casa de pedra da alfândega velha.
  Lajes sujas de sangue, ganchos com carcaças, mesas e cepos, ralos, jaulas e pilhas de ossos.
- **Caverna dos Morcegos** (Mata dos Lobos): uma caverna natural sinuosa (sem salas retangulares), com
  estalagmites, pedregulhos, guano, poças e cogumelos que brilham. O ogro Brugo dorme num ninho de peles.

### Personagens

- **Rei Aldo, o Ancião** — o rei destronado, escondido como ancião da vila. Dá as missões 1, 6 e 7.
- **Ferreira Marta** — forte e pragmática, odeia sujeira; guarda as ferramentas da corte. Missões 2 e 3; loja.
- **Caçador Ivo** — rastreador veterano. Missões 4 e 5.
- **Lady Kira, a Desatenta** — husky branca da corte, de sangue guardião. Vive no mundo da lua.
- **Lula** — chefe de quadrilha grisalho, de barba branca, tapa-olho, faixa presidencial verde e amarela,
  capa azul rasgada e ombreira de espinhos; luta com uma adaga curva. Depois de derrotado, varre a praça.
- **Grumm, o Rei dos Catadores** — chefe goblin que venera a imundície de Jimmynelson; usa a tiara de Sarah.

### Missões

1. **As Cinzas da Coroa** (Aldo) — abater 8 goblins batedores na cerca sul e recolher 4 vigas de carvalho das
   cabanas desabadas. Na entrega, o panfleto fiscal do Lula. Os portões da vila abrem.
2. **Fogo, Ferro e Sabão** (Marta) — recuperar 3 baús de ferramentas e o fardo de sabão de lavanda num
   caldeirão, nos acampamentos do Bosque. A forja acende (fumaça na ferraria) e Marta passa a vender armas.
3. **O Parasita das Sombras** (Marta) — limpar a Casa Abandonada e derrotar a Pulga Demoníaca; resgatar o fole.
4. **O Resgate da Guarda Desatenta** (Ivo) — eliminar a matilha da Mata dos Lobos e salvar Kira. Kira deita
   sob a árvore da praça, flores brotam, +5% de regeneração de vida.
5. **A Purificação dos Três Vira-Latas** (Ivo) — derrotar Caramelo, Trovão e Mancha. Eles viram vigias do portão.
6. **O Impeachment no Machado** (Aldo) — derrotar Lula na Estrada. Ele vira o Reciclador da praça.
7. **O Trono de Sucata e a Tiara de Sarah** (Aldo) — derrotar Grumm (ele foge para o sul). A tiara floresce,
   a voz de Sarah aponta para o Pântano Sombrio. Abre o Ato II.

**Ainda por fazer (marcos M2–M4 do plano):** mecânicas especiais da Pulga,
fases do Lula, cutscenes do julgamento, da tiara e da transição; sprite próprio do Grumm.

### Chefes do ato

- **Grumm, o Rei dos Catadores** — chefe final, na Clareira do Rei Goblin.
- **Lula, o Demagogo do Lamaçal** — Estrada dos Bandidos.
- **Caramelo, Trovão e Mancha** — os três vira-latas corrompidos, na Mata dos Lobos.
- **Presa-Negra, o Worg Alfa** — opcional, na Mata dos Lobos.
- Masmorras: **A Pulga Demoníaca**, **O Açougueiro**, **Brugo, o Ogro**.

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

6. **O Pântano Sombrio** (Aldo → Nádia) — Grumm fugiu, mas os goblins fugiram para o pântano, onde os mortos
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
Jimmynelson (o yorkshire de Sarah, transformado) ──leva── Sarah, além da "água morta" (Pântano)
       │
       ├──imundície venerada por── Grumm e os goblins ──sitiam──▶ Minhau
       └──parasitas── a Pulga Demoníaca

Lula (bandidos) ──taxa── Minhau · ──corrompe── os três vira-latas
Malakar, o Lich (Atos II/III, história antiga, a reescrever)
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
ATO I  Mata dos Lobos (4) ── Clareira do Rei Goblin (6)
              │                    │
       Bosque dos Goblins (2) ─ Estrada dos Bandidos (5)
              │
       Vila de Minhau (1)
```
