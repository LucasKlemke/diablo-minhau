import Phaser from "phaser";
import { offSettingsChange, onSettingsChange, settings } from "./settings";

// Real-time 2D lighting (Phaser's light pipeline, with a shader of our own): the world is drawn with the
// SpriteKiln normal maps under a dim ambient, and point lights follow the heroes, burn on fires, candles and portals and fly with the spells.
// Every image, sprite and tile layer added to the scene is lit on its own; additive glows, particles and spell
// effects stay unlit (they are the light), and the textures listed in GLOWS carry a light of their own.

interface Glow {
  color: number;
  radius: number;
  intensity: number;
  /** Light height above the object's origin, px. */
  dy?: number;
  /** Candle-like flicker of the intensity. */
  flicker?: boolean;
  /** Light colour from the object's tint (bolts tinted per enemy). */
  useTint?: boolean;
}

const FIRE = 0xff9a4a;
const GLOWS: Record<string, Glow> = {
  // Fires and candles
  campfire: { color: FIRE, radius: 110, intensity: 1.6, dy: 6, flicker: true },
  fire_large: { color: FIRE, radius: 130, intensity: 1.8, dy: 12, flicker: true },
  fire_small: { color: FIRE, radius: 80, intensity: 1.4, dy: 6, flicker: true },
  fire_wall: { color: FIRE, radius: 110, intensity: 1.6, dy: 10, flicker: true },
  trash_fire: { color: FIRE, radius: 90, intensity: 1.5, dy: 6, flicker: true },
  hearth: { color: FIRE, radius: 90, intensity: 1.3, dy: 8, flicker: true },
  forge_chimney: { color: 0xff7a3a, radius: 80, intensity: 1.2, dy: 8, flicker: true },
  castle_tapestry_burning: { color: FIRE, radius: 80, intensity: 1.3, dy: 16, flicker: true },
  castle_banner_burning: { color: FIRE, radius: 80, intensity: 1.3, dy: 16, flicker: true },
  castle_candelabrum: { color: 0xffc070, radius: 80, intensity: 1.2, dy: 18, flicker: true },
  hut_candle: { color: 0xffc070, radius: 60, intensity: 1.1, dy: 6, flicker: true },
  candle: { color: 0xffa64d, radius: 70, intensity: 1.2, dy: 6, flicker: true },
  // Magic and the strange things of the dungeons
  portal: { color: 0xc06bff, radius: 90, intensity: 1.3, dy: 14 },
  town_portal: { color: 0x5bc8f0, radius: 90, intensity: 1.4, dy: 14 },
  glow_mushrooms: { color: 0x40e0d0, radius: 80, intensity: 1.2, dy: 4 },
  flea_nest: { color: 0x9adf40, radius: 60, intensity: 0.9, dy: 4 },
  plague_pool: { color: 0x7bea6a, radius: 70, intensity: 1.0, dy: 2 },
  wisp: { color: 0x9fffe0, radius: 70, intensity: 1.2, dy: 10 },
  // Spells
  fx_fireball: { color: 0xff8a3a, radius: 90, intensity: 1.8 },
  fx_meteor: { color: 0xff7a2a, radius: 150, intensity: 2.2 },
  fx_frost_nova: { color: 0x7edaf2, radius: 120, intensity: 1.6 },
  fx_lightning: { color: 0xcfe8ff, radius: 130, intensity: 2.2, flicker: true },
  fx_arcane_shield: { color: 0x7aa8ff, radius: 60, intensity: 0.9, dy: 12 },
  fx_shadowbolt: { color: 0xa45dff, radius: 80, intensity: 1.5 },
  fx_soul_drain: { color: 0x8a5dff, radius: 70, intensity: 1.2 },
  fx_plague: { color: 0x7bea6a, radius: 90, intensity: 1.1 },
  fx_corpse_blast: { color: 0xc13a2b, radius: 110, intensity: 1.6 },
  fx_blood_pact: { color: 0xe03a3a, radius: 60, intensity: 0.9, dy: 12 },
  fx_war_roar: { color: 0xff6a3a, radius: 90, intensity: 1.2, dy: 10 },
  fx_explosive_arrow: { color: 0xff8a3a, radius: 70, intensity: 1.3 },
  fx_quake: { color: 0xe0662a, radius: 80, intensity: 0.8 },
  // Plain projectile textures
  fx_fire: { color: 0xff8a3a, radius: 70, intensity: 1.4, useTint: true },
  fx_shadow: { color: 0xa45dff, radius: 70, intensity: 1.3 },
};

