// Storage-state file paths shared between the dev spec and test utils.
// Extracted here to break a circular import (send.spec <-> testUtils) that made
// the helpers unloadable outside the spec's own load order. See issue #930.
import path from "path";

export const storageStatePath = path.resolve(
  __dirname,
  "../../data/lockboxstate.json"
);

export const emptystatePath = path.resolve(
  __dirname,
  "../../data/emptystate.json"
);

// Account identity (email/password/passphrase) captured by register_and_login,
// persisted so a replacement worker can keep using the same account. Playwright
// discards the worker after any test failure; the module-level Date.now() email
// in a fresh worker would otherwise orphan the registered account and cascade
// "Incorrect email or password" through every remaining test.
export const credentialsPath = path.resolve(
  __dirname,
  "../../data/credentials.json"
);

export const emptyState = {
  cookies: [],
  origins: [],
};
