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

Objects written before this change are unprefixed and are not matched by the
rule; they have to be removed once, by hand.

## Deletes and file versions

`FileStore.del` issues an S3 `DeleteObject` against the Backblaze bucket. B2
buckets are versioned, so that hides the object rather than erasing every
version of it: reads 404 immediately, and the prior version stays until a
lifecycle rule removes it. Make sure the production bucket has a lifecycle rule
covering the prefixes it actually stores, not only `backup/`.

The path this replaced deleted versions immediately -- but only for objects it
could find, and it could only find objects in the first 1000 file names in the
bucket. For everything else it deleted nothing and reported success.
