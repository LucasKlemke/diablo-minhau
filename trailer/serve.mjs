// Serves the project for the trailer page and receives its frames in capture mode.
//   node trailer/serve.mjs [framesDir]   → http://localhost:5190/trailer/
// Preview: open the page and press play. Capture: /trailer/?capture writes every frame as a PNG into
// framesDir plus timeline.json (the audio cues); then run trailer/build-video.mjs.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FRAMES = process.argv[2] ?? join(ROOT, "trailer", "frames");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".png": "image/png", ".mp3": "audio/mpeg" };

await mkdir(FRAMES, { recursive: true });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      if (url.pathname.startsWith("/frame/")) {
        const n = String(Number(url.pathname.slice(7))).padStart(5, "0");
        await writeFile(join(FRAMES, `f${n}.png`), body);
      } else if (url.pathname === "/timeline") {
        await writeFile(join(FRAMES, "timeline.json"), body);
      } else if (url.pathname === "/done") {
        console.log("capture done:", body.toString());
      }
      res.writeHead(204).end();
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname));
    if (p.endsWith("/")) p += "index.html";
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) throw new Error("outside root");
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(5190, () => console.log(`trailer on http://localhost:5190/trailer/ · frames → ${FRAMES}`));
