#!/usr/bin/env node
/**
 * Does the agent's sandbox actually work here?
 *
 * bubblewrap needs to create a user namespace and mount inside it. A container
 * usually forbids both: Docker's default seccomp profile blocks the first, the
 * docker-default AppArmor profile blocks the second. Which of those bites
 * depends on the host kernel, so guessing the compose settings is no good —
 * run this INSIDE the api container and it will say what that host needs.
 *
 *   docker compose exec api node scripts/sandbox-check.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { bwrapCommand, explainBwrapFailure, sandboxEnv } = await import(
  pathToFileURL(new URL("../.pi/lib/sandbox.ts", import.meta.url).pathname).href
).catch(async () => {
  // .ts is not importable under plain node; fall back to the literal recipe.
  return {
    bwrapCommand: (command, o) => [
      "--unshare-user", "--unshare-net", "--unshare-ipc", "--unshare-uts",
      "--uid", "0", "--gid", "0", "--die-with-parent", "--new-session", "--clearenv",
      "--ro-bind", "/usr", "/usr",
      "--symlink", "usr/bin", "/bin", "--symlink", "usr/sbin", "/sbin",
      "--symlink", "usr/lib", "/lib", "--symlink", "usr/lib64", "/lib64",
      "--ro-bind-try", "/etc/passwd", "/etc/passwd",
      "--ro-bind-try", "/etc/group", "/etc/group",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
      "--bind", o.workspace, "/workspace",
      "--setenv", "PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      "--setenv", "HOME", "/root",
      "--chdir", "/workspace", "/bin/bash", "-lc", command,
    ],
    explainBwrapFailure: () => null,
    sandboxEnv: () => ({}),
  };
});

const ws = mkdtempSync(join(tmpdir(), "sandbox-check-"));
writeFileSync(join(ws, "hello.txt"), "workspace is writable\n");

const checks = [
  ["starts at all", "echo ok"],
  ["workspace is writable", "echo written > out.txt && cat out.txt"],
  ["node is available", "node -v"],
  ["has no network", "curl -s -m 4 -o /dev/null https://example.com && echo REACHABLE || echo blocked"],
  ["cannot see the host filesystem", "ls /app 2>&1 | head -1"],
  ["carries no host environment", "env | grep -ciE 'key|secret|token|password' || true"],
];

let failed = 0;
console.log(`\n  sandbox check — workspace ${ws}\n`);
for (const [label, command] of checks) {
  const argv = bwrapCommand(command, { workspace: ws, shared: {}, env: sandboxEnv(), shell: "/bin/bash" });
  const r = spawnSync(process.env.STUDIO_BWRAP || "bwrap", argv, { encoding: "utf8" });
  const err = `${r.stderr ?? ""}${r.error ? String(r.error) : ""}`.trim();
  const ok = r.status === 0 && !explainBwrapFailure(err);
  if (!ok) failed++;
  const detail = ok ? (r.stdout ?? "").trim().split("\n").pop() : (explainBwrapFailure(err) ?? err.split("\n")[0]);
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(32)} ${detail}`);
}
rmSync(ws, { recursive: true, force: true });

if (failed) {
  console.log(
    `\n  ${failed} check(s) failed. The fix is on the api service in docker-compose.yml,\n` +
    `  and the message above says which. Try the smallest first:\n\n` +
    `    security_opt: [seccomp:unconfined]\n` +
    `    security_opt: [seccomp:unconfined, apparmor:unconfined]\n` +
    `    security_opt: [seccomp:unconfined, apparmor:unconfined]  +  cap_add: [SYS_ADMIN]\n\n` +
    `  Each one loosens the container that holds your secrets, so stop at the first that works.\n`,
  );
  process.exit(1);
}
console.log("\n  The agent's shell is confined here. No extra compose settings needed beyond the ones in use.\n");
