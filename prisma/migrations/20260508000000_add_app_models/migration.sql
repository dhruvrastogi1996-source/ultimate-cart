-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "flag" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "progressStyle" TEXT NOT NULL DEFAULT 'segmented',
    "milestoneType" TEXT NOT NULL DEFAULT 'cart_value',
    "allUnlockedMessage" TEXT NOT NULL DEFAULT 'All rewards unlocked. Now go look fabulous.',
    "trustBadges" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "marketId" TEXT NOT NULL,
    "threshold" REAL NOT NULL DEFAULT 0,
    "rewardLabel" TEXT NOT NULL DEFAULT '',
    "rewardType" TEXT NOT NULL DEFAULT 'no_discount',
    "discountPct" REAL,
    "fixedDiscount" REAL,
    "icon" TEXT NOT NULL DEFAULT 'Truck',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Milestone_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CartNoteRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'always',
    "selectedVariants" TEXT NOT NULL DEFAULT '[]',
    "selectedProducts" TEXT NOT NULL DEFAULT '[]',
    "prompt" TEXT NOT NULL DEFAULT '',
    "placeholder" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ThemeSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "textColor" TEXT NOT NULL DEFAULT '#1A1A1A',
    "accentColor" TEXT NOT NULL DEFAULT '#8B0000',
    "headingFont" TEXT NOT NULL DEFAULT 'Cormorant Garamond',
    "bodyFont" TEXT NOT NULL DEFAULT 'Inter',
    "buttonStyle" TEXT NOT NULL DEFAULT 'square',
    "borderRadius" TEXT NOT NULL DEFAULT 'none',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UpsellProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "price" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_shop_code_key" ON "Market"("shop", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeSettings_shop_key" ON "ThemeSettings"("shop");
