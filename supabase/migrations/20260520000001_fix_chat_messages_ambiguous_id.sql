-- Fix: column reference "id" is ambiguous in sp_get_chat_messages
-- The RETURNS TABLE declares 'id UUID' which conflicts with chat_conversations.id
-- in the WHERE clause. Fix: use table alias to disambiguate.

CREATE OR REPLACE FUNCTION public.sp_get_chat_messages(
  p_conversation_id UUID
)
RETURNS TABLE (
  id         UUID,
  role       TEXT,
  content    TEXT,
  had_image  BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_owner  UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT c.user_id INTO v_owner
  FROM public.chat_conversations c
  WHERE c.id = p_conversation_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_owner != v_caller THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT m.id, m.role, m.content, m.had_image, m.created_at
  FROM public.chat_messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sp_get_chat_messages(UUID) TO authenticated;
