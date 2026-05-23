import { supabase } from '../lib/supabase'
import { cleanEnv } from '../lib/envUtils'

async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

function getTranscriptionUrl() {
  const supabaseUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
  if (!supabaseUrl) return null
  return `${supabaseUrl}/functions/v1/transcribe-audio`
}

export async function transcribeAudio({ audioBlob, language = 'es', signal }) {
  const url = getTranscriptionUrl()
  const token = await getSessionToken()

  if (!url || !token) {
    throw new Error('Transcripción de audio no configurada para este entorno.')
  }

  const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
  const formData = new FormData()
  formData.append('audio', audioBlob, `voice.${ext}`)
  formData.append('language', language)

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    signal,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error || `Error HTTP ${response.status}`)
  }

  return typeof data.text === 'string' ? data.text.trim() : ''
}
