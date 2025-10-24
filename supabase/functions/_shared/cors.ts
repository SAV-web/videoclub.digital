// supabase/functions/_shared/cors.ts
//
// Este archivo centraliza los encabezados de CORS para ser reutilizados
// en todas las Edge Functions. Esto asegura consistencia y facilita
// la actualización de las políticas de CORS en el futuro.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Permite peticiones desde cualquier origen. Se puede restringir en producción.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', // <-- LA LÍNEA CLAVE
};
