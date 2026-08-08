import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.SUPABASE_URL || (typeof process !== 'undefined' ? process.env.SUPABASE_URL : '');
const key = import.meta.env.SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env.SUPABASE_ANON_KEY : '');

if (!url || !key) {
  throw new Error('Faltan las variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY para inicializar el cliente Supabase.');
}

export const supabase = createClient(url, key);
