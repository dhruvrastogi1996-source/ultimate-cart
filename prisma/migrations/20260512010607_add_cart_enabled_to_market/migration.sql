-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "flag" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cartEnabled" BOOLEAN NOT NULL DEFAULT true,
    "progressStyle" TEXT NOT NULL DEFAULT 'segmented',
    "milestoneType" TEXT NOT NULL DEFAULT 'cart_value',
    "allUnlockedMessage" TEXT NOT NULL DEFAULT 'All rewards unlocked! 🎉',
    "trustBadges" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Market" ("allUnlockedMessage", "code", "createdAt", "currency", "enabled", "flag", "id", "milestoneType", "name", "progressStyle", "shop", "trustBadges", "updatedAt") SELECT "allUnlockedMessage", "code", "createdAt", "currency", "enabled", "flag", "id", "milestoneType", "name", "progressStyle", "shop", "trustBadges", "updatedAt" FROM "Market";
DROP TABLE "Market";
ALTER TABLE "new_Market" RENAME TO "Market";
CREATE UNIQUE INDEX "Market_shop_code_key" ON "Market"("shop", "code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
