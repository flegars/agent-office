import { useCallback, useState } from 'react'
import { DebugOffice } from './debug/DebugOffice'
import { Inspector } from './inspector/Inspector'
import { OfficeScene } from './scene/OfficeScene'
import { useOfficeUpdate } from './useOfficeUpdate'

function App(): React.JSX.Element {
  const update = useOfficeUpdate()
  const [debugOpen, setDebugOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const closeInspector = useCallback(() => setSelectedId(null), [])

  if (!update) {
    return <p className="placeholder">Connexion au process principal…</p>
  }
  return (
    <div className="app">
      <OfficeScene office={update.office} selectedId={selectedId} onSelect={setSelectedId} />
      {selectedId && (
        <Inspector
          key={selectedId}
          agentId={selectedId}
          agents={update.office.agents}
          onSelect={setSelectedId}
          onClose={closeInspector}
        />
      )}
      <button className="debug-toggle" onClick={() => setDebugOpen((open) => !open)}>
        {debugOpen ? 'Fermer le debug' : 'Debug'}
      </button>
      {debugOpen && (
        <div className="debug-overlay">
          <DebugOffice update={update} />
        </div>
      )}
    </div>
  )
}

export default App
