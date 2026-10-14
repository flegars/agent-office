# Agent Office

Open space 3D low-poly où chaque session Claude Code et chacun de ses sous-agents travaille sous vos yeux, en temps réel.

Les hooks Claude Code envoient leurs événements à un serveur HTTP embarqué dans l'app, sur `127.0.0.1:47821` uniquement (port modifiable via `AGENT_OFFICE_PORT`). Les payloads restent en mémoire : rien n'est écrit sur disque ni envoyé ailleurs.

En production, le renderer est servi par un protocole `app://` (sous `file://`, Chromium refuse le `fetch` du chargeur glTF).

## Commandes

```bash
npm install
npm run dev          # lance l'app
npm run simulate     # rejoue une scène réaliste (3 sessions, 2 sous-agents, permission)
npm run simulate -- --speed 3 --loop
npm test             # tests unitaires (Vitest)
npm run lint && npm run typecheck
```

## Brancher Claude Code

Les hooks sont à installer soi-même, après relecture :

```bash
npm run hooks:install -- --dry-run   # montre ce qui serait ajouté, n'écrit rien
npm run hooks:install                # sauvegarde puis fusionne dans ~/.claude/settings.json
npm run hooks:uninstall              # retire uniquement les hooks agent-office
```

Options : `--settings <fichier>` (défaut : `$CLAUDE_CONFIG_DIR/settings.json` ou `~/.claude/settings.json`),
`--port <port>` (défaut : `AGENT_OFFICE_PORT` ou 47821, à garder identique à celui de l'app).

- Chaque évènement suivi reçoit un hook `command` reconnaissable à `# agent-office-hook` ; les hooks
  existants ne sont ni modifiés ni réordonnés. Relancer l'installation ne duplique rien.
- Avant toute écriture, l'original est copié en `settings.json.agent-office-backup-<date>`.
- Les hooks sont `async: true` : `curl --max-time 1`, sortie jetée, `|| true`. Claude Code n'attend
  jamais l'app, qu'elle soit ouverte, fermée ou figée, et aucune sortie ne peut l'influencer.
- `SessionEnd` ne peut pas être asynchrone : il est synchrone mais borné à 0,3 s (`timeout: 1`),
  dans le budget de 1,5 s que Claude Code accorde à ces hooks.
- Les sessions déjà ouvertes doivent être relancées pour prendre les hooks en compte.

## Architecture

| Dossier                       | Rôle                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/core/`                   | Logique pure, sans Electron ni Three.js : normalisation des payloads, store d'état, attribution des bureaux |
| `src/main/`                   | Serveur HTTP de réception, service qui alimente le store et diffuse l'état par IPC                          |
| `src/shared/`                 | Contrat IPC entre main, preload et renderer                                                                 |
| `src/preload/`                | API `window.office` minimale (`getUpdate`, `onUpdate`)                                                      |
| `src/renderer/`               | Scène 3D (React Three Fiber) et vue de debug texte (bouton « Debug »)                                       |
| `src/renderer/public/models/` | Modèles Kenney CC0, voir `CREDITS.md`                                                                       |
| `scripts/`                    | Simulateur d'événements, installation des hooks (`scripts/hooks/`)                                          |
