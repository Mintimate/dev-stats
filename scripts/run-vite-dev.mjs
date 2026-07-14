import { createServer } from "vite";

function resolvePort() {
  const args = process.argv.slice(2);
  const explicitPortIndex = args.findIndex((arg) => arg === "--port" || arg === "-p");
  const candidates = [
    explicitPortIndex >= 0 ? args[explicitPortIndex + 1] : "",
    process.env.npm_config_port,
    args.find((arg) => /^\d+$/.test(arg)),
  ];

  for (const candidate of candidates) {
    const port = Number(candidate);
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  }
  return undefined;
}

const port = resolvePort();
const server = await createServer({
  server: {
    host: "127.0.0.1",
    ...(port ? { port, strictPort: true } : {}),
  },
});

await server.listen();
server.printUrls();

await new Promise((resolve, reject) => {
  let closing = false;

  async function shutdown() {
    if (closing) return;
    closing = true;
    try {
      await server.close();
      resolve();
    } catch (error) {
      reject(error);
    }
  }

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  server.httpServer?.once("error", reject);
});
