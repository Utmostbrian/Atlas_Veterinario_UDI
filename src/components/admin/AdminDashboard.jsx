import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  PieChart, Pie, Legend,
  LineChart, Line,
} from 'recharts'
import { useAuth } from '../../context/AuthContext'
import { getStats, getFailedLogins } from '../../services/auditService'
import { eventColor, eventLabel } from '../../constants/auditEvents'
import {
  FileTextIcon, SearchIcon, SparklesIcon, CalculatorIcon, SyringeIcon,
} from '../../Icons/Icons'
import styles from './AdminDashboard.module.css'

const ConsultationHistory = lazy(() => import('../audit/ConsultationHistory'))
const UsersPanel          = lazy(() => import('./UsersPanel'))

const ROLE_LABEL = {
  admin:   'Administrador',
  docente: 'Docente',
  student: 'Estudiante',
  unknown: 'Sin asignar',
}
const ROLE_COLOR = {
  admin:   '#CC0000',
  docente: '#7c3aed',
  student: '#003087',
  unknown: '#9ca3af',
}

const SPECIES_PALETTE = [
  '#003087', '#CC0000', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#9a3412', '#475569',
]

const PERIOD_OPTIONS = [
  { value: 7,   label: '7 días' },
  { value: 30,  label: '30 días' },
  { value: 90,  label: '90 días' },
]

