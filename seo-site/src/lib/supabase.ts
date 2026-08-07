import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.SUPABASE_URL;
const key = import.meta.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY en el entorno de build');
}

export const supabase = createClient(url, key);
