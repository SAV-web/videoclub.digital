import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../");

globalThis._isTestEnv = true;
if (typeof process !== "undefined" && process.env) {
  process.env.NODE_ENV = "test";
}

/**
 * Arranca un servidor de Vite en modo SSR silencioso para tests
 * y carga una lista de rutas de módulos de forma sencilla.
 */
export async function startViteSsrServer(modulePaths = []) {
  const server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    server: {
      middlewareMode: true,
      watch: null,
      ws: false,
      hmr: false,
    },
    optimizeDeps: {
      noDiscovery: true,
    },
  });


  const modules = await Promise.all(
    modulePaths.map((path) => server.ssrLoadModule(path))
  );

  const close = async () => {
    try {
      if (server.watcher) await server.watcher.close();
      if (server.ws) await server.ws.close();
      await server.close();
    } catch (e) { }
  };

  return { server, modules, close };
}


