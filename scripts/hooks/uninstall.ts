import { uninstallHooks } from './hooks-config'
import { apply } from './apply'
import { parseCli } from './settings-file'

apply(
  parseCli(process.argv.slice(2), process.env),
  uninstallHooks,
  'Desinstallation des hooks agent-office'
).catch((error: Error) => {
  console.error(`Echec, aucun fichier modifie : ${error.message}`)
  process.exitCode = 1
})
