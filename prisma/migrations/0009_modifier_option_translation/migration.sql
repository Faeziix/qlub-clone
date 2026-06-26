-- CreateTable: ModifierOptionTranslation for localized modifier option names (issue #39)
CREATE TABLE "ModifierOptionTranslation" (
    "id" TEXT NOT NULL,
    "modifierOptionId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ModifierOptionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ModifierOptionTranslation_modifierOptionId_locale_key" ON "ModifierOptionTranslation"("modifierOptionId", "locale");

-- CreateIndex
CREATE INDEX "ModifierOptionTranslation_modifierOptionId_idx" ON "ModifierOptionTranslation"("modifierOptionId");

-- AddForeignKey
ALTER TABLE "ModifierOptionTranslation" ADD CONSTRAINT "ModifierOptionTranslation_modifierOptionId_fkey" FOREIGN KEY ("modifierOptionId") REFERENCES "ModifierOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
