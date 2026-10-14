import type { AgentState } from '../../../core/types'
import type { OfficeUpdate, ServerStatus } from '../../../shared/ipc'
import { ACTIVITY_LABELS } from '../inspector/inspection'

const RECENT_HISTORY = 5

export function DebugOffice({ update }: { update: OfficeUpdate }): React.JSX.Element {
  const { office, server } = update
  const agentsById = new Map(office.agents.map((agent) => [agent.id, agent]))
  const islands = Array.from({ length: office.islands }, (_, island) =>
    office.desks.filter((desk) => desk.island === island)
  )

  return (
    <main className="debug">
      <header>
        <h1>Agent Office · debug</h1>
        <ServerBadge server={server} />
        <span className="muted">
          {office.agents.length} agent(s) · {office.islands} îlot(s)
        </span>
      </header>
      {islands.map((desks, island) => (
        <section key={island} className="row">
          {desks.map((desk) => {
            const agent = desk.occupantId ? agentsById.get(desk.occupantId) : undefined
            return agent ? (
              <AgentCard key={desk.id} agent={agent} />
            ) : (
              <div key={desk.id} className="desk empty">
                {desk.kind === 'lead' ? 'bureau de lead' : `poste ${desk.seat + 1}`} libre
              </div>
            )
          })}
        </section>
      ))}
    </main>
  )
}

function ServerBadge({ server }: { server: ServerStatus }): React.JSX.Element {
  const address = `${server.host}:${server.port}`
  if (server.listening) {
    return <span className="badge ok">à l’écoute sur {address}</span>
  }
  return (
    <span className="badge ko">
      serveur indisponible sur {address} {server.error ?? ''}
    </span>
  )
}

function AgentCard({ agent }: { agent: AgentState }): React.JSX.Element {
  const classes = ['desk', agent.kind, agent.presence, agent.activity].join(' ')
  return (
    <article className={classes}>
      <div className="title">
        <strong>{agent.label}</strong>
        <span className="muted">
          {agent.kind === 'session' ? 'session' : `sous-agent ${agent.agentType ?? ''}`} · bureau{' '}
          {agent.deskId}
        </span>
      </div>
      <div className="activity">
        {agent.presence === 'leaving' ? '👋 s’en va' : ACTIVITY_LABELS[agent.activity]}
      </div>
      {agent.currentTool && (
        <div className="tool">
          {agent.currentTool.name}
          {agent.currentTool.target && <code>{agent.currentTool.target}</code>}
        </div>
      )}
      {agent.lastPrompt && <div className="prompt">« {agent.lastPrompt} »</div>}
      <ol className="history">
        {agent.history
          .slice(-RECENT_HISTORY)
          .reverse()
          .map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <time>{new Date(entry.at).toLocaleTimeString()}</time> {entry.event}
              {entry.detail && <span className="muted"> {entry.detail}</span>}
            </li>
          ))}
      </ol>
    </article>
  )
}
