import { Timeline, type ScheduledPayload } from './script-builder'

export interface DemoIdentifiers {
  refprod: string
  financement: string
  office: string
  cartographer: string
  coverage: string
}

export function demoIdentifiers(runId: string): DemoIdentifiers {
  return {
    refprod: `sim-${runId}-refprod`,
    financement: `sim-${runId}-financement`,
    office: `sim-${runId}-office`,
    cartographer: `asim${runId}cartographe`,
    coverage: `asim${runId}couverture`
  }
}

export function buildDemoScenario(runId: string): ScheduledPayload[] {
  const ids = demoIdentifiers(runId)
  const timeline = new Timeline(runId)

  const refprod = timeline.session(ids.refprod, '/Users/dev/projects/refprod-engine', 0)
  refprod
    .start()
    .wait(800)
    .prompt('Ajoute la pagination à l’endpoint GET /deals')
    .wait(1_500)
    .tool(
      'Read',
      { file_path: '/Users/dev/projects/refprod-engine/src/Controller/DealController.php' },
      2_500
    )
    .tool('Grep', { pattern: 'findByPartner', path: 'src' }, 2_000)
    .tool('Glob', { pattern: 'src/**/DealRepository*.php' }, 1_500)
    .toolArrivingOutOfOrder('Read', {
      file_path: '/Users/dev/projects/refprod-engine/config/packages/api_platform.yaml'
    })
    .tool(
      'Edit',
      { file_path: '/Users/dev/projects/refprod-engine/src/Repository/DealRepository.php' },
      4_000
    )
    .tool(
      'Edit',
      { file_path: '/Users/dev/projects/refprod-engine/src/Controller/DealController.php' },
      3_500
    )
    .tool('Bash', { command: 'php bin/phpunit tests/Deal', description: 'Run deal tests' }, 6_000)
    .tool(
      'Write',
      { file_path: '/Users/dev/projects/refprod-engine/tests/Deal/PaginationTest.php' },
      3_000
    )
    .stop()
    .wait(12_000)
    .prompt('Mets à jour le CHANGELOG')
    .wait(1_200)
    .tool('Edit', { file_path: '/Users/dev/projects/refprod-engine/CHANGELOG.md' }, 3_000)
    .stop()

  const financement = timeline.session(
    ids.financement,
    '/Users/dev/projects/financement-api',
    2_000
  )
  financement
    .start()
    .wait(700)
    .prompt('Audite le module de financement et propose un plan de refactoring')
    .wait(1_500)
    .tool(
      'Read',
      { file_path: '/Users/dev/projects/financement-api/src/Financement/README.md' },
      2_000
    )
  const cartographer = financement.spawn(
    ids.cartographer,
    'Explore',
    'Cartographier les repositories'
  )
  const coverage = financement.spawn(
    ids.coverage,
    'general-purpose',
    'Analyser la couverture de tests'
  )
  financement.wait(1_000).stop([ids.cartographer, ids.coverage])

  cartographer
    .wait(500)
    .tool('Glob', { pattern: 'src/**/*Repository.php' }, 1_800)
    .tool(
      'Read',
      { file_path: '/Users/dev/projects/financement-api/src/Repository/FinancementRepository.php' },
      2_500
    )
    .tool('Grep', { pattern: 'createQueryBuilder', path: 'src/Repository' }, 2_000)
    .tool(
      'Read',
      { file_path: '/Users/dev/projects/financement-api/src/Repository/EcheanceRepository.php' },
      2_500
    )
    .handBack('8 repositories, 3 contiennent de la logique métier.')

  coverage
    .wait(800)
    .tool(
      'Bash',
      { command: 'vendor/bin/phpunit --coverage-text', description: 'Mesurer la couverture' },
      9_000
    )
    .tool(
      'Read',
      { file_path: '/Users/dev/projects/financement-api/tests/Financement/EcheancierTest.php' },
      2_500
    )
    .tool('Grep', { pattern: '@covers', path: 'tests' }, 2_000)
    .wait(3_000)
    .handBack('Couverture 61 %, le calcul d’échéancier n’est pas testé.')

  financement
    .waitUntil(cartographer.now + 300)
    .receiveReport(ids.cartographer, '8 repositories cartographiés.')
    .wait(2_500)
    .stop([ids.coverage])
    .waitUntil(coverage.now + 300)
    .receiveReport(ids.coverage, 'Couverture 61 %.')
    .wait(1_500)
    .tool(
      'Write',
      { file_path: '/Users/dev/projects/financement-api/docs/refactoring-plan.md' },
      3_500
    )
    .stop()
    .emit(
      'SubagentStop',
      { agent_id: `asim${runId}interne`, agent_type: '', last_assistant_message: 'suggestion' },
      1_500
    )

  const office = timeline.session(ids.office, '/Users/dev/projects/agent-office', 6_000)
  office
    .tool('WebSearch', { query: 'react three fiber animation mixer' }, 3_000)
    .tool(
      'WebFetch',
      { url: 'https://docs.pmnd.rs/react-three-fiber', prompt: 'useAnimations' },
      3_000
    )
    .tool('Read', { file_path: '/Users/dev/projects/agent-office/package.json' }, 1_500)
    .toolNeedingPermission(
      'Bash',
      { command: 'rm -rf out && npm run build', description: 'Clean build' },
      9_000,
      4_000
    )
    .stop()
    .emit(
      'Notification',
      { message: 'Claude is waiting for your input', notification_type: 'idle_prompt' },
      3_000
    )

  const finale = Math.max(refprod.now, financement.now, office.now) + 6_000
  office.waitUntil(finale - 2_000).end()
  refprod.waitUntil(finale).end()
  financement.waitUntil(finale + 500).end()

  return timeline.build()
}
