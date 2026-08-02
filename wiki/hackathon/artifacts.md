# Hackathon Artifacts

All artifacts live under `.hackathon/artifacts/`:

| Directory | Examples |
|---|---|
| `competition/` | `competition.yaml`, `raw-source.md` |
| `strategy/` | `strategy.yaml` |
| `ideas/` | `candidates.yaml`, `selected.yaml` |
| `scope/` | `scope.yaml` |
| `architecture/` | scaffold and architecture metadata |
| `build/` | build-related outputs |
| `demo/` | demo checklist |
| `pitch/` | judge preparation |
| `submission/` | submission package |

State is stored separately in `.hackathon/state.yaml`. It is the resumable source
of truth for gates and delivery phase. Writes are atomic and retain a backup at
`.hackathon/state.yaml.bak`.

Inspect the current state instead of relying on chat history:

```bash
hadk status --json
hadk next
```
