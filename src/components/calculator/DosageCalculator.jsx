import { useState } from 'react'
import { validateDose } from '../../services/anthropicService'
import { logDoseCalculation, logDoseValidation } from '../../services/auditService'
import { CalculatorIcon, SparklesIcon } from '../../Icons/Icons'

const SPECIES = ['Perro', 'Gato', 'Bovino', 'Equino', 'Ovino', 'Porcino', 'Ave']
const ROUTES  = ['VO (oral)', 'IM (intramuscular)', 'IV (intravenosa)', 'SC (subcutánea)', 'Tópico', 'Intramamario']
const UNITS   = ['mg/mL', 'UI/mL', '%', 'g/100mL']

function calcDose(weight, dose, concentration) {
  if (!weight || !dose || !concentration) return null
  const totalMg = weight * dose
  const volMl   = totalMg / concentration
  return { totalMg: totalMg.toFixed(2), volMl: volMl.toFixed(2) }
}

export default function DosageCalculator() {
  const [drug,    setDrug]    = useState('')
  const [species, setSpecies] = useState('Perro')
  const [weight,  setWeight]  = useState('')
  const [dose,    setDose]    = useState('')
  const [conc,    setConc]    = useState('')
  const [unit,    setUnit]    = useState('mg/mL')
  const [route,   setRoute]   = useState('VO (oral)')
  const [result,  setResult]  = useState(null)
  const [history, setHistory] = useState([])
  const [aiResult,  setAiResult]  = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')

  function calculate() {
    const r = calcDose(parseFloat(weight), parseFloat(dose), parseFloat(conc))
    if (!r) return
    setResult(r); setAiResult('')
    const entry = { drug, species, weight: parseFloat(weight), dosePerKg: parseFloat(dose),
      concentration: parseFloat(conc), unit, route, ...r,
      timestamp: new Date().toLocaleString('es-BO') }
    setHistory(prev => [entry, ...prev].slice(0, 10))
    logDoseCalculation(entry)
  }

  async function handleValidate() {
    if (!result || !drug) return
    setAiLoading(true); setAiError(''); setAiResult('')
    try {
      const text = await validateDose({
        drug, species, weight: parseFloat(weight),
        dose: `${result.totalMg} mg (${result.volMl} mL)`, unit, route,
      })
      setAiResult(text)
      logDoseValidation({ drug, species, weight, totalDose: result.totalMg, aiVerdict: text.slice(0, 100) })
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="wrap">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalculatorIcon size={20} style={{ color: 'var(--blue)' }} /> Calculadora de Dosis
        </span>
        <span className="scnt">Validación con IA</span>
      </div>

      <div className="cgrid">
        {/* Input card */}
        <div className="card2">
          <div className="ch">Datos del Paciente y Fármaco</div>
          <div className="cb">
            <div className="fgrp">
              <label className="flbl">Fármaco / Principio activo</label>
              <input className="fc" placeholder="Ej: Amoxicilina, Meloxicam..."
                value={drug} onChange={e => setDrug(e.target.value)} />
            </div>

            <div className="frow">
              <div className="fgrp">
                <label className="flbl">Especie</label>
                <select className="fc" value={species} onChange={e => setSpecies(e.target.value)}>
                  {SPECIES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="fgrp">
                <label className="flbl">Peso (kg)</label>
                <input className="fc" type="number" min="0" step="0.1" placeholder="Ej: 25"
                  value={weight} onChange={e => setWeight(e.target.value)} />
              </div>
            </div>

            <div className="frow">
              <div className="fgrp">
                <label className="flbl">Dosis (mg/kg)</label>
                <input className="fc" type="number" min="0" step="0.01" placeholder="Ej: 10"
                  value={dose} onChange={e => setDose(e.target.value)} />
              </div>
              <div className="fgrp">
                <label className="flbl">Concentración</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="fc" type="number" min="0" step="0.1" placeholder="Ej: 50"
                    value={conc} onChange={e => setConc(e.target.value)}
                    style={{ flex: 1 }} />
                  <select className="fc" value={unit} onChange={e => setUnit(e.target.value)}
                    style={{ width: 100 }}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="fgrp">
              <label className="flbl">Vía de administración</label>
              <select className="fc" value={route} onChange={e => setRoute(e.target.value)}>
                {ROUTES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>

            <button className="btnp" onClick={calculate} disabled={!drug || !weight || !dose || !conc}>
              Calcular dosis
            </button>

            {/* Result */}
            {result && (
              <div className="cres show">
                <div className="crtitle">Resultado del Cálculo</div>
                <div className="crow">
                  <span>Dosis total</span>
                  <span>{result.totalMg} mg</span>
                </div>
                <div className="crow">
                  <span>Volumen a administrar</span>
                  <span>{result.volMl} mL</span>
                </div>
                <div className="crow">
                  <span>Paciente</span>
                  <span>{drug} · {species} · {weight} kg · {route}</span>
                </div>

                <button className="btnp" onClick={handleValidate}
                  disabled={aiLoading} style={{ marginTop: 10 }}>
                  <SparklesIcon size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {aiLoading ? 'Verificando con IA...' : 'Validar seguridad con IA'}
                </button>
              </div>
            )}

            {aiResult && (
              <div className="abox g" style={{ marginTop: 12 }}>
                <div className="crtitle">Evaluación IA</div>
                <div className="ai-response" dangerouslySetInnerHTML={{ __html: markdownToHtml(aiResult) }} />
              </div>
            )}
            {aiError && (
              <div className="wbox" style={{ marginTop: 12 }}>
                <span>⚠</span><span><strong>Error:</strong> {aiError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Reference + history card */}
        <div className="card2">
          <div className="ch">⚠ Rangos de Referencia</div>
          <div className="cb">
            <table className="dtbl">
              <thead><tr><th>Fármaco · Especie</th><th>Rango</th></tr></thead>
              <tbody>
                {[
                  ['Amoxicilina · Perro/Gato',  '11–22 mg/kg'],
                  ['Enrofloxacina · Perro',      '5–20 mg/kg'],
                  ['Meloxicam · Perro',          '0.1–0.2 mg/kg'],
                  ['Ketamina · Gato',            '11–33 mg/kg'],
                  ['Ivermectina · Bovino',       '0.2 mg/kg'],
                  ['Flunixin · Equino',          '1.1 mg/kg'],
                ].map(([d, r]) => (
                  <tr key={d}><td>{d}</td><td><strong>{r}</strong></td></tr>
                ))}
              </tbody>
            </table>

            {history.length > 0 && (
              <>
                <div className="ch" style={{ marginTop: 16, borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: '.84rem' }}>
                  Historial de Cálculos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {history.map((h, i) => (
                    <div key={i} style={{ background: 'var(--gl)', borderRadius: 'var(--rs)', padding: '9px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <strong style={{ fontSize: '.84rem' }}>{h.drug}</strong>
                        <span style={{ fontSize: '.71rem', color: 'var(--soft)' }}>{h.timestamp}</span>
                      </div>
                      <div style={{ fontSize: '.8rem', color: 'var(--soft)' }}>
                        {h.species} · {h.weight} kg → <strong>{h.totalMg} mg</strong> ({h.volMl} mL)
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function markdownToHtml(md) {
  return md
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
