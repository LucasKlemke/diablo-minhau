# Diablo Minhau

RPG de ação estilo Diablo para o navegador (Phaser 3 + Vite + TypeScript).

- 4 classes (Bárbaro, Arqueiro, Mago, Feiticeiro) com árvore de habilidades
- 3 zonas (Floresta, Pântano, Picos Gelados), masmorras e chefes
- Loot com 6 raridades, loja, quests, 3 espaços de save e 4 dificuldades
- Multijogador cooperativo para 2 jogadores (WebRTC via PeerJS)

Personagens e inimigos feitos com [SpriteKiln](https://github.com/LucasJRamos/spritekiln) (`art/specs/`),
terreno do pack *Farm RPG FREE 16x16 - Tiny Asset Pack*, ícones de habilidade gerados com Antigravity.

```sh
npm install
npm run dev     # http://localhost:5180
npm run build   # gera dist/
```
