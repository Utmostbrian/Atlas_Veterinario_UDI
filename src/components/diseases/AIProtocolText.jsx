export default function AIProtocolText({ text }) {
  const value = String(text || '').trim()
  if (!value) return null

  return (
    <div className="aisec">
      <h3>Protocolo clinico generado por IA</h3>
      <div
        className="abox b"
        style={{
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          fontSize: '.88rem',
        }}
      >
        {value}
      </div>
    </div>
  )
}
