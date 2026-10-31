import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { IntroScene } from "./scenes/IntroScene";
import { LIGHT_PIPELINE, WorldLightPipeline } from "./game/lighting";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#120b10",
  pixelArt: true,
  roundPixels: true,
  maxLights: 32,
  pipeline: { [LIGHT_PIPELINE]: WorldLightPipeline } as unknown as Phaser.Types.Core.PipelineConfig,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  physics: { default: "arcade", arcade: { debug: false } },
  disableContextMenu: true,
  scene: [BootScene, IntroScene, GameScene],
});

if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
