import { agentOfficeHandler, installHooks, parsePort } from './hooks-config'
import { apply } from './apply'
import { parseCli } from './settings-file'

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2), process.env)
  const port = parsePort(options.port)
  await apply(
    options,
    (settings) => installHooks(settings, port),
    `Installation des hooks agent-office (port ${port})`
  )
  if (options.dryRun) {
    console.log('\nHandler ajoute a chaque evenement :')
    console.log(JSON.stringify(agentOfficeHandler('PreToolUse', port), null, 2))
    console.log('Variante SessionEnd (synchrone, bornee) :')
    console.log(JSON.stringify(agentOfficeHandler('SessionEnd', port), null, 2))
  }
}

main().catch((error: Error) => {
  console.error(`Echec, aucun fichier modifie : ${error.message}`)
  process.exitCode = 1
})
