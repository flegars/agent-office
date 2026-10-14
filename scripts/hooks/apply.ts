import { describeChanges, type Settings } from './hooks-config'
import { readSettings, serializeSettings, writeSettings, type CliOptions } from './settings-file'

export async function apply(
  options: CliOptions,
  transform: (settings: Settings) => Settings,
  title: string
): Promise<void> {
  const { exists, settings } = await readSettings(options.settingsPath)
  const next = transform(settings)
  console.log(`${title} — ${options.settingsPath}${exists ? '' : ' (absent, sera cree)'}`)

  if (serializeSettings(next) === serializeSettings(settings)) {
    console.log('Rien a changer : le fichier est deja dans l’etat voulu.')
    return
  }
  for (const line of describeChanges(settings, next)) console.log(`  ${line}`)

  if (options.dryRun) {
    console.log('\n--dry-run : aucun fichier modifie.')
    return
  }
  const backup = await writeSettings(options.settingsPath, next, exists)
  if (backup) console.log(`\nSauvegarde : ${backup}`)
  console.log('Fichier mis a jour. Les sessions Claude Code deja ouvertes doivent etre relancees.')
}
