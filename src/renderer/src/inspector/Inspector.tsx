import { useEffect, useState } from 'react'
import type { AgentState } from '../../../core/types'
import { formatAge, formatClock, kindLabel, relativesOf, shortId, statusLabel } from './inspection'

const AGE_REFRESH_MS = 1_000

interface InspectorProps {
  agentId: string
  agents: AgentState[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function Inspector({
  agentId,
  agents,
  onSelect,
  onClose
}: InspectorProps): React.JSX.Element | null {
  const live = agents.find((agent) => agent.id === agentId)
  // Le store oublie un agent quelques secondes apres son depart : on garde sa derniere fiche lisible.
  const [lastKnown, setLastKnown] = useState(live)
  if (live && live !== lastKnown) {
    setLastKnown(live)
  }
  const now = useNow(AGE_REFRESH_MS)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const agent = live ?? lastKnown
  if (!agent) {
    return null
  }
  const { parent, team } = relativesOf(agents, agent)

  return (
    <aside className={live ? 'inspector' : 'inspector gone'} aria-label="Inspection">
      <header>
        <div>
          <h2 className={agent.kind}>{agent.label}</h2>
          <span className="muted">{kindLabel(agent)}</span>
        </div>
        <button className="close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </header>

      <section>
        <div className="status">{statusLabel(agent, Boolean(live))}</div>
        <div className="muted">Dernier événement {formatAge(now - agent.lastEventAt)}</div>
      </section>

      <Field title="Projet">
        <strong>{agent.project}</strong>
        <code className="block">{agent.cwd || '—'}</code>
      </Field>

      <Field title="Outil en cours">
        {agent.currentTool ? (
          <>
            <strong>{agent.currentTool.name}</strong>
            {agent.currentTool.target && <code className="block">{agent.currentTool.target}</code>}
          </>
        ) : (
          <span className="muted">aucun</span>
        )}
      </Field>

      {agent.kind === 'session' && (
        <Field title="Dernier prompt">
          {agent.lastPrompt ? (
            <p className="prompt-text">{agent.lastPrompt}</p>
          ) : (
            <span className="muted">aucun prompt reçu depuis l’ouverture</span>
          )}
        </Field>
      )}

      {parent && (
        <Field title="Session parente">
          <AgentLink agent={parent} onSelect={onSelect} />
        </Field>
      )}
      {team.length > 0 && (
        <Field title={`Équipe (${team.length})`}>
          {team.map((member) => (
            <AgentLink key={member.id} agent={member} onSelect={onSelect} />
          ))}
        </Field>
      )}

      <Field title={`Historique (${agent.history.length})`}>
        <ol className="timeline">
          {[...agent.history].reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <time>{formatClock(entry.at)}</time>
              <span>{entry.event}</span>
              {entry.detail && <span className="detail">{entry.detail}</span>}
            </li>
          ))}
        </ol>
      </Field>

      <footer className="muted" title={agent.id}>
        {agent.kind === 'session' ? 'session' : 'agent'} {shortId(agent.id)} · bureau {agent.deskId}
      </footer>
    </aside>
  )
}

function Field({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function AgentLink({
  agent,
  onSelect
}: {
  agent: AgentState
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <button className="agent-link" onClick={() => onSelect(agent.id)}>
      <span>{agent.label}</span>
      <span className="muted">{statusLabel(agent, true)}</span>
    </button>
  )
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
