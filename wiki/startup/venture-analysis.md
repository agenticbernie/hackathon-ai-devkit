# Startup Venture Analysis

After problem discovery, continue with the startup-contest skills:

```text
customer evidence
  -> market sizing
  -> competitor mapping
  -> business model
  -> pricing hypothesis
  -> GTM plan
  -> pilot design
  -> investor/customer diligence
```

The corresponding skills are:

| Skill | Question |
|---|---|
| `startup-customer-evidence` | Do users experience the problem and show behavior or payment signals? |
| `startup-market-sizing` | Is there a defensible bottom-up market estimate? |
| `startup-competitor-mapper` | What alternatives exist and where is the whitespace? |
| `startup-business-model` | How could value, revenue, costs, and unit economics work? |
| `startup-pricing-hypothesis` | What price and buying model can be tested? |
| `startup-gtm-planner` | Which beachhead and channel can reach the first customers? |
| `startup-pilot-designer` | What small pilot can generate credible evidence? |
| `startup-judge-simulator` | Can the thesis survive investor and customer diligence? |

## Startup contest execution

When the venture is ready to build a proof, use the shared hackathon workflow:

```bash
hadk strategy --mode realistic
hadk idea
hadk scope
hadk scaffold --profile web-ai-fullstack
hadk validate build
hadk demo
hadk judge
hadk submit --repository https://github.com/org/project
```

The prototype should prove one mechanism. Do not present a demo as customer
validation unless customer evidence artifacts support that claim.

## Adapter workflow

To map existing hackathon skills into startup work:

```bash
hadk startup adapt-hackathon --profile startup-contest
```

The adapter explains which skills can be reused, which require startup-specific
evaluation changes, and which idea-first assumptions should be avoided.
