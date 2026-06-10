/**
 * Marca AV — identidad visible del producto (réplica del logotipo del prototipo).
 * Iniciales "AV" en serif sobre un cuadro navy, con un detalle inferior en rojo AV.
 * Se dibuja en código para no depender de un asset externo (evita imports rotos).
 */
export default function AVMark({ size = 36, radius = 8 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--navy)',
        color: 'var(--surface)',
        fontFamily: 'var(--serif)',
        fontWeight: 400,
        fontSize: Math.round(size * 0.46),
        lineHeight: 1,
        letterSpacing: '.01em',
        flexShrink: 0,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      AV
      {/* detalle de marca: barra inferior en rojo AV */}
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: Math.max(2, Math.round(size * 0.08)),
          background: 'var(--av-red)',
        }}
      />
    </span>
  )
}
