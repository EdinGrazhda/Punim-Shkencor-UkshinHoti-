# RTK command policy

RTK reduces noisy terminal output while preserving the command's exit code. Use it for ordinary repository inspection, builds, and tests:

```bash
rtk git status --short --branch
rtk rg -n 'pattern' apps packages
rtk read package.json
rtk pnpm --filter @ckadinti/student typecheck
rtk test pnpm test
rtk proxy docker compose ps
```

Run `graphify query`, `graphify path`, `graphify explain`, and `graphify update .` natively. Their scoped output and errors are needed to assess graph freshness. Run exact file reads or diagnostics natively when RTK compression could hide relevant lines. For other commands without an RTK wrapper, use `rtk proxy` when the output is noisy.

Check exit codes and inspect any RTK truncation warning before claiming a command passed. Never substitute a different underlying command just to get shorter output.
