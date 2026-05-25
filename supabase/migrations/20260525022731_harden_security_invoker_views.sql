-- Supabase advisors: prevent public views from bypassing caller RLS.
-- Postgres 17 supports security_invoker views.
ALTER VIEW IF EXISTS public.v_prescription_summary SET (security_invoker = true);
ALTER VIEW IF EXISTS public.vademecum_stats SET (security_invoker = true);
