import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { name, classCode } = await req.json()

    if (!name?.trim() || !classCode?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Nombre y código de clase son requeridos.' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    const expectedCode = Deno.env.get('STUDENT_CLASS_CODE')
    if (!expectedCode || classCode.trim() !== expectedCode) {
      return new Response(
        JSON.stringify({ error: 'Código de clase incorrecto.' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
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
      return new Response(
        JSON.stringify({ error: 'Error interno. Contacta al administrador.' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ session: data.session, studentName: name.trim() }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[student-login] Unexpected error:', e)
    return new Response(
      JSON.stringify({ error: 'Error del servidor.' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