/** Light2D with the falloff in world pixels. Phaser's own shader measures distances against the window size and
 * zoom, so the hero's light shrank to a dot at 4x zoom on a big window; here a light reaches `radius` world px at
 * any zoom. Lights sit LIGHT_HEIGHT px above the ground, and part of the light wraps around the normals so the
 * side of a sprite turned away is still warmed. */
const LIGHT_HEIGHT = 36;
const WORLD_LIGHT_FRAG = `
precision mediump float;
struct Light { vec2 position; vec3 color; float intensity; float radius; };
const int kMaxLights = %LIGHT_COUNT%;
uniform vec4 uCamera; /* x, y, rotation, zoom */
uniform sampler2D uMainSampler;
uniform sampler2D uNormSampler;
uniform vec3 uAmbientLightColor;
uniform Light uLights[kMaxLights];
uniform mat3 uInverseRotationMatrix;
uniform int uLightCount;
varying vec2 outTexCoord;
varying float outTexId;
varying float outTintEffect;
varying vec4 outTint;

void main () {
  vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);
  vec4 texture = texture2D(uMainSampler, outTexCoord);
  vec4 color = texture * texel;
  if (outTintEffect == 1.0) color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);
  else if (outTintEffect == 2.0) color = texel;

  vec3 normal = normalize(uInverseRotationMatrix * (texture2D(uNormSampler, outTexCoord).rgb * 2.0 - 1.0));
  vec3 lit = vec3(0.0);
  for (int i = 0; i < kMaxLights; ++i) {
    if (i >= uLightCount) break;
    Light light = uLights[i];
    vec2 d = (light.position - gl_FragCoord.xy) / uCamera.w; // world px
    float k = clamp(1.0 - length(d) / light.radius, 0.0, 1.0);
    float diffuse = 0.35 + 0.65 * max(dot(normal, normalize(vec3(d, ${LIGHT_HEIGHT.toFixed(1)}))), 0.0);
    lit += light.color * (k * k * diffuse * light.intensity);
  }
  gl_FragColor = color * vec4(uAmbientLightColor + lit, 1.0);
}`;

export const LIGHT_PIPELINE = "WorldLight";
export class WorldLightPipeline extends Phaser.Renderer.WebGL.Pipelines.LightPipeline {
  constructor(game: Phaser.Game) {
    super({ game, fragShader: WORLD_LIGHT_FRAG } as Phaser.Types.Renderer.WebGL.WebGLPipelineConfig);
  }
}

/** Light of the world per kind of map: the colour multiplied into everything a light does not reach. */
export type Ambience = "dungeon" | "blight" | "dusk" | "day";
const AMBIENT: Record<Ambience, number> = { dungeon: 0x1c1822, blight: 0x5a5560, dusk: 0x7a7480, day: 0xa8a4a8 };

interface Follower {
  go: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject & { visible: boolean; alpha: number };
  light: Phaser.GameObjects.Light;
  dy: number;
  base: number;
  flicker: boolean;
  phase: number;
}

/** Objects drawn with the light pipeline while the lights are on (a pre-FX glow swaps it out; `relight` brings
 * it back). */
const litObjects = new WeakSet<Phaser.GameObjects.GameObject>();
let lightsOn = false;

/** Back to the light pipeline after a pre-FX (hover outline) has been removed from a lit object. */
export function relight(go: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Pipeline) {
  if (lightsOn && litObjects.has(go)) go.setPipeline(LIGHT_PIPELINE);
}

