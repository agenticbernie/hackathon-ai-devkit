# Hackathon Commands

| Command | Purpose |
|---|---|
| `hadk setup` | Initialize state and detect the environment. |
| `hadk ingest <source>` | Parse a local brief or URL. |
| `hadk configure` | Update team, deadline, and time configuration. |
| `hadk strategy` | Select strategy mode and taste profile. |
| `hadk idea` | Generate and select candidate ideas. |
| `hadk scope` | Create and lock the MVP scope. |
| `hadk scaffold` | Generate a project scaffold. |
| `hadk status` | Show phase, gates, risks, and next action. |
| `hadk next` | Print the current recommended command. |
| `hadk validate <target>` | Run a validation gate. |
| `hadk demo` | Validate the demo path. |
| `hadk video generate` | Generate a demo-video project. |
| `hadk video render` | Render the video when HyperFrames is available. |
| `hadk judge` | Prepare judge Q&A. |
| `hadk submit --repository <url>` | Prepare the submission package. |
| `hadk checkpoint` | Snapshot state before risky work. |
| `hadk rollback` | Restore a checkpoint. |
| `hadk doctor` | Diagnose environment and registry problems. |

Most commands support `--help`. For machine-readable status and validation output:

```bash
hadk status --json
hadk validate all --json
```
