# Startup Contest Playbook

**Competition type:** `startup-contest`
**Status:** Beta — the core harness flow works end-to-end; the startup extension modules
are functional but less battle-tested than the hackathon path.
**Philosophy:** A fundable thesis, not just a working demo. Evidence over assertions.

**Workflow reference:** [`hackathon-workflow.md`](hackathon-workflow.md)

Startup contests share the core harness flow (ingest → strategy → idea → scope →
scaffold → build → demo → video → submit) but extend it with business-validation work.
Judges evaluate the *venture*, not just the prototype.

---

## How startup-contest differs from hackathon

| Dimension | Hackathon | Startup contest |
|---|---|---|
| Winning signal | Working demo + wow moment | Fundable thesis + traction evidence |
| Prototype role | The deliverable | Proof of one core mechanism |
| Business model | Optional flavor | Required, stress-tested |
| Customer | Assumed user | Evidenced buyer |
| Q&A | Feature questions | Investor-style diligence |

---

## Extended workflow

Run the core flow, then layer the startup extension modules. The extension skills are
registered in `manifest.yaml` and are all labeled `status: beta`.

### Stage 1 — Core flow (shared with hackathon)
1. `hadk setup` then `hadk ingest <brief>` — parse the contest rules and rubric.
2. `hadk strategy` — pick a mode. For startup contests, `realistic` is usually the right
   default (credible path from prototype to pilot); `futuristic` works when the contest
   rewards a bold thesis and the team can prove one primitive.
3. `hadk idea` — generate and select one idea.
4. `hadk scope` — lock an MVP whose demo illustrates the core value loop.
5. `hadk scaffold` — generate the prototype.

### Stage 2 — Business validation (startup extension)
Work these in parallel with the build. Each maps to a registered skill:

| Skill | Produces |
|---|---|
| `startup-customer-evidence` | Pain frequency, willingness-to-pay signals |
| `startup-market-sizing` | Bottom-up TAM/SAM/SOM |
| `startup-competitor-mapper` | Positioning map + whitespace + moat hypothesis |
| `startup-business-model` | Value prop, revenue streams, unit economics |
| `startup-pricing-hypothesis` | Concrete, testable price point |
| `startup-gtm-planner` | Beachhead segment + first-100 plan |
| `startup-pilot-designer` | Scoped pilot with success criteria |

### Stage 3 — Pitch hardening
| Skill | Produces |
|---|---|
| `startup-judge-simulator` | Investor-style Q&A prep + weak-spot list |
| `hackathon-pitchdeck` | The deck (reuse the hackathon skill) |
| `hackathon-demo-video` | The submission video |

---

## Time allocation guidance

For a typical 48h startup contest:

| Block | Hours | Notes |
|---|---|---|
| Core flow + prototype | 20h | The demo must still work |
| Customer/market evidence | 10h | Do this early, it shapes the pitch |
| Business model + pricing | 6h | Keep it simple and defensible |
| Pitch + Q&A prep | 8h | Investor-style, not feature tour |
| Buffer | 4h | |

---

## Rules of thumb

1. **Evidence beats assertion.** Every number in the pitch should have a source or be
   labeled an assumption.
2. **The prototype proves one mechanism.** Don't build the whole product; build the
   thing that makes the thesis believable.
3. **One beachhead.** A narrow, believable GTM beats a broad, vague one.
4. **Prepare for diligence.** The Q&A is where startup contests are won — run
   `startup-judge-simulator` before you finalize the deck.
