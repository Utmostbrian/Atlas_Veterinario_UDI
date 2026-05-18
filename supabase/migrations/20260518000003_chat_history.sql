-- ============================================================
-- Atlas Vet — Chat IA: historial de conversaciones persistente
-- chat_conversations + chat_messages con RLS + SPs idiomáticos
-- ============================================================

-- ------------------------------------------------------------
-- Tabla: conversaciones (1 por hilo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_name  TEXT        NULL,                                  -- estudiante en cuenta compartida
  title       TEXT        NOT NULL DEFAULT 'Nueva conversación'
              CONSTRAINT chat_title_len CHECK (length(title) BETWEEN 1 AND 120),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.chat_conversations IS
  'Hilos de chat con la IA. updated_at se mueve con cada mensaje nuevo.';

CREATE INDEX IF NOT EXISTS idx_chat_conv_user_updated
  ON public.chat_conversations (user_id, updated_at DESC);

-- ------------------------------------------------------------
-- Tabla: mensajes (N por conversación, ordenados por created_at)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT        NOT NULL
                  CONSTRAINT chat_content_len CHECK (length(content) <= 32768),  -- 32 KB max
  had_image       BOOLEAN     NOT NULL DEFAULT FALSE,            -- la imagen NO se persiste (cuesta espacio)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv_created
  ON public.chat_messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- RLS — usuario solo ve los suyos; admin ve todo
-- ------------------------------------------------------------
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conv_own"   ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_conv_admin" ON public.chat_conversations;
DROP POLICY IF EXISTS "chat_msg_own"    ON public.chat_messages;
DROP POLICY IF EXISTS "chat_msg_admin"  ON public.chat_messages;

CREATE POLICY "chat_conv_own"
  ON public.chat_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "chat_conv_admin"
  ON public.chat_conversations FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "chat_msg_own"
  ON public.chat_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "chat_msg_admin"
  ON public.chat_messages FOR SELECT
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ------------------------------------------------------------
-- Trigger: actualizar updated_at de la conversación cuando llega mensaje nuevo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_chat_conversation_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_bump_conv ON public.chat_messages;
CREATE TRIGGER chat_messages_bump_conv
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_chat_conversation_updated_at();

-- ------------------------------------------------------------
-- SP: crear conversación nueva
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_create_chat_conversation(
  p_title      TEXT DEFAULT 'Nueva conversación',
  p_actor_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_caller UUID := auth.uid();
  v_title  TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  v_title := COALESCE(NULLIF(trim(p_title), ''), 'Nueva conversación');
  IF length(v_title) > 120 THEN v_title := left(v_title, 120); END IF;

  INSERT INTO public.chat_conversations (user_id, title, actor_name)
  VALUES (v_caller, v_title, p_actor_name)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- SP: agregar mensaje a una conversación existente
-- (verifica pertenencia server-side)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_add_chat_message(
  p_conversation_id UUID,
  p_role            TEXT,
  p_content         TEXT,
  p_had_image       BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_caller UUID := auth.uid();
  v_owner  UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  SELECT user_id INTO v_owner
  FROM public.chat_conversations
  WHERE id = p_conversation_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Conversación no existe.' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner != v_caller THEN
    RAISE EXCEPTION 'FORBIDDEN: No tienes acceso a esta conversación.' USING ERRCODE = 'P0001';
  END IF;

  IF p_role NOT IN ('user', 'assistant') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: role debe ser user o assistant.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.chat_messages (conversation_id, role, content, had_image)
  VALUES (
    p_conversation_id,
    p_role,
    -- truncar al límite del CHECK constraint para no fallar el INSERT
    left(COALESCE(p_content, ''), 32768),
    COALESCE(p_had_image, FALSE)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- SP: listar conversaciones del usuario con preview del primer mensaje
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_get_chat_conversations(
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  title         TEXT,
  message_count BIGINT,
  preview       TEXT,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ,
  total_count   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  IF p_limit IS NULL OR p_limit <= 0 OR p_limit > 200 THEN p_limit := 50; END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN p_offset := 0; END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.title,
    COALESCE(stats.msg_count, 0)::BIGINT       AS message_count,
    stats.preview,
    c.created_at,
    c.updated_at,
    COUNT(*) OVER()::BIGINT                    AS total_count
  FROM public.chat_conversations c
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)                                 AS msg_count,
      (
        SELECT left(content, 140) FROM public.chat_messages m2
        WHERE m2.conversation_id = c.id AND m2.role = 'user'
        ORDER BY m2.created_at ASC LIMIT 1
      )                                        AS preview
    FROM public.chat_messages m
    WHERE m.conversation_id = c.id
  ) stats ON TRUE
  WHERE c.user_id = v_caller
  ORDER BY c.updated_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ------------------------------------------------------------
-- SP: mensajes de una conversación (verificando pertenencia)
-- ------------------------------------------------------------
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

  SELECT user_id INTO v_owner FROM public.chat_conversations WHERE id = p_conversation_id;
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

-- ------------------------------------------------------------
-- SP: actualizar título de una conversación
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_update_chat_title(
  p_conversation_id UUID,
  p_title           TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_title  TEXT := COALESCE(NULLIF(trim(p_title), ''), 'Nueva conversación');
  v_rows   INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  IF length(v_title) > 120 THEN v_title := left(v_title, 120); END IF;

  UPDATE public.chat_conversations
  SET title = v_title
  WHERE id = p_conversation_id AND user_id = v_caller;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ------------------------------------------------------------
-- SP: borrar una conversación (CASCADE borra mensajes)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_delete_chat_conversation(
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_rows   INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.chat_conversations
  WHERE id = p_conversation_id AND user_id = v_caller;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.sp_create_chat_conversation(TEXT, TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_add_chat_message(UUID, TEXT, TEXT, BOOLEAN)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_chat_conversations(INT, INT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_get_chat_messages(UUID)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_update_chat_title(UUID, TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.sp_delete_chat_conversation(UUID)                TO authenticated;
