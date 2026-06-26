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

export const emptyState = {
  cookies: [],
  origins: [],
};
