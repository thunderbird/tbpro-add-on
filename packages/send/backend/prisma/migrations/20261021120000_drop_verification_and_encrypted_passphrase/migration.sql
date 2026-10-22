/*
  Warnings:

  - You are about to drop the `Verification` and `EncryptedPassphrase` tables. All the data in these tables will be lost.

*/
-- Device pairing is removed: the verification codes and the encrypted
-- passphrase handoff rows have no readers or writers any more. Both tables
-- held short-lived rows with no relation to any other table.

-- DropTable
DROP TABLE "Verification";

-- DropTable
DROP TABLE "EncryptedPassphrase";
