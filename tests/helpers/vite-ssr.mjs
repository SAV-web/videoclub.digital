import { createServer } from "vite";

/**
 * Arranca un servidor de Vite en modo SSR silencioso para tests
 * y carga una lista de rutas de módulos de forma sencilla.
 */
export async function startViteSsrServer(modulePaths = []) {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  const modules = await Promise.all(
    modulePaths.map((path) => server.ssrLoadModule(path))
  );

  const close = async () => {
    await server.close();
  };

  return { server, modules, close };
}
