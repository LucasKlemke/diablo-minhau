import Phaser from "phaser";
import { CLASS_ORDER, type ClassId } from "../data/classes";
import { hasSprite, portrait, preloadKiln, setupKiln } from "../kiln";
import { createHeroFor, registerCinematics, registerMainMenu, setMenuTextures, showLobby, showMainMenu, showMultiplayer, showWaiting, type StartMode } from "../ui/menu";
import { awaitWelcome, playerInfo, stopWelcome, welcomeData } from "../net/session";
import { net } from "../net/net";
import { HeroData } from "../game/hero";
import { drawIcon, ICON_IDS } from "../ui/icons";
import { makeSkins, makeWorldTextures } from "../game/recolor";
import { L } from "../i18n";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload() {
    // Loading screen (index.html): the bar follows the loader.
    const box = document.getElementById("loading");
    const fill = box?.querySelector(".ld-fill") as HTMLElement | null;
    const text = box?.querySelector(".ld-text") as HTMLElement | null;
    if (text) text.textContent = L("Carregando o mundo...", "Loading the world...");
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      if (fill) fill.style.width = `${Math.round(p * 100)}%`;
      if (text) text.textContent = `${L("Carregando o mundo...", "Loading the world...")} ${Math.round(p * 100)}%`;
    });
    const farm = "assets/farm";
    this.load.image("grass", `${farm}/grass.png`);
    this.load.image("tree", `${farm}/tree.png`);
    this.load.image("house_farm", `${farm}/house.png`);
    this.load.image("fence", `${farm}/fence.png`);
    this.load.spritesheet("stones", `${farm}/stones.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("crops", `${farm}/crops.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("chest_farm", `${farm}/chest.png`, { frameWidth: 32, frameHeight: 16 });
    preloadKiln(this);
    // A missing SpriteKiln export is not fatal: setupKiln draws a placeholder.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (f: Phaser.Loader.File) => console.warn("missing asset", f.key));
  }

  create() {
    const box = document.getElementById("loading");
    if (box) {
      box.classList.add("done");
      window.setTimeout(() => box.remove(), 500);
    }
    const missing = setupKiln(this);
    if (missing.length) console.warn("SpriteKiln sprites missing, using placeholders:", missing.join(", "));

    const tree = this.textures.get("tree");
    tree.add("big", 0, 96, 0, 32, 48);
    tree.add("medium", 0, 64, 0, 32, 48);
    tree.add("bush", 0, 48, 32, 16, 16);
    tree.add("stump", 0, 128, 32, 32, 16);
    const house = this.textures.get("house_farm");
    house.add("h0", 0, 0, 0, 80, 96);
    house.add("h1", 0, 144, 0, 80, 112);
    const fence = this.textures.get("fence");
    fence.add("h", 0, 16, 32, 16, 16);
    fence.add("v", 0, 16, 64, 16, 16);

    makeWorldTextures(this);
    makeSkins(this, ["grass", "tree", "crops", ...(["tree_big", "tree_medium", "bush"] as const).filter(hasSprite)]);
    for (const id of ICON_IDS) this.textures.addCanvas(`icon_${id}`, drawIcon(id));
    this.makeFx();

    const portraits: Partial<Record<ClassId, HTMLCanvasElement>> = {};
    for (const id of CLASS_ORDER) portraits[id] = portrait(this, id, 2);
    const go = (data: object) => {
      document.querySelector("#ui .mm")?.remove();
      this.scene.start("game", data);
    };
    const start = (hero: HeroData, mode: StartMode): void => {
      if (mode.kind === "solo") {
        net.leave();
        // A brand-new character watches the opening cutscene first.
        if (!hero.quest.prologueSeen) {
          document.querySelector("#ui .mm")?.remove();
          this.scene.start("intro", { hero });
        } else go({ hero });
      } else if (mode.kind === "host") {
        showWaiting(L("Abrindo a sessão...", "Opening the session..."), () => { net.leave(); open(); });
        net.host().then(() => this.hostLobby(hero, open))
          .catch(() => showMultiplayer(portraits, start, "", L("Não foi possível abrir a sessão. Verifique sua internet.", "Could not open the session. Check your internet connection.")));
      } else {
        showWaiting(L(`Conectando à sessão ${mode.code}...`, `Connecting to session ${mode.code}...`), () => { net.leave(); open(); });
        const fail = (why = L("Não foi possível entrar: código errado, ou o anfitrião não está mais online.", "Could not join: wrong code, or the host is no longer online.")) => {
          stopWelcome();
          net.leave();
          showMultiplayer(portraits, start, mode.code, why);
        };
        net.join(mode.code).then(() => this.guestLobby(hero, open, () => fail(L("O anfitrião saiu da sessão.", "The host left the session.")))).catch(() => fail());
      }
    };
    setMenuTextures(this.textures);
    const open = () => showMainMenu(portraits, start);
    registerMainMenu(open);
    registerCinematics(() => this.scene.start("intro", { replay: true }));
    // Invite links (?join=CODE) open straight on the multiplayer screen.
    const code = new URLSearchParams(location.search).get("join");
    if (code) {
      history.replaceState(null, "", location.pathname);
      // No hero yet: create one first, then straight into the session.
      const join: StartMode = { kind: "join", code: code.toUpperCase() };
      if (!HeroData.slots().some(Boolean)) createHeroFor(portraits, start, join, () => showMultiplayer(portraits, start, join.code));
      else showMultiplayer(portraits, start, code.toUpperCase());
    } else open();
  }

  /** Host lobby: shows who joined and starts the game for both (with the prologue if the host's hero is new). */
  private hostLobby(hero: HeroData, menu: () => void) {
    net.clearHandlers();
    const intro = !hero.quest.prologueSeen;
    const setPartner = showLobby({
      host: true, code: net.code, link: net.inviteLink(), me: `${hero.def.name} ${L("nv", "lv")} ${hero.level}`,
      onStart: () => {
        net.send({ t: "start", intro });
        document.querySelector("#ui .mm")?.remove();
        this.scene.start(intro ? "intro" : "game", { hero, ...(intro ? { coop: true } : {}) });
      },
      onCancel: () => { net.leave(); menu(); },
    });
    net.on("hello", (m) => {
      setPartner(`${m.player.name} ${L("nv", "lv")} ${m.player.level}`);
      net.send({ t: "lobby", player: playerInfo(hero) });
    });
    net.on("bye", () => setPartner(null));
  }

  /** Guest: waits in the lobby until the host starts (prologue together) or is already playing (welcome). */
  private guestLobby(hero: HeroData, menu: () => void, onBye: () => void) {
    const setPartner = showLobby({
      host: false, code: net.code, me: `${hero.def.name} ${L("nv", "lv")} ${hero.level}`,
      onCancel: () => { stopWelcome(); net.leave(); menu(); },
    });
    awaitWelcome(hero, {
      onLobby: (p) => setPartner(`${p.name} ${L("nv", "lv")} ${p.level}`),
      onStart: (intro) => {
        if (!intro) return; // the host's game answers the next hello
        stopWelcome();
        document.querySelector("#ui .mm")?.remove();
        this.scene.start("intro", { hero, coop: true });
      },
      onWelcome: (w) => {
        document.querySelector("#ui .mm")?.remove();
        this.scene.start("game", welcomeData(hero, w));
      },
      onBye,
    });
  }

  private makeFx() {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const tex = (key: string, w: number, h: number, draw: () => void) => {
      g.clear();
      draw();
      g.generateTexture(key, w, h);
    };
    tex("fx_arrow_px", 12, 3, () => {
      g.fillStyle(0x1c0f1a).fillRect(0, 0, 12, 3);
      g.fillStyle(0xc4a75c).fillRect(1, 1, 8, 1);
      g.fillStyle(0xe8ebee).fillRect(9, 0, 3, 3);
      g.fillStyle(0xe0664a).fillRect(0, 0, 2, 1).fillRect(0, 2, 2, 1);
    });
    tex("fx_fire", 9, 9, () => {
      g.fillStyle(0x902308).fillCircle(4.5, 4.5, 4.5);
      g.fillStyle(0xfe6607).fillCircle(4.5, 4.5, 3.5);
      g.fillStyle(0xfbbe71).fillCircle(4.5, 4.5, 2.2);
      g.fillStyle(0xfbf1d5).fillCircle(4.5, 4.5, 1);
    });
    tex("fx_shadow", 9, 9, () => {
      g.fillStyle(0x310e8b).fillCircle(4.5, 4.5, 4.5);
      g.fillStyle(0x2c6226).fillCircle(4.5, 4.5, 3.5);
      g.fillStyle(0x5dff3d).fillCircle(4.5, 4.5, 2.4);
      g.fillStyle(0xefffd5).fillCircle(4.5, 4.5, 1);
    });
    tex("px", 2, 2, () => g.fillStyle(0xffffff).fillRect(0, 0, 2, 2));
    tex("shadow", 12, 5, () => g.fillStyle(0x000000, 0.35).fillEllipse(6, 2.5, 12, 5));
    tex("ring", 64, 64, () => g.lineStyle(3, 0xffffff).strokeCircle(32, 32, 30));
    tex("disc", 64, 64, () => {
      for (let r = 32; r > 0; r -= 4) g.fillStyle(0xffffff, 0.08).fillCircle(32, 32, r);
    });
    // Gore: blood splats, a pool for corpses and flying gibs.
    const BLOOD = [0x4a0712, 0x8a0f1a, 0xc1272d];
    const rnd = Phaser.Math.RND;
    for (let k = 0; k < 5; k++) {
      tex(`blood_${k}`, 16, 12, () => {
        const blobs = 3 + k;
        for (let i = 0; i < blobs; i++) {
          const x = 8 + rnd.between(-4, 4), y = 6 + rnd.between(-2, 2), r = rnd.between(1, 3);
          g.fillStyle(BLOOD[0]).fillEllipse(x, y + 0.5, r * 2.4 + 1, r * 1.5 + 1);
          g.fillStyle(BLOOD[1]).fillEllipse(x, y, r * 2.4, r * 1.5);
        }
        for (let i = 0; i < 4 + k; i++) g.fillStyle(BLOOD[rnd.between(1, 2)]).fillRect(rnd.between(0, 15), rnd.between(0, 11), 1, 1);
        g.fillStyle(BLOOD[2]).fillRect(7, 5, 2, 1);
      });
    }
    tex("blood_pool", 28, 12, () => {
      g.fillStyle(BLOOD[0]).fillEllipse(14, 6.5, 28, 11);
      g.fillStyle(BLOOD[1]).fillEllipse(13, 6, 23, 8);
      g.fillStyle(BLOOD[2]).fillEllipse(10, 5, 8, 3);
      g.fillStyle(BLOOD[1]).fillCircle(25, 3, 2).fillCircle(3, 9, 1.5);
    });
    // Gibs: goblin flesh, a bone and an ear.
    tex("gib_0", 6, 5, () => {
      g.fillStyle(0x1c0f1a).fillRect(0, 1, 6, 4).fillRect(1, 0, 4, 5);
      g.fillStyle(0x4f7d33).fillRect(1, 1, 4, 3);
      g.fillStyle(0xc1272d).fillRect(2, 2, 3, 2);
    });
    tex("gib_1", 7, 3, () => {
      g.fillStyle(0x1c0f1a).fillRect(0, 0, 7, 3);
      g.fillStyle(0xe6d6ad).fillRect(1, 1, 5, 1);
      g.fillStyle(0xf8f1dc).fillRect(0, 0, 2, 2).fillRect(5, 1, 2, 2);
    });
    tex("gib_2", 6, 6, () => {
      g.fillStyle(0x1c0f1a).fillTriangle(0, 6, 6, 0, 5, 6);
      g.fillStyle(0x7ab041).fillTriangle(1, 5, 5, 1, 4, 5);
      g.fillStyle(0x8a0f1a).fillRect(1, 4, 3, 1);
    });
    // Soil under the grass autotile: warm dirt with speckles.
    tex("dirt", 16, 16, () => {
      g.fillStyle(0xb98a5a).fillRect(0, 0, 16, 16);
      const dots: [number, number, number][] = [
        [2, 3, 0xa87a4f], [9, 1, 0xc99a6a], [13, 6, 0xa87a4f], [5, 9, 0xc99a6a], [11, 12, 0xa87a4f], [1, 13, 0xc99a6a], [7, 5, 0xa0714a],
      ];
      for (const [x, y, c] of dots) g.fillStyle(c).fillRect(x, y, 2, 1);
    });
    g.destroy();
  }
}
