-- CreateEnum
CREATE TYPE "CmsKind" AS ENUM ('PAGE', 'POST');

-- CreateEnum
CREATE TYPE "CmsStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CmsTaxonomy" AS ENUM ('CATEGORY', 'TAG');

-- CreateTable
CREATE TABLE "cms_contents" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "CmsKind" NOT NULL,
    "status" "CmsStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "plain_text" TEXT NOT NULL DEFAULT '',
    "parent_id" UUID,
    "menu_order" INTEGER NOT NULL DEFAULT 0,
    "template" TEXT NOT NULL DEFAULT 'default',
    "featured_media_id" UUID,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "canonical_url" TEXT,
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "og_image_media_id" UUID,
    "author_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "scheduled_for" TIMESTAMPTZ(6),
    "is_sticky" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_revisions" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'save',
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_redirects" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "from_path" TEXT NOT NULL,
    "to_path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL DEFAULT 301,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_terms" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "taxonomy" "CmsTaxonomy" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_content_terms" (
    "client_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,

    CONSTRAINT "cms_content_terms_pkey" PRIMARY KEY ("client_id","content_id","term_id")
);

-- CreateTable
CREATE TABLE "cms_media" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT,
    "title" TEXT,
    "alt_text" TEXT,
    "caption" TEXT,
    "folder" TEXT,
    "uploaded_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_menus" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_menu_items" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "parent_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "content_id" UUID,
    "term_id" UUID,
    "url" TEXT,
    "open_in_new_tab" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cms_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_site_settings" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "site_title" TEXT,
    "tagline" TEXT,
    "home_page_id" UUID,
    "blog_path" TEXT NOT NULL DEFAULT '/blog',
    "posts_per_page" INTEGER NOT NULL DEFAULT 10,
    "footer_text" TEXT,
    "social_links" JSONB NOT NULL DEFAULT '[]',
    "default_meta_description" TEXT,
    "default_og_image_media_id" UUID,
    "indexable" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cms_contents_client_id_kind_status_published_at_idx" ON "cms_contents"("client_id", "kind", "status", "published_at");

-- CreateIndex
CREATE INDEX "cms_contents_client_id_kind_slug_idx" ON "cms_contents"("client_id", "kind", "slug");

-- CreateIndex
CREATE INDEX "cms_contents_client_id_parent_id_menu_order_idx" ON "cms_contents"("client_id", "parent_id", "menu_order");

-- CreateIndex
CREATE INDEX "cms_contents_client_id_idx" ON "cms_contents"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_contents_client_id_id_key" ON "cms_contents"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_contents_client_id_kind_slug_key" ON "cms_contents"("client_id", "kind", "slug");

-- CreateIndex
CREATE INDEX "cms_revisions_client_id_content_id_created_at_idx" ON "cms_revisions"("client_id", "content_id", "created_at");

-- CreateIndex
CREATE INDEX "cms_revisions_client_id_idx" ON "cms_revisions"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_revisions_client_id_id_key" ON "cms_revisions"("client_id", "id");

-- CreateIndex
CREATE INDEX "cms_redirects_client_id_idx" ON "cms_redirects"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_redirects_client_id_from_path_key" ON "cms_redirects"("client_id", "from_path");

-- CreateIndex
CREATE INDEX "cms_terms_client_id_taxonomy_name_idx" ON "cms_terms"("client_id", "taxonomy", "name");

-- CreateIndex
CREATE INDEX "cms_terms_client_id_idx" ON "cms_terms"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_terms_client_id_id_key" ON "cms_terms"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_terms_client_id_taxonomy_slug_key" ON "cms_terms"("client_id", "taxonomy", "slug");

-- CreateIndex
CREATE INDEX "cms_content_terms_client_id_term_id_idx" ON "cms_content_terms"("client_id", "term_id");

-- CreateIndex
CREATE INDEX "cms_content_terms_client_id_idx" ON "cms_content_terms"("client_id");

-- CreateIndex
CREATE INDEX "cms_media_client_id_created_at_idx" ON "cms_media"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "cms_media_client_id_mime_type_idx" ON "cms_media"("client_id", "mime_type");

-- CreateIndex
CREATE INDEX "cms_media_client_id_idx" ON "cms_media"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_media_client_id_storage_key_key" ON "cms_media"("client_id", "storage_key");

-- CreateIndex
CREATE INDEX "cms_menus_client_id_idx" ON "cms_menus"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_menus_client_id_id_key" ON "cms_menus"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_menus_client_id_location_key" ON "cms_menus"("client_id", "location");

-- CreateIndex
CREATE INDEX "cms_menu_items_client_id_menu_id_parent_id_position_idx" ON "cms_menu_items"("client_id", "menu_id", "parent_id", "position");

-- CreateIndex
CREATE INDEX "cms_menu_items_client_id_idx" ON "cms_menu_items"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_menu_items_client_id_id_key" ON "cms_menu_items"("client_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_site_settings_client_id_key" ON "cms_site_settings"("client_id");

-- AddForeignKey
ALTER TABLE "cms_revisions" ADD CONSTRAINT "cms_revisions_client_id_content_id_fkey" FOREIGN KEY ("client_id", "content_id") REFERENCES "cms_contents"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_content_terms" ADD CONSTRAINT "cms_content_terms_client_id_content_id_fkey" FOREIGN KEY ("client_id", "content_id") REFERENCES "cms_contents"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_content_terms" ADD CONSTRAINT "cms_content_terms_client_id_term_id_fkey" FOREIGN KEY ("client_id", "term_id") REFERENCES "cms_terms"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_menu_items" ADD CONSTRAINT "cms_menu_items_client_id_menu_id_fkey" FOREIGN KEY ("client_id", "menu_id") REFERENCES "cms_menus"("client_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

