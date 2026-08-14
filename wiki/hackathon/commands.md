# Hackathon Commands

| Command | Purpose |
|---|---|
| `hadk setup` | Initialize state and detect the environment. |
| `hadk ingest <source>` | Capture an untrusted local brief or URL for review. |
| `hadk brief review` | Review extracted facts, confidence, and blockers. |
| `hadk brief confirm <field>` | Explicitly confirm a reviewed fact. |
| `hadk configure` | Update team, deadline, and time configuration. |
| `hadk strategy` | Select strategy mode and taste profile. |
| `hadk idea` | Generate unverified candidate ideas or an agent handoff. |
| `hadk idea select <id>` | Explicitly select a reviewed candidate. |
| `hadk scope` | Create and lock the MVP scope. |
| `hadk architecture plan` | Create the architecture contract. |
| `hadk handoff implement` | Export typed agent task packets. |
| `hadk scaffold` | Generate a project scaffold. |
| `hadk status` | Show phase, gates, risks, and next action. |
| `hadk next` | Print the current recommended command. |
| `hadk validate <target>` | Run a validation gate. |
| `hadk verify build` | Run install, typecheck, tests, build, start, and healthcheck. |
| `hadk verify demo` | Verify the configured demo or record human attestation. |
| `hadk video generate` | Generate a demo-video project. |
| `hadk video render` | Render the video when HyperFrames is available. |
| `hadk judge` | Prepare judge Q&A. |
| `hadk package submission` | Prepare the local requirements-driven package. |
| `hadk package review` | Review mandatory evidence and blockers. |
| `hadk package export` | Export the local package; no external submission occurs. |
| `hadk checkpoint` | Snapshot state before risky work. |
| `hadk rollback` | Restore a checkpoint. |
| `hadk doctor` | Diagnose environment and registry problems. |

Most commands support `--help`. For machine-readable status and validation output:

```bash
hadk status --json
hadk validate all --json
```
