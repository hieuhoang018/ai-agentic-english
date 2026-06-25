-- CreateTable
CREATE TABLE "passages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cefrLevel" TEXT NOT NULL,
    "topicTags" TEXT[],
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "durationMs" INTEGER,
    "transcript" TEXT,
    "alignment" JSONB,
    "source" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "passages_mediaAssetId_key" ON "passages"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "passages_title_source_key" ON "passages"("title", "source");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_objectKey_key" ON "media_assets"("objectKey");

-- AddForeignKey
ALTER TABLE "passages" ADD CONSTRAINT "passages_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
