import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const buildRoot = path.join(repositoryRoot, "admin-dist");
const indexFile = path.join(buildRoot, "index.html");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function sendFile(response, filename, headOnly) {
  const stat = fs.statSync(filename, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": stat.size,
    "Content-Type": contentTypes[path.extname(filename)] || "application/octet-stream",
  });
  if (headOnly) response.end();
  else fs.createReadStream(filename).pipe(response);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (pathname.startsWith("/admin-dist/")) {
    const relativePath = pathname.slice("/admin-dist/".length);
    const filename = path.resolve(buildRoot, relativePath);
    if (filename === buildRoot || !filename.startsWith(`${buildRoot}${path.sep}`)) {
      response.writeHead(400).end("Invalid path");
      return;
    }
    sendFile(response, filename, request.method === "HEAD");
    return;
  }
  sendFile(response, indexFile, request.method === "HEAD");
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Admin preview listening at http://127.0.0.1:${port}\n`);
});
