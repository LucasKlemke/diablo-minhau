import Peer, { type DataConnection } from "peerjs";

// Two-player co-op over WebRTC (PeerJS). The host's game is the authority for enemies; each side
// simulates its own hero. The PeerJS public server only brokers the connection; game data flows
// peer to peer.

export type Role = "host" | "guest";

/** Hero snapshot each side sends ~15 times per second. */
export interface PlayerState {
  name: string; cls: string; level: number; hp: number; maxHp: number;
  x: number; y: number; anim: string; dir: string; dead: boolean;
}

/** Enemy row in host snapshots: id, type, x, y, anim, dir, hp, maxHp, rank, level, unique? */
export type EnemyRow = [number, string, number, number, string, string, number, number, string, number, string?];

/** A trip one player proposes and the other has to accept (see GameScene.requestTravel). */
export type TravelReq =
  | { kind: "exit"; to: string; from: string }
  | { kind: "dungeon"; index: number }
  | { kind: "leave" }
  | { kind: "waypoint"; area: string }
  | { kind: "portal" };

export type Msg =
  | { t: "hello"; player: PlayerState }
  | { t: "welcome"; zone: string; dungeon: number | null; seed: number; x: number; y: number; difficulty: string; tier: number; awaken?: boolean }
  /** Lobby: the host answers a guest's hello before the game has started. */
  | { t: "lobby"; player: PlayerState }
  /** Lobby: the host starts the game; `intro` = both watch the prologue first. */
  | { t: "start"; intro: boolean }
  | { t: "intro_skip" }
  /** A story cutscene the host is playing (the guest plays it too); `enemy` = the enemy it is about. */
  | { t: "cine"; id: "polvo" | "lula" | "dogs" | "purify"; enemy?: number }
  | { t: "cine_end" }
  | { t: "vote"; id: number; label: string; req: TravelReq }
  | { t: "vote_ans"; id: number; yes: boolean }
  | { t: "vote_cancel"; id: number }
  | { t: "state"; player: PlayerState }
  | { t: "snap"; e: EnemyRow[] }
  | { t: "hit"; id: number; dmg: number; crit: boolean; kind: string; angle: number; slow?: number; stun?: number; elem?: Partial<Record<"fire" | "cold" | "lightning" | "poison", number>> }
  | { t: "die"; id: number; kind: string; angle: number; big: boolean; overkill: boolean }
  | { t: "hurt"; raw: number; level: number; poison?: [number, number]; stun?: number; slow?: [number, number] }
  | { t: "cast"; skill: string; tx: number; ty: number }
  | { t: "fx"; kind: "circle" | "wave" | "bolt"; x: number; y: number; r?: number; ms?: number; tint?: number; vx?: number; vy?: number }
  | { t: "travel"; zone: string; dungeon: number | null; exitAt: number | null; seed: number; from?: string | null }
  | { t: "bye" };

const PREFIX = "diablo-minhau-v1-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

class Net {
  role: Role | null = null;
  code = "";
  peerConnected = false;
  private peer?: Peer;
  private conn?: DataConnection;
  private handlers = new Map<string, (m: Msg) => void>();
  private statusFns: ((s: string) => void)[] = [];
  /** Messages received per type (debugging aid). */
  readonly rx: Record<string, number> = {};
  readonly tx: Record<string, number> = {};

  get active() {
    return this.role !== null;
  }

  /** Registers the handler for a message type (one per type; scenes replace them on restart). */
  on<T extends Msg["t"]>(type: T, fn: (m: Extract<Msg, { t: T }>) => void) {
    this.handlers.set(type, fn as (m: Msg) => void);
  }

  clearHandlers() {
    this.handlers.clear();
  }

  onStatus(fn: (s: string) => void) {
    this.statusFns = [fn];
  }

  private status(s: string) {
    for (const f of this.statusFns) f(s);
  }

  send(m: Msg) {
    this.tx[m.t] = (this.tx[m.t] ?? 0) + 1;
    if (this.conn?.open) this.conn.send(m);
  }

  private attach(conn: DataConnection) {
    this.conn = conn;
    conn.on("data", (d) => {
      const m = d as Msg;
      this.rx[m.t] = (this.rx[m.t] ?? 0) + 1;
      this.handlers.get(m.t)?.(m);
    });
    conn.on("open", () => {
      this.peerConnected = true;
      this.status("connected");
    });
    conn.on("close", () => {
      this.peerConnected = false;
      this.status("disconnected");
      this.handlers.get("bye")?.({ t: "bye" });
      if (this.role === "host") this.conn = undefined;
    });
  }

  /** Opens a session; resolves with the invite code once the broker has registered it. */
  host(): Promise<string> {
    this.leave();
    return new Promise((resolve, reject) => {
      const code = Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
      const peer = new Peer(PREFIX + code);
      this.peer = peer;
      peer.on("open", () => {
        this.role = "host";
        this.code = code;
        resolve(code);
      });
      peer.on("connection", (conn) => {
        if (this.conn?.open) {
          conn.on("open", () => conn.close()); // sessions are for two players
          return;
        }
        this.attach(conn);
      });
      peer.on("error", (e) => {
        if (!this.role) reject(e);
        else this.status(`erro: ${e.type}`);
      });
    });
  }

  /** Connects to a host's code; resolves once the data channel is open. */
  join(code: string): Promise<void> {
    this.leave();
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      this.peer = peer;
      const fail = (e: unknown) => {
        this.leave();
        reject(e);
      };
      const timer = window.setTimeout(() => fail(new Error("timeout")), 15000);
      peer.on("open", () => {
        // JSON instead of PeerJS's default BinaryPack: much cheaper to encode and decode for small game messages.
        const conn = peer.connect(PREFIX + code.trim().toUpperCase(), { reliable: true, serialization: "json" });
        this.attach(conn);
        conn.on("open", () => {
          window.clearTimeout(timer);
          this.role = "guest";
          this.code = code.trim().toUpperCase();
          resolve();
        });
      });
      peer.on("error", (e) => {
        window.clearTimeout(timer);
        if (!this.role) fail(e);
        else this.status(`erro: ${e.type}`);
      });
    });
  }

  leave() {
    if (this.conn?.open) this.conn.send({ t: "bye" });
    this.conn?.close();
    this.peer?.destroy();
    this.conn = undefined;
    this.peer = undefined;
    this.role = null;
    this.code = "";
    this.peerConnected = false;
  }

  inviteLink() {
    return `${location.origin}${location.pathname}?join=${this.code}`;
  }
}

export const net = new Net();

if (import.meta.env.DEV) (window as unknown as { net: Net }).net = net;
