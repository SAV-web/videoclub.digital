// =================================================================
//                  CLIENTE DE SUPABASE
// =================================================================
// Este módulo crea y exporta una única instancia del cliente de Supabase
// para que pueda ser reutilizada en toda la aplicación (api.js, auth.js, etc.).

// ANTES (buscando en internet):
// import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

// DESPUÉS (buscando en la despensa local `node_modules`):
import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "./config.js";

export const supabase = createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);
