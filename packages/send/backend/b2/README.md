# Backblaze bucket configuration

Snapshots of the settings applied to the B2 buckets. These are not applied
automatically; they are here so the intended state is reviewable and greppable.

| File                         | Applies to                              | What it is                              |
| ---------------------------- | --------------------------------------- | --------------------------------------- |
| `rules.json`                 | production bucket                       | CORS rules                              |
| `retention.json`             | production bucket                       | lifecycle rule for the `backup/` prefix |
| `test-bucket-retention.json` | **test** bucket (`TEST_B2_BUCKET_NAME`) | lifecycle rule for the `tests/` prefix  |

## Why the test bucket needs a lifecycle rule

`src/test/storage/backblaze.test.ts` writes real objects to the bucket named by
the `TEST_B2_BUCKET_NAME` repository variable, and the `e2e-bucket-test`
workflow points the whole application at that same bucket. The suite now cleans
up after itself, but a crashed or cancelled run still leaves objects behind, and
nothing reaps them.

That mattered more than it sounds: the objects the suite creates are named with
a `tests/` prefix precisely so a lifecycle rule can remove them, because an
ever-growing bucket is what made the storage suite fail. Apply it with:

```sh
b2 bucket update --lifecycle-rules "$(cat b2/test-bucket-retention.json)" <test-bucket-name>
```

**`--lifecycle-rules` replaces the bucket's entire rule set, it does not append
to it.** This bucket is shared with the `e2e-bucket-test` workflow, which points
the whole application at it, so check the existing rules first
(`b2 bucket get <test-bucket-name>`) and fold any you need to keep into the JSON
before running the command.

Objects written before this change are unprefixed and are not matched by the
rule; they have to be removed once, by hand.

Do not copy this file to the production bucket. `daysFromUploadingToHiding: 1`
is right for throwaway test objects and catastrophic for real uploads: it would
hide them a day after upload, regardless of the expiry the application itself
enforces.

## Deletes and file versions

B2 buckets are versioned, so a bare S3 `DeleteObject` only writes a hide marker
and leaves the payload behind until a lifecycle rule reaps it. `FileStore.del`
therefore lists the versions of the one key it was given and deletes each by
version id, which erases the bytes -- matching what the native
`b2_delete_file_version` used to do, and meaning no lifecycle rule is required
for a user's delete to actually delete.

The one exception is an application key without list permission: the version
listing fails, the code logs that it is degrading, and falls back to the
unversioned (hide-only) delete. If that appears in the logs, either grant the
key `listFiles` or add a lifecycle rule for the affected prefix.

The path this replaced deleted versions immediately -- but only for objects it
could find, and it could only find objects in the first 1000 file names in the
bucket. For everything else it deleted nothing and reported success.
