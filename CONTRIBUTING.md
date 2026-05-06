# Contributing

Thanks for helping harden Lash.

## Development

```sh
npm install
npm run check
npm audit
npm pack --dry-run
```

## Scope

Keep this package focused on the Lash convention layer:

- MCP tool metadata helpers
- Lash structured output envelopes
- trace/thread validation
- result, continuation, stream, and error constructors

Do not add MCP transports, server lifecycle, client sessions, authentication,
model calls, queues, or durable memory to this package. Those belong in MCP SDKs
or runtimes built on top of Lash.
