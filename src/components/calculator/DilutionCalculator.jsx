import { useState } from 'react'
import { FlaskIcon } from '../../Icons/Icons'

function calcDilution({ c1, c2, v2 }) {
  if (!c1 || !c2 || !v2 || c1 <= 0 || c2 <= 0 || v2 <= 0) return null
  if (c2 > c1) return { error: 'La concentración final (C₂) no puede ser mayor que la inicial (C₁).' }
  const v1      = (c2 * v2) / c1
  const solvent = v2 - v1
  return { v1: v1.toFixed(2), solvent: solvent.toFixed(2), v2: parseFloat(v2).toFixed(2) }
}

function calcDripRate({ vol, time, factor }) {
  if (!vol || !time || !factor || time <= 0) return null
  const mlPerHour = vol / time
  const drops     = (vol * factor) / (time * 60)
  return { mlPerHour: mlPerHour.toFixed(1), drops: drops.toFixed(0) }
}

export default function DilutionCalculator() {
  const [c1, setC1] = useState('')
  const [c2, setC2] = useState('')
  const [v2, setV2] = useState('')
  const [dilResult, setDilResult] = useState(null)

  const [vol,    setVol]    = useState('')
  const [time,   setTime]   = useState('')
  const [factor, setFactor] = useState('20')
  const [dripResult, setDripResult] = useState(null)

  function handleDilution() {
    setDilResult(calcDilution({ c1: parseFloat(c1), c2: parseFloat(c2), v2: parseFloat(v2) }))
  }

  function handleDrip() {
    setDripResult(calcDripRate({ vol: parseFloat(vol), time: parseFloat(time), factor: parseFloat(factor) }))
  }

  return (
    <div className="wrap">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FlaskIcon size={20} style={{ color: 'var(--blue)' }} /> Dilución y Goteo IV
        </span>
        <span className="scnt">Calculadoras clínicas</span>
      </div>

      <div className="cgrid">
        {/* Dilution card */}
        <div className="card2">
          <div className="ch">Dilución · C₁V₁ = C₂V₂</div>
          <div className="cb">
            <div className="fgrp">
              <label className="flbl">C₁ — Concentración inicial (mg/mL)</label>
              <input className="fc" type="number" min="0" step="0.1" placeholder="Ej: 50"
                value={c1} onChange={e => setC1(e.target.value)} />
            </div>
            <div className="fgrp">
              <label className="flbl">C₂ — Concentración final deseada (mg/mL)</label>
              <input className="fc" type="number" min="0" step="0.1" placeholder="Ej: 5"
                value={c2} onChange={e => setC2(e.target.value)} />
            </div>
            <div className="fgrp">
              <label className="flbl">V₂ — Volumen final deseado (mL)</label>
              <input className="fc" type="number" min="0" step="0.5" placeholder="Ej: 100"
                value={v2} onChange={e => setV2(e.target.value)} />
            </div>

            <button className="btnp" onClick={handleDilution} disabled={!c1 || !c2 || !v2}>
              Calcular dilución
            </button>

            {dilResult && (
              <div className="cres show">
                {dilResult.error ? (
                  <div className="wbox"><span>⚠</span><span>{dilResult.error}</span></div>
                ) : (
                  <>
                    <div className="crtitle">Resultado</div>
                    <div className="crow">
                      <span>V₁ — Tomar del stock</span><span>{dilResult.v1} mL</span>
                    </div>
                    <div className="crow">
                      <span>Solvente a agregar</span><span>{dilResult.solvent} mL</span>
                    </div>
                    <div className="crow">
                      <span>Volumen final</span><span>{dilResult.v2} mL</span>
                    </div>
                    <div style={{ marginTop: 10, background: 'var(--gl)', borderRadius: 'var(--rs)', padding: '8px 12px', fontSize: '.8rem', color: 'var(--soft)' }}>
                      <strong>Fórmula:</strong> {c1} mg/mL × {dilResult.v1} mL = {c2} mg/mL × {dilResult.v2} mL
                    </div>
                    <div className="abox b" style={{ marginTop: 8 }}>
                      <p style={{ fontSize: '.82rem' }}>
                        <strong>Procedimiento:</strong> Tomar <strong>{dilResult.v1} mL</strong> del stock
                        y aforar con <strong>{dilResult.solvent} mL</strong> de solvente hasta <strong>{dilResult.v2} mL</strong>.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Drip rate card */}
        <div className="card2">
          <div className="ch">Goteo IV y Fluidoterapia</div>
          <div className="cb">
            <div className="fgrp">
              <label className="flbl">Volumen total a infundir (mL)</label>
              <input className="fc" type="number" min="0" step="10" placeholder="Ej: 500"
                value={vol} onChange={e => setVol(e.target.value)} />
            </div>
            <div className="fgrp">
              <label className="flbl">Tiempo de infusión (horas)</label>
              <input className="fc" type="number" min="0" step="0.5" placeholder="Ej: 4"
                value={time} onChange={e => setTime(e.target.value)} />
            </div>
            <div className="fgrp">
              <label className="flbl">Factor de goteo</label>
              <select className="fc" value={factor} onChange={e => setFactor(e.target.value)}>
                <option value="20">20 gotas/mL — Macrogotero (adultos)</option>
                <option value="60">60 gotas/mL — Microgotero (pediátrico)</option>
                <option value="15">15 gotas/mL</option>
                <option value="10">10 gotas/mL</option>
              </select>
            </div>

            <button className="btnp" onClick={handleDrip} disabled={!vol || !time}>
              Calcular goteo
            </button>

            {dripResult && (
              <div className="cres show">
                <div className="crtitle">Resultado</div>
                <div className="crow">
                  <span>Velocidad de infusión</span><span>{dripResult.mlPerHour} mL/h</span>
                </div>
                <div className="crow">
                  <span>Gotas por minuto</span><span>{dripResult.drops} gts/min</span>
                </div>
                <div className="abox b" style={{ marginTop: 10 }}>
                  <p style={{ fontSize: '.82rem' }}>
                    <strong>Práctica:</strong> Ajustar el equipo a <strong>{dripResult.drops} gotas/min</strong> para
                    infundir {vol} mL en {time} hora{time !== '1' ? 's' : ''}.
                  </p>
                </div>
              </div>
            )}

            {/* Reference table */}
            <div style={{ marginTop: 16 }}>
              <div className="crtitle">Tasas de referencia clínica</div>
              <table className="dtbl" style={{ marginTop: 8 }}>
                <thead>
                  <tr><th>Especie / Contexto</th><th>Tasa</th><th>Uso</th></tr>
                </thead>
                <tbody>
                  {[
                    ['Perro / Gato',             '2–5 mL/kg/h',   'Mantenimiento'],
                    ['Bovino adulto',             '2–4 mL/kg/h',   'Mantenimiento'],
                    ['Equino',                    '2–4 mL/kg/h',   'Mantenimiento'],
                    ['Ovino / Caprino',           '2–4 mL/kg/h',   'Mantenimiento'],
                    ['Equino / Bovino (choque)',  '20–40 mL/kg/h', 'Reanimación — NO mantenimiento'],
                  ].map(([e, r, u]) => (
                    <tr key={e}>
                      <td>{e}</td>
                      <td><strong>{r}</strong></td>
                      <td style={{ fontSize: '.75rem', color: u.includes('NO') ? 'var(--red)' : 'inherit', fontWeight: u.includes('NO') ? 700 : 'normal' }}>{u}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="abox rr" style={{ marginTop: 8, padding: '6px 10px', fontSize: '.78rem' }}>
                La tasa de reanimación de choque (20–40 mL/kg/h) se usa SOLO en urgencia hipovolémica. Administrarla como mantenimiento causa sobrehidratación y edema pulmonar.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
