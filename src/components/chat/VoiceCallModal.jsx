import styles from './VoiceCallModal.module.css'
import chatIAIcon from '../../Icons/icons_final/CHATIA.svg'
import { PhoneOffIcon, MicIcon } from '../../Icons/Icons'

/**
 * Modal de conversación por voz tipo "llamada". UI puramente presentacional.
 * Toda la orquestación (escucha → pensar → hablar → re-escuchar) vive en el
 * componente padre vía las props `status`, `userInterim`, `assistantText`.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {'idle'|'listening'|'thinking'|'speaking'} props.status
 * @param {string} props.userInterim    Transcripción parcial del usuario
 * @param {string} props.assistantText  Última frase hablada/hablándose por la IA
 * @param {boolean} props.micMuted      Mic temporalmente silenciado
 * @param {() => void} props.onToggleMute
 * @param {() => void} props.onHangup
 */
export default function VoiceCallModal({
  open,
  status,
  userInterim,
  assistantText,
  micMuted,
  onToggleMute,
  onHangup,
}) {
  if (!open) return null

  const statusLabel = {
    idle:      'Conectando...',
    listening: micMuted ? 'Micrófono silenciado' : 'Escuchando...',
    thinking:  'Pensando...',
    speaking:  'Hablando...',
  }[status] ?? 'Conectando...'

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Llamada de voz con Atlas IA">
      <div className={styles.scene}>
        {/* Avatar central con orbe pulsante según estado */}
        <div className={`${styles.orbWrap} ${styles[`orb_${status}`]}`}>
          <div className={styles.orbRing} />
          <div className={styles.orbRing2} />
          <div className={styles.orb}>
            <img src={chatIAIcon} alt="" className={styles.orbIcon} />
          </div>
        </div>

        <div className={styles.title}>Atlas IA</div>
        <div className={styles.status}>{statusLabel}</div>

        {/* Última respuesta de la IA (texto sincronizado con TTS aprox.) */}
        {assistantText && (
          <div className={styles.assistantBubble}>
            {assistantText}
          </div>
        )}

        {/* Transcripción del usuario en vivo */}
        {userInterim && status === 'listening' && (
          <div className={styles.userBubble}>
            {userInterim}
          </div>
        )}

        {/* Controles inferiores */}
        <div className={styles.controls}>
          <button
            className={`${styles.controlBtn} ${micMuted ? styles.controlBtnMuted : ''}`}
            onClick={onToggleMute}
            title={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
            aria-label={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
            aria-pressed={micMuted}
          >
            <MicIcon size={22} />
          </button>

          <button
            className={`${styles.controlBtn} ${styles.hangupBtn}`}
            onClick={onHangup}
            title="Colgar"
            aria-label="Colgar llamada"
          >
            <PhoneOffIcon size={22} />
          </button>
        </div>

        <div className={styles.hint}>
          Habla con naturalidad. La IA te responderá con voz y volverá a escucharte.
        </div>
      </div>
    </div>
  )
}
