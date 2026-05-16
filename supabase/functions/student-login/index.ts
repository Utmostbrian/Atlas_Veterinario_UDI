import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { name, classCode } = await req.json()

    if (!name?.trim() || !classCode?.trim()) {
      return json({ error: 'Nombre y código de clase son requeridos.' }, 400)
    }

    const expectedCode = Deno.env.get('STUDENT_CLASS_CODE')
    if (!expectedCode || classCode.trim() !== expectedCode) {
      return json({ error: 'Código de clase incorrecto.' }, 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const { data, error } = await supabase.auth.signInWithPassword({
      email:    'estudiante@udi.edu.bo',
      password: Deno.env.get('STUDENT_ACCOUNT_PASSWORD')!,
    })

    if (error) {
      console.error('[student-login] Supabase auth error:', error.message)
      return json({ error: 'Error interno. Contacta al administrador.' }, 500)
    }

    return json({ session: data.session, studentName: name.trim() })
  } catch (e) {
    console.error('[student-login] Unexpected error:', e)
    return json({ error: 'Error del servidor.' }, 500)
  }
})