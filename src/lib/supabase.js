import { createClient } from '@supabase/supabase-js'

function cleanEnv(val) {
  return (val ?? '').replace(/^﻿/, '').trim()
}

const SUPABASE_URL      = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const SUPABASE_ANON_KEY = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Variables de entorno no configuradas.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:    true,
    persistSession:      true,
    detectSessionInUrl:  true,
  },
})
