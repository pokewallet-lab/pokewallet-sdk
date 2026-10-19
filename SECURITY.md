# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead: open the **Security** tab of this repository, choose **Report a vulnerability**, and describe the problem there. Only the maintainers can see it.

Include what you found, how to reproduce it, and which package and version it affects (`@pokewallet/sdk`, `pokewallet`, or the MCP server in `packages/mcp`). You will get an acknowledgement, and we will keep you informed until it is fixed.

## What counts

- The SDKs or the MCP server exposing an API key (in logs, errors, serialization, network requests to anywhere but the PokeWallet API).
- Request or response handling that lets one caller affect another.
- Vulnerable dependencies reachable from the published packages.

## Your API key

Never include your key in a report, an issue, a log or a screenshot. If a key may have leaked, revoke it in the dashboard at https://pokewallet.io/dashboard and create a new one.
