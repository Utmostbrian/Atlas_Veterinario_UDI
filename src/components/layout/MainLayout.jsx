import Header from './Header'
import TabBar  from './TabBar'

export default function MainLayout({
  activeTab,
  onTabChange,
  darkMode,
  onToggleDark,
  apiKey,
  onApiKeyChange,
  onOpenLogin,
  children,
}) {
  return (
    <>
      <Header
        activeTab={activeTab}
        onTabChange={onTabChange}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
        apiKey={apiKey}
        onApiKeyChange={onApiKeyChange}
        onOpenLogin={onOpenLogin}
      />
      <TabBar activeTab={activeTab} onTabChange={onTabChange} />

      <main style={{ minHeight: '60vh' }}>
        {children}
      </main>

      <footer>
        <div className="fstripe" />
        <div className="fbody">
          <div className="fbrand">
            <h3>Atlas Farmacológico Veterinario</h3>
            <p>
              Herramienta docente de referencia farmacológica para la Facultad de Veterinaria
              de la Universidad UDI. Orientada a la formación clínica integral del
              médico veterinario.
            </p>
            <p style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.35)' }}>
              Dosis orientativas. Consulte siempre con un veterinario profesional antes de administrar cualquier fármaco.
            </p>
          </div>
          <div className="fcol">
            <h4>Secciones</h4>
            <ul>
              <li><a href="#atlas">Atlas Farmacológico</a></li>
              <li><a href="#calc">Calculadora de Dosis</a></li>
              <li><a href="#inter">Interacciones</a></li>
              <li><a href="#enf">Protocolos</a></li>
              <li><a href="#glos">Glosario</a></li>
            </ul>
          </div>
          <div className="fcol">
            <h4>Información</h4>
            <ul>
              <li><a href="#receta">Generador de Recetas</a></li>
              <li><a href="#audit">Historial de Consultas</a></li>
            </ul>
            <h4 style={{ marginTop: 14 }}>Aviso Legal</h4>
            <p style={{ fontSize: '.73rem', lineHeight: 1.5 }}>
              Uso exclusivo con fines académicos. No reemplaza el juicio clínico profesional.
            </p>
          </div>
        </div>
        <div className="fbot">
          <span>Atlas Farmacológico Veterinario © {new Date().getFullYear()} · Facultad de Veterinaria – UDI</span>
          <span>Dosis orientativas · Consulta siempre con un veterinario profesional</span>
        </div>
      </footer>
    </>
  )
}
