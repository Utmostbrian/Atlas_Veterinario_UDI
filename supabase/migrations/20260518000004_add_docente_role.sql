-- ============================================================
-- Atlas Vet — Add 'docente' role
-- Unifica el login (admin/docente/student) y amplía el CHECK
-- constraint de profiles.role para admitir 'docente'.
-- Se conserva 'veterinarian' por compatibilidad con datos previos.
-- ============================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'docente', 'veterinarian', 'student'));

COMMENT ON COLUMN public.profiles.role IS
  'admin | docente | veterinarian (legacy) | student';
