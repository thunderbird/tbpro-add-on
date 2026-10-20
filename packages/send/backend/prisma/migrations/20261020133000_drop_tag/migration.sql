/*
  Warnings:

  - You are about to drop the `Tag`, `_ContainerToTag` and `_ItemToTag` tables. All the data in these tables will be lost.

*/
-- Tags are removed: no client reads or writes them and the /api/tags router
-- is gone. Containers and items themselves are unaffected.

-- DropForeignKey
ALTER TABLE "_ContainerToTag" DROP CONSTRAINT "_ContainerToTag_A_fkey";

-- DropForeignKey
ALTER TABLE "_ContainerToTag" DROP CONSTRAINT "_ContainerToTag_B_fkey";

-- DropForeignKey
ALTER TABLE "_ItemToTag" DROP CONSTRAINT "_ItemToTag_A_fkey";

-- DropForeignKey
ALTER TABLE "_ItemToTag" DROP CONSTRAINT "_ItemToTag_B_fkey";

-- DropTable
DROP TABLE "Tag";

-- DropTable
DROP TABLE "_ContainerToTag";

-- DropTable
DROP TABLE "_ItemToTag";