const textureKey = (go: Phaser.GameObjects.GameObject) =>
  (go as Phaser.GameObjects.Image).texture?.key?.replace(/_(swamp|snow|blight)$/, "");

export class Lighting {
  /** WebGL draws the lights; on a canvas renderer the game has none. */
  readonly supported: boolean;
  private pending: Phaser.GameObjects.GameObject[] = [];
  private followers: Follower[] = [];

  constructor(private scene: Phaser.Scene, ambience: Ambience) {
    this.supported = scene.sys.game.renderer.type === Phaser.WEBGL;
    lightsOn = this.enabled;
    if (!this.supported) return;
    // enable() also sets how many lights fit on screen (left at -1, the manager drops a light every frame).
    scene.lights.enable().setAmbientColor(AMBIENT[ambience]).active = lightsOn;
    const onSettings = () => this.apply();
    onSettingsChange(onSettings);
    scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.preRender, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offSettingsChange(onSettings);
      scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
      scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.preRender, this);
      this.pending.length = this.followers.length = 0;
    });
    for (const go of scene.children.list) this.pending.push(go);
  }

  /** Are the lights drawn now (WebGL, and the "dynamic lighting" option on)? */
  get enabled() {
    return this.supported && settings.lighting;
  }

  /** A light that follows `go` until it is destroyed (the heroes' own light). */
  follow(go: Follower["go"], color: number, radius: number, intensity: number, dy = 0, flicker = false) {
    if (!this.supported) return null;
    const light = this.scene.lights.addLight(go.x, go.y - dy, radius, color, intensity);
    this.followers.push({ go, light, dy, base: intensity, flicker, phase: Math.random() * 100 });
    return light;
  }

  /** The option was switched: every lit object changes pipeline at once. */
  private apply() {
    if (lightsOn === this.enabled) return;
    lightsOn = this.enabled;
    this.scene.lights.active = lightsOn;
    for (const go of this.scene.children.list)
      if (litObjects.has(go)) (go as Phaser.GameObjects.Image).setPipeline(lightsOn ? LIGHT_PIPELINE : "MultiPipeline");
    this.changed?.(lightsOn);
  }

  /** Called when the lights are switched on or off in game. */
  changed?: (on: boolean) => void;

  private onAdded(go: Phaser.GameObjects.GameObject) {
    this.pending.push(go);
  }

  /** Objects are sorted out just before they are first drawn, once their blend mode and tint are set. */
  private preRender() {
    for (const go of this.pending) if (go.active) this.setup(go);
    this.pending.length = 0;
    const t = this.scene.time.now / 1000;
    this.followers = this.followers.filter((f) => {
      if (!f.go.active) {
        this.scene.lights.removeLight(f.light);
        return false;
      }
      const flick = f.flicker ? 0.85 + 0.1 * Math.sin(t * 13 + f.phase) + 0.05 * Math.sin(t * 31 + f.phase * 2) : 1;
      f.light.setPosition(f.go.x, f.go.y - f.dy).setVisible(f.go.visible);
      f.light.intensity = f.base * flick * f.go.alpha;
      return true;
    });
  }

  private setup(go: Phaser.GameObjects.GameObject) {
    const lit = go instanceof Phaser.GameObjects.Image || go instanceof Phaser.GameObjects.Sprite
      || go instanceof Phaser.GameObjects.TileSprite || go instanceof Phaser.Tilemaps.TilemapLayer;
    if (!lit) return;
    const img = go as Phaser.GameObjects.Image;
    const key = textureKey(go);
    const glow = key ? GLOWS[key] : undefined;
    if (glow) {
      const color = glow.useTint && img.isTinted ? img.tintTopLeft : glow.color;
      this.follow(img, color, glow.radius, glow.intensity, glow.dy ?? 0, !!glow.flicker);
    }
    // Additive glows, spell effects and fire are the light: they stay unlit.
    if (glow || img.blendMode !== Phaser.BlendModes.NORMAL || key?.startsWith("fx_")) return;
    litObjects.add(img);
    if (lightsOn) img.setPipeline(LIGHT_PIPELINE);
  }
}