function KpiCard({ Icon, label, value, accent, sub }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiIcon} style={{ background: `${accent}1a`, color: accent }}>
        <Icon size={20} />
      </div>
      <div className={styles.kpiBody}>
        <div className={styles.kpiValue}>{value}</div>
        <div className={styles.kpiLabel}>{label}</div>
        {sub && <div className={styles.kpiSub}>{sub}</div>}
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children, height = 300, empty, raw = false }) {
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <h3>{title}</h3>
        {subtitle && <span>{subtitle}</span>}
      </div>
      <div className={styles.chartBody} style={{ height }}>
        {empty ? (
          <div className={styles.chartEmpty}>{empty}</div>
        ) : raw ? (
          /* HTML/div content (e.g. heatmap) — ResponsiveContainer solo acepta
             componentes Recharts y rompe layout con children no-SVG */
          children
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function HourHeatmap({ data }) {
  const map = new Map(
    (data ?? [])
      .filter(d => { const h = Number(d.hour_of_day); return Number.isFinite(h) && h >= 0 && h < 24 })
      .map(d => [Number(d.hour_of_day), Math.max(0, Number(d.events_count))])
  )
  const counts = Array.from({ length: 24 }, (_, h) => map.get(h) ?? 0)
  const max = Math.max(1, ...counts)
  const peakHour = counts.indexOf(max)
  const totalEvents = counts.reduce((a, b) => a + b, 0)

  return (
    <div className={styles.heatmapWrap}>
      <div className={styles.heatmapGrid}>
        {counts.map((count, h) => {
          const intensity = count / max
          return (
            <div
              key={h}
              className={styles.heatmapCell}
              title={`${h.toString().padStart(2, '0')}:00 — ${count} eventos`}
            >
              <div
                className={styles.heatmapBlock}
                style={{
                  background: count > 0
                    ? `rgba(204, 0, 0, ${0.18 + intensity * 0.78})`
                    : 'rgba(0,0,0,.04)',
                }}
              />
              <span className={styles.heatmapLabel}>{h.toString().padStart(2, '0')}</span>
            </div>
          )
        })}
      </div>
      <div className={styles.heatmapMeta}>
        <span>Pico: <strong>{peakHour.toString().padStart(2, '0')}:00</strong> ({max} eventos)</span>
        <span>{totalEvents} eventos en total</span>
      </div>
    </div>
  )
}

function Tabs({ value, onChange, items }) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map(it => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={`${styles.tab} ${value === it.value ? styles.tabActive : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const { user: me } = useAuth()
  const [period,     setPeriod]     = useState(30)
  const [kpis,       setKpis]       = useState(null)
  const [failedLog,  setFailedLog]  = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [tab,        setTab]        = useState('dashboard')

  useEffect(() => {
    if (tab === 'users' && me?.role !== 'admin') setTab('dashboard')
  }, [me?.role, tab])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([getStats({ days: period }), getFailedLogins({ days: period, limit: null })])
      .then(([s, f]) => {
        if (cancelled) return
        setKpis(s)
        setFailedLog(f)
      })
      .catch(err => { if (!cancelled) { setKpis(null); setFailedLog(null); setError(err?.message ?? 'Error cargando KPIs') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period])

  const topDrugs = useMemo(() => {
    return (kpis?.top_drugs ?? []).map(d => ({
      name:  d.drug_name,
      total: Number(d.total_searches),
    }))
  }, [kpis])

  const eventTypeData = useMemo(() => {
    const byType = kpis?.by_type ?? {}
    return Object.entries(byType).map(([key, total]) => ({
      key,
      label: eventLabel(key, { plural: true }),
      total: Number(total),
      color: eventColor(key),
    }))
  }, [kpis])

  const speciesData = useMemo(() => {
    const bySpecies = kpis?.by_species ?? {}
    return Object.entries(bySpecies).map(([name, total]) => ({
      name,
      value: Number(total),
    })).sort((a, b) => b.value - a.value)
  }, [kpis])

  const roleData = useMemo(() => {
    const byRole = kpis?.by_role ?? {}
    return Object.entries(byRole).map(([role, total]) => ({
      role,
      name:  ROLE_LABEL[role] ?? role,
      value: Number(total),
      color: ROLE_COLOR[role] ?? '#475569',
    }))
  }, [kpis])

  const dayData = useMemo(() => {
    return (kpis?.by_day ?? []).map(d => ({
      day: new Date(d.day).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit' }),
      total: Number(d.events_count),
    }))
  }, [kpis])

  const doseCalcCount    = Number(kpis?.by_type?.DOSE_CALCULATED ?? 0)
  const aiConsultations  = Number(kpis?.by_type?.AI_CONSULTATION ?? 0)
  const drugSearches     = Number(kpis?.by_type?.DRUG_SEARCH ?? 0)
  const mostSearchedDrug = topDrugs[0]?.name ?? '—'
  const mostSearchedCount = topDrugs[0]?.total ?? 0

  if (tab === 'log') {
    return (
      <div className="wrap">
        <DashboardHeader period={period} onPeriodChange={setPeriod} tab={tab} setTab={setTab} role={me?.role} hideControls />
        <Suspense fallback={<div className="ld"><div className="sp" /><p>Cargando log...</p></div>}>
          <ConsultationHistory />
        </Suspense>
      </div>
    )
  }

  if (tab === 'users' && me?.role === 'admin') {
    return (
      <div className="wrap">
        <DashboardHeader period={period} onPeriodChange={setPeriod} tab={tab} setTab={setTab} role={me?.role} hideControls />
        <Suspense fallback={<div className="ld"><div className="sp" /><p>Cargando usuarios...</p></div>}>
          <UsersPanel />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="wrap">
      <DashboardHeader period={period} onPeriodChange={setPeriod} tab={tab} setTab={setTab} role={me?.role} />

      {error && (
        <div className={styles.errorBanner}>
          {error.includes('insufficient_privilege')
            ? 'Necesitas rol Admin o Docente para ver el dashboard.'
            : error}
        </div>
      )}

      {loading && !kpis ? (
        <div className="ld" style={{ padding: 40 }}><div className="sp" /><p>Calculando KPIs...</p></div>
      ) : (
        <>
          {/* ── KPI cards ── */}
          <section className={styles.kpiGrid}>
            <KpiCard
              Icon={FileTextIcon}
              label={`Total (últimos ${kpis?.period_days ?? period} días)`}
              value={(kpis?.total ?? 0).toLocaleString('es-BO')}
              accent="#003087"
            />
            <KpiCard
              Icon={FileTextIcon}
              label="Eventos hoy"
              value={(kpis?.today ?? 0).toLocaleString('es-BO')}
              accent="#16a34a"
            />
            <KpiCard
              Icon={SyringeIcon}
              label="Ficha más consultada"
              value={mostSearchedDrug}
              sub={mostSearchedCount > 0 ? `${mostSearchedCount} aperturas` : null}
              accent="#7c3aed"
            />
            <KpiCard
              Icon={SparklesIcon}
              label="Consultas IA"
              value={aiConsultations.toLocaleString('es-BO')}
              accent="#CC0000"
            />
            <KpiCard
              Icon={CalculatorIcon}
              label="Cálculos de dosis"
              value={doseCalcCount.toLocaleString('es-BO')}
              accent="#16a34a"
            />
            <KpiCard
              Icon={SearchIcon}
              label="Búsquedas de fármacos"
              value={drugSearches.toLocaleString('es-BO')}
              accent="#d97706"
            />
          </section>

          {/* ── Categoría A — Uso Clínico ── */}
          <h2 className={styles.sectionTitle}>Uso clínico</h2>
          <div className={styles.chartsGrid}>
            <ChartCard
              title="Top 10 fichas de fármacos consultadas"
              subtitle={`Últimos ${kpis?.period_days ?? period} días`}
              empty={topDrugs.length === 0 ? 'Sin fichas consultadas en el período.' : null}
            >
              <BarChart data={topDrugs} layout="vertical" margin={{ top: 6, right: 20, left: 8, bottom: 6 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip cursor={{ fill: 'rgba(204,0,0,.06)' }} contentStyle={tooltipStyle} />
                <Bar dataKey="total" fill="#CC0000" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Distribución por especie"
              subtitle="Consultas con especie identificada"
              empty={speciesData.length === 0 ? 'Sin especie registrada en el período.' : null}
              height={420}
            >
              <PieChart margin={{ top: 16, right: 16, bottom: 0, left: 16 }}>
                <Pie
                  data={speciesData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="44%"
                  innerRadius={50}
                  outerRadius={95}
                  paddingAngle={2}
                  labelLine={false}
                >
                  {speciesData.map((entry, idx) => (
                    <Cell key={entry.name} fill={SPECIES_PALETTE[idx % SPECIES_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 11, paddingTop: 28, lineHeight: 1.9 }}
                />
              </PieChart>
            </ChartCard>

            <ChartCard
              title="Frecuencia por tipo de evento"
              subtitle="Distribución entre módulos"
              empty={eventTypeData.length === 0 ? 'Aún no hay eventos.' : null}
            >
              <BarChart data={eventTypeData} margin={{ top: 6, right: 16, left: 0, bottom: 36 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-22} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(0,48,135,.05)' }} contentStyle={tooltipStyle} />
                <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {eventTypeData.map(e => <Cell key={e.key} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ChartCard>
          </div>

          {/* ── Categoría B — Seguridad ── */}
          <h2 className={styles.sectionTitle}>Seguridad</h2>
          <div className={styles.chartsGrid}>
            <ChartCard
              title="Consultas por rol de usuario"
              subtitle="Quién genera la mayor parte del tráfico"
              empty={roleData.length === 0 ? 'Sin datos de rol todavía.' : null}
              height={420}
            >
              <PieChart margin={{ top: 16, right: 16, bottom: 0, left: 16 }}>
                <Pie
                  data={roleData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="44%"
                  outerRadius={95}
                  paddingAngle={2}
                  labelLine={false}
                >
                  {roleData.map(entry => <Cell key={entry.role} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 11, paddingTop: 28, lineHeight: 1.9 }}
                  formatter={(value) => {
                    const item = roleData.find(r => r.name === value)
                    if (!item) return value
                    const total = roleData.reduce((s, r) => s + r.value, 0)
                    const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
                    return `${value} (${pct}%)`
                  }}
                />
              </PieChart>
            </ChartCard>

            <div className={styles.securityCard}>
              <div className={styles.securityHead}>
                <h3>Intentos de login fallidos</h3>
                <span>Últimos {failedLog?.period_days ?? period} días</span>
              </div>
              {failedLog?.available === false ? (
                <div className={styles.securityWarn}>
                  <strong>No disponible.</strong>
                  <p>
                    No se pudo leer la tabla de intentos fallidos en Supabase. Revisa la migración
                    de <code>login_failures</code>, permisos de la RPC y la sesión actual.
                  </p>
                  {failedLog?.reason && <small>Causa: {failedLog.reason}</small>}
                </div>
              ) : (
                <>
                  <div className={styles.securityMetric}>
                    <span className={styles.securityNumber}>{failedLog?.total ?? 0}</span>
                    <span className={styles.securityCaption}>intentos fallidos detectados</span>
                  </div>
                  {Array.isArray(failedLog?.recent) && failedLog.recent.length > 0 && (
                    <>
                      <div className={styles.securityListMeta}>
                        Mostrando {failedLog.recent.length.toLocaleString('es-BO')} de {(failedLog?.total ?? failedLog.recent.length).toLocaleString('es-BO')}
                      </div>
                      <ul className={styles.securityList}>
                        {failedLog.recent.map((r, i) => (
                          <li key={`${r.created_at ?? 'login'}-${r.email ?? 'unknown'}-${i}`}>
                            <strong>{r.email ?? 'desconocido'}</strong>
                            <span>{new Date(r.created_at).toLocaleString('es-BO')}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Categoría C — Rendimiento ── */}
          <h2 className={styles.sectionTitle}>Rendimiento del sistema</h2>
          <div className={styles.chartsGrid}>
            <ChartCard
              title="Volumen diario"
              subtitle={`Eventos por día — últimos ${kpis?.period_days ?? period} días`}
              empty={dayData.every(d => d.total === 0) ? 'Sin actividad en el período.' : null}
            >
              <LineChart data={dayData} margin={{ top: 6, right: 12, left: 0, bottom: 6 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#003087"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#003087' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartCard>

            <ChartCard
              title="Actividad por hora del día"
              subtitle="Heatmap de picos de uso (hora local)"
              height={180}
              raw
              empty={(kpis?.by_hour ?? []).length === 0 ? 'Sin actividad horaria todavía.' : null}
            >
              <HourHeatmap data={kpis?.by_hour ?? []} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}

function DashboardHeader({ period, onPeriodChange, tab, setTab, role, hideControls }) {
  const tabs = [
    { value: 'dashboard', label: 'KPIs' },
    { value: 'log',       label: 'Log de eventos' },
    { value: 'users',     label: 'Usuarios' },
  ].filter(it => it.value !== 'users' || role === 'admin')

  return (
    <div className={styles.dashHeader}>
      <div>
        <h1 className={styles.dashTitle}>
          <FileTextIcon size={20} style={{ color: 'var(--blue)' }} />
          Dashboard de Administración
        </h1>
        <p className={styles.dashSub}>
          Monitoreo en tiempo real del Atlas Farmacológico Veterinario · UDI
          {role && <span className={styles.roleHint}> · {role === 'admin' ? 'Admin' : 'Docente'}</span>}
        </p>
      </div>
      <div className={styles.dashControls}>
        <Tabs value={tab} onChange={setTab} items={tabs} />
        {!hideControls && (
          <select
            className={styles.periodSelect}
            value={period}
            onChange={e => onPeriodChange(Number(e.target.value))}
            aria-label="Período"
          >
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

const tooltipStyle = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,.08)',
}
