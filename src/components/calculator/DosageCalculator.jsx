import { useState } from 'react'
import { useDrugCalculator, UNITS } from '../../hooks/useDrugCalculator'
import { validateDose, fetchDrugProfileWithAI } from '../../services/anthropicService'
import { logDoseCalculation, logDoseValidation } from '../../services/auditService'
import { CalculatorIcon, SparklesIcon } from '../../Icons/Icons'
import { DRUG_NAMES } from '../../data/drugsDatabase'

export default function DosageCalculator({ onLoginRequired }) {
  const calc = useDrugCalculator()

  // Estado para el "Buscar con IA" (obtiene el perfil clínico del fármaco)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError,   setProfileError]   = useState('')

  // Estado para la validación post-cálculo con IA
  const [aiResult,  setAiResult]  = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')

  // ── Modo IA: fármaco escrito, no en BD, sin perfil cargado aún ───────────
  const needsAiLookup = calc.drugInput.trim().length >= 3 && !calc.matchedDrug
  // Si hay perfil IA cargado pero no es de BD (aiDrugProfile !== null)
  const hasAiProfile  = !!calc.aiDrugProfile

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCalculate() {
    const entry = calc.calculate()
    if (!entry) return
    setAiResult('')
    logDoseCalculation(entry)
  }

  async function handleFetchAiProfile() {
    const drug = calc.drugInput.trim()
    if (!drug) return
    if (onLoginRequired) { onLoginRequired(); return }
    setProfileLoading(true)
    setProfileError('')
    setAiResult('')
    try {
      const profile = await fetchDrugProfileWithAI(drug)
      if (!profile) {
        setProfileError(`"${drug}" no es reconocido como fármaco veterinario. Verifica el nombre o la ortografía.`)
        return
      }
      // El hook ajusta automáticamente especie, vía y unidad
      calc.setAiDrugProfile(profile)
    } catch (err) {
      setProfileError(err.message)
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleValidate() {
    if (!calc.result || !calc.matchedDrug) return
    if (onLoginRequired) { onLoginRequired(); return }
    setAiLoading(true)
    setAiError('')
    setAiResult('')
    try {
      const text = await validateDose({
        drug:    calc.result.drug,
        species: calc.result.species,
        weight:  calc.result.weight,
        dose:    `${calc.result.totalMg} ${calc.result.doseUnit === 'UI/kg' ? 'UI' : 'mg'} (${calc.result.volMl} mL)`,
        unit:    calc.result.unit,
        route:   calc.result.route,
      })
      setAiResult(text)
      logDoseValidation({
        drug:      calc.result.drug,
        species:   calc.result.species,
        weight:    calc.result.weight,
        totalDose: calc.result.totalMg,
        aiVerdict: text.slice(0, 100),
      })
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  // ── Etiquetas dinámicas ───────────────────────────────────────────────────

  function calcButtonLabel() {
    if (!calc.matchedDrug && !calc.drugInput.trim()) return 'Ingresa un fármaco'
    if (!calc.matchedDrug && needsAiLookup)           return 'Busca el perfil con IA'
    if (!calc.matchedDrug)                            return 'Calcular dosis'
    if (calc.routeError)                              return 'Vía no permitida'
    if (calc.speciesError)                            return 'Especie no indicada'
    if (!calc.canCalculate)                           return 'Completar datos'
    return 'Calcular dosis'
  }

  const doseLabel = `Dosis (${calc.matchedDrug ? calc.matchedDrug.doseUnit : 'mg/kg'})`
  const rangePlaceholder = calc.currentRange
    ? `${calc.currentRange.min}–${calc.currentRange.max}`
    : 'Ej: 10'

  // Color del borde del input de fármaco
  const drugBorderColor = calc.matchedDrug && !hasAiProfile
    ? '#16a34a'           // verde: reconocido en BD
    : hasAiProfile
      ? '#d97706'         // ámbar: verificado por IA (no en BD oficial)
      : needsAiLookup
        ? '#d97706'       // ámbar: escribiendo, no encontrado
        : undefined

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="wrap">
      <div className="shdr">
        <span className="stitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalculatorIcon size={20} style={{ color: 'var(--blue)' }} /> Calculadora de Dosis
        </span>
        <span className="scnt">
          Base de datos clínica · Fármacos no registrados: la IA carga el perfil clínico
        </span>
      </div>

      <div className="cgrid">

        {/* ── Panel izquierdo: inputs ─────────────────────────────────────── */}
        <div className="card2">
          <div className="ch">Datos del Paciente y Fármaco</div>
          <div className="cb">

            {/* Fármaco */}
            <div className="fgrp">
              <label className="flbl">Fármaco / Principio activo</label>
              <input
                className="fc"
                list="drug-datalist"
                placeholder="Ej: Amoxicilina, Tramadol, Ketamina..."
                value={calc.drugInput}
                onChange={e => calc.setDrugInput(e.target.value)}
                autoComplete="off"
                style={{ borderColor: drugBorderColor }}
              />
              <datalist id="drug-datalist">
                {DRUG_NAMES.map(n => <option key={n} value={n} />)}
              </datalist>

              {/* ── Fármaco en BD → verde ── */}
              {calc.matchedDrug && !hasAiProfile && (
                <div style={{ marginTop: 5, fontSize: '.79rem', color: 'var(--soft)', lineHeight: 1.5 }}>
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Reconocido en BD</span>
                  {' · '}Vías: <strong>{calc.matchedDrug.allowedRoutes.join(', ')}</strong>
                  {calc.matchedDrug.standardConcentrations?.length > 0 && (
                    <span>
                      {' · '}Conc. estándar:{' '}
                      <strong>
                        {calc.matchedDrug.standardConcentrations.join(', ')}{' '}
                        {calc.matchedDrug.doseUnit === 'UI/kg' ? 'UI/mL' : 'mg/mL'}
                      </strong>
                    </span>
                  )}
                </div>
              )}

              {/* Nota clínica BD */}
              {calc.matchedDrug?.note && !hasAiProfile && (
                <div className="abox b" style={{ marginTop: 6, padding: '6px 10px', fontSize: '.8rem' }}>
                  {calc.matchedDrug.note}
                </div>
              )}

              {/* ── Perfil IA cargado → ámbar ── */}
              {hasAiProfile && (
                <div style={{ marginTop: 5, fontSize: '.79rem', color: 'var(--soft)', lineHeight: 1.5 }}>
                  <span style={{ color: '#d97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <SparklesIcon size={12} />
                    Verificado por IA
                  </span>
                  {' · '}Vías: <strong>{calc.matchedDrug.allowedRoutes.join(', ')}</strong>
                  {calc.matchedDrug.standardConcentrations?.length > 0 && (
                    <span>
                      {' · '}Conc.:{' '}
                      <strong>
                        {calc.matchedDrug.standardConcentrations.join(', ')}{' '}
                        {calc.matchedDrug.doseUnit === 'UI/kg' ? 'UI/mL' : 'mg/mL'}
                      </strong>
                    </span>
                  )}
                </div>
              )}

              {/* Nota clínica IA */}
              {hasAiProfile && calc.matchedDrug?.note && (
                <div className="abox o" style={{ marginTop: 6, padding: '6px 10px', fontSize: '.8rem' }}>
                  {calc.matchedDrug.note}
                </div>
              )}

              {/* ── No en BD y sin perfil → botón "Buscar con IA" ── */}
              {needsAiLookup && !profileLoading && (
                <div style={{ marginTop: 7 }}>
                  <button
                    type="button"
                    onClick={handleFetchAiProfile}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px', fontSize: '.8rem', fontWeight: 600,
                      background: '#d97706', color: '#fff', border: 'none',
                      borderRadius: 'var(--rs)', cursor: 'pointer', transition: 'background .15s',
                    }}
                  >
                    <SparklesIcon size={13} />
                    Buscar con IA
                  </button>
                  <span style={{ marginLeft: 9, fontSize: '.77rem', color: 'var(--soft)' }}>
                    "{calc.drugInput}" no está en la base de datos local
                  </span>
                </div>
              )}

              {/* Buscando... */}
              {profileLoading && (
                <div className="abox b" style={{ marginTop: 6, padding: '7px 12px', fontSize: '.81rem', display: 'flex', gap: 7, alignItems: 'center' }}>
                  <SparklesIcon size={13} />
                  Consultando perfil clínico de "{calc.drugInput}"...
                </div>
              )}

              {/* Error de búsqueda IA */}
              {profileError && (
                <div className="abox rr" style={{ marginTop: 6, padding: '6px 10px', fontSize: '.81rem' }}>
                  {profileError}
                </div>
              )}
            </div>

            {/* Especie y Peso */}
            <div className="frow">
              <div className="fgrp">
                <label className="flbl">Especie</label>
                <select
                  className="fc"
                  value={calc.species}
                  onChange={e => calc.setSpecies(e.target.value)}
                >
                  {calc.availableSpecies.map(s => <option key={s}>{s}</option>)}
                </select>
                {calc.speciesError && (
                  <div className="abox rr" style={{ marginTop: 4, padding: '4px 8px', fontSize: '.8rem' }}>
                    {calc.speciesError}
                  </div>
                )}
              </div>

              <div className="fgrp">
                <label className="flbl">Peso (kg)</label>
                <input
                  className="fc"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Ej: 25"
                  value={calc.weight}
                  onChange={e => calc.setWeight(e.target.value)}
                />
              </div>
            </div>

            {/* Dosis y Concentración */}
            <div className="frow">
              <div className="fgrp">
                <label className="flbl">
                  {doseLabel}
                  {calc.currentRange && (
                    <span style={{ fontSize: '.75rem', color: 'var(--soft)', marginLeft: 6 }}>
                      Rango: {calc.currentRange.min}–{calc.currentRange.max}
                    </span>
                  )}
                </label>
                <input
                  className="fc"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={rangePlaceholder}
                  value={calc.dose}
                  onChange={e => calc.setDose(e.target.value)}
                  style={{ borderColor: calc.doseWarning ? '#f59e0b' : undefined }}
                />
                {calc.doseWarning && (
                  <div className="wbox" style={{ marginTop: 4, padding: '4px 8px', fontSize: '.8rem' }}>
                    <span>⚠</span>
                    <span>{calc.doseWarning}</span>
                  </div>
                )}
              </div>

              <div className="fgrp">
                <label className="flbl">Concentración</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="fc"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="Ej: 50"
                    value={calc.conc}
                    onChange={e => calc.setConc(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <select
                    className="fc"
                    value={calc.unit}
                    onChange={e => calc.setUnit(e.target.value)}
                    style={{ width: 100 }}
                  >
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>

                {/* Quick-pick concentraciones (BD y IA) */}
                {calc.matchedDrug?.standardConcentrations?.length > 0 && (
                  <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '.72rem', color: 'var(--soft)', alignSelf: 'center' }}>Rápido:</span>
                    {calc.matchedDrug.standardConcentrations.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => calc.pickConcentration(c)}
                        style={{
                          fontSize: '.72rem',
                          padding: '2px 9px',
                          background: String(c) === calc.conc ? 'var(--blue)' : 'var(--gl)',
                          color: String(c) === calc.conc ? '#fff' : 'var(--text)',
                          border: '1px solid var(--border)',
                          borderRadius: 20,
                          cursor: 'pointer',
                          transition: 'background .15s',
                        }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Vía de administración */}
            <div className="fgrp">
              <label className="flbl">Vía de administración</label>
              <select
                className="fc"
                value={calc.route}
                onChange={e => calc.setRoute(e.target.value)}
                style={{ borderColor: calc.routeError ? '#dc2626' : undefined }}
              >
                {calc.availableRoutes.map(r => <option key={r}>{r}</option>)}
              </select>
              {calc.routeError && (
                <div className="abox rr" style={{ marginTop: 4, padding: '4px 8px', fontSize: '.8rem' }}>
                  {calc.routeError}
                </div>
              )}
            </div>

            {/* Botón principal */}
            <button
              className="btnp"
              onClick={handleCalculate}
              disabled={!calc.canCalculate}
            >
              {calcButtonLabel()}
            </button>

            {/* ── Resultado ── */}
            {calc.result && (
              <div className="cres show">
                <div className="crtitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  Resultado del Cálculo
                  {calc.result.aiCalculated && (
                    <span style={{
                      fontSize: '.68rem', fontWeight: 700,
                      padding: '2px 8px', background: '#d97706',
                      color: '#fff', borderRadius: 10,
                    }}>
                      IA
                    </span>
                  )}
                </div>

                <div className="crow">
                  <span>Dosis total</span>
                  <span>
                    {calc.result.totalMg}{' '}
                    {calc.result.doseUnit === 'UI/kg' ? 'UI' : 'mg'}
                  </span>
                </div>
                <div className="crow">
                  <span>Volumen a administrar</span>
                  <span>{calc.result.volMl} mL</span>
                </div>
                {calc.result.concNote && (
                  <div className="crow" style={{ color: 'var(--soft)', fontSize: '.85em' }}>
                    <span>Concentración efectiva</span>
                    <span>{calc.result.concNote}</span>
                  </div>
                )}
                <div className="crow">
                  <span>Paciente</span>
                  <span>
                    {calc.result.drug} · {calc.result.species} · {calc.result.weight} kg · {calc.result.route}
                  </span>
                </div>

                {calc.result.hadWarning && (
                  <div className="abox o" style={{ marginTop: 8, fontSize: '.82rem' }}>
                    Dosis fuera del rango de referencia clínica. Se recomienda validación con IA.
                  </div>
                )}

                {/* Validar con IA: funciona para BD y para perfiles IA */}
                <button
                  className="btnp"
                  onClick={handleValidate}
                  disabled={aiLoading}
                  style={{ marginTop: 10 }}
                >
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
                <span>⚠</span>
                <span><strong>Error:</strong> {aiError}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Panel derecho: referencia + historial ──────────────────────── */}
        <div className="card2">
          <div className="ch">
            {calc.matchedDrug
              ? hasAiProfile
                ? `IA: ${calc.matchedDrug.name}`
                : `Referencia: ${calc.matchedDrug.name}`
              : 'Rangos de Referencia'}
          </div>
          <div className="cb">

            {calc.matchedDrug ? (
              /* Tabla dinámica: funciona igual para BD y perfil IA */
              <>
                <table className="dtbl">
                  <thead>
                    <tr>
                      <th>Especie</th>
                      <th>Rango ({calc.matchedDrug.doseUnit})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(calc.matchedDrug.dosageRange).map(([sp, range]) => (
                      <tr
                        key={sp}
                        style={{
                          background: sp === calc.species ? 'rgba(204,0,0,.08)' : undefined,
                          fontWeight: sp === calc.species ? 600 : undefined,
                        }}
                      >
                        <td>{sp}{sp === calc.species ? ' ←' : ''}</td>
                        <td>
                          <strong>
                            {range.min === range.max
                              ? range.min
                              : `${range.min}–${range.max}`}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, fontSize: '.79rem', color: 'var(--soft)' }}>
                  Vías permitidas: {calc.matchedDrug.allowedRoutes.join(' · ')}
                </div>
                {hasAiProfile && (
                  <div className="abox b" style={{ marginTop: 10, padding: '7px 10px', fontSize: '.78rem' }}>
                    Datos clínicos obtenidos por IA. Verificar con Plumb's o fuentes especializadas antes del uso clínico.
                  </div>
                )}
              </>
            ) : (
              /* Tabla genérica + indicador modo IA */
              <>
                {needsAiLookup && !profileLoading && (
                  <div
                    className="abox o"
                    style={{ marginBottom: 12, padding: '8px 12px', fontSize: '.81rem', display: 'flex', gap: 7, alignItems: 'flex-start' }}
                  >
                    <SparklesIcon size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>
                      Usa <strong>Buscar con IA</strong> para cargar los rangos clínicos de{' '}
                      <strong>{calc.drugInput}</strong>. El formulario se completará automáticamente.
                    </span>
                  </div>
                )}
                <table className="dtbl">
                  <thead><tr><th>Fármaco · Especie</th><th>Rango</th></tr></thead>
                  <tbody>
                    {[
                      ['Amoxicilina · Perro/Gato', '11–22 mg/kg'],
                      ['Enrofloxacina · Perro',    '5–20 mg/kg'],
                      ['Meloxicam · Perro',        '0.1–0.2 mg/kg'],
                      ['Ketamina · Gato',          '11–33 mg/kg'],
                      ['Ivermectina · Bovino',     '0.2 mg/kg'],
                      ['Flunixin · Equino',        '1.1 mg/kg'],
                    ].map(([d, r]) => (
                      <tr key={d}><td>{d}</td><td><strong>{r}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Historial */}
            {calc.history.length > 0 && (
              <>
                <div
                  className="ch"
                  style={{ marginTop: 16, borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: '.84rem' }}
                >
                  Historial de Cálculos
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {calc.history.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        background: 'var(--gl)',
                        borderRadius: 'var(--rs)',
                        padding: '9px 12px',
                        borderLeft: h.hadWarning
                          ? '3px solid #f59e0b'
                          : h.aiCalculated
                            ? '3px solid #d97706'
                            : '3px solid transparent',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <strong style={{ fontSize: '.84rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {h.drug}
                          {h.aiCalculated && (
                            <span style={{
                              fontSize: '.63rem', fontWeight: 700,
                              padding: '1px 6px', background: '#d97706',
                              color: '#fff', borderRadius: 8,
                            }}>IA</span>
                          )}
                        </strong>
                        <span style={{ fontSize: '.71rem', color: 'var(--soft)' }}>{h.timestamp}</span>
                      </div>
                      <div style={{ fontSize: '.8rem', color: 'var(--soft)' }}>
                        {h.species} · {h.weight} kg →{' '}
                        <strong>{h.totalMg} {h.doseUnit === 'UI/kg' ? 'UI' : 'mg'}</strong>
                        {' '}({h.volMl} mL)
                        {h.hadWarning && (
                          <span style={{ color: '#f59e0b', marginLeft: 6 }}>⚠ fuera de rango</span>
                        )}
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
  if (!md) return ''
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>[^\n]*<\/li>\n?)+)/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
