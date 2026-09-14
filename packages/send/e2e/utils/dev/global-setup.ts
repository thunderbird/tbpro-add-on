import { rmSync, writeFileSync } from "fs";
import { credentialsPath, emptyState, storageStatePath } from "./paths";

/**
 * Runs once per test run, before any worker starts.
 *
 * Clears the cross-worker state files so a run always starts from a clean
 * slate: a stale credentials.json (from an aborted earlier run) would hijack
 * the fresh Date.now() identity before register_and_login runs, and a stale
 * lockboxstate.json would restore a session for an account that no longer
 * matches this run.
 */
export default function globalSetup() {
  rmSync(credentialsPath, { force: true });
  writeFileSync(storageStatePath, JSON.stringify(emptyState));
}
