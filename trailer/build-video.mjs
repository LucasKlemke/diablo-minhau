// Encodes the captured frames and mixes the audio cues into the trailer MP4.
//   node trailer/build-video.mjs <framesDir> [out.mp4]
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const frames = process.argv[2] ?? join(HERE, "frames");
const out = process.argv[3] ?? join(HERE, "diablo-minhau-trailer.mp4");
const { duration, fps, audio } = JSON.parse(readFileSync(join(frames, "timeline.json"), "utf8"));

const args = ["-y", "-framerate", String(fps), "-i", join(frames, "f%05d.png")];
const chains = [];
audio.forEach((a, i) => {
  args.push("-i", resolve(HERE, a.file));
  const ms = Math.round(a.t * 1000);
  let f = `[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${a.vol},adelay=${ms}|${ms}`;
  if (a.fadeOut) f += `,afade=t=out:st=${a.fadeOut[0]}:d=${a.fadeOut[1] - a.fadeOut[0]}`;
  chains.push(`${f}[a${i}]`);
});
const mix = audio.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${audio.length}:normalize=0:dropout_transition=0,alimiter=limit=0.9,atrim=0:${duration},afade=t=out:st=${duration - 1.2}:d=1.2[aout]`;
args.push("-filter_complex", [...chains, mix].join(";"), "-map", "0:v", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", "12M", "-bufsize", "24M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
  "-t", String(duration), "-movflags", "+faststart", out);

const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
process.exit(r.status ?? 1);
