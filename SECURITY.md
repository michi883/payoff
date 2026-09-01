# Security policy

## Supported version

Security fixes are applied to the latest revision of `main`. This project has not yet published versioned release branches.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use the repository's private GitHub security-advisory reporting flow and include:

- the affected route, component, or commit;
- clear reproduction steps;
- the impact and any known preconditions; and
- a suggested mitigation, if available.

Do not include real provider credentials, personal viewer data, or other third-party secrets in a report. Revoke exposed credentials before sharing redacted evidence.

## Deployment responsibility

Payoff keeps OpenAI and Gemini credentials on the server and ignores local environment files. Its default Cloud Run script creates a public service so the browser application can reach the API. Operators are responsible for configuring suitable authentication or abuse prevention, provider budgets, log retention, and data-handling controls before offering a public production service.
