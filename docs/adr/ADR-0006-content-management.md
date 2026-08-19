# ADR-0006 — Content management: pages, posts, taxonomies, media, menus

**Status:** Accepted (implementation began 19 August 2026)
**Context:** Phase 1 — public site and blog per client
**Related:** ADR-0001 (hostname), ADR-0002 (isolation), ADR-0004 (background work), ADR-0005 (errors)

---

## Context

Each client's public site (`(site)` in the web app — home, services, network, about, contact, track) renders from a static module, `src/content/site.ts`, whose own comment says it exists to be replaced by a CMS fetch. A courier company needs to publish service pages, announcements, a blog, and to change its menu and footer without a deploy. The brief is "WordPress, the same or improved": pages, posts, categories, tags, media, menus, drafts and publishing, revisions, SEO fields — inside the existing application, its permissions, its isolation and its operating tools, not beside them.

## Decision

**1. Content is client-scoped and served on the client's own host.** A page or post belongs to one client, lives under row-level security like every other table, and is read publicly on that client's hostname (`acme.excelex.in/blog/…`) — the public routes carry `@PublicRoute()` and take the client from the resolved host, exactly as sign-in does. The platform's own `www` site is a later, separate concern; nothing here assumes one site.

**2. One content table, two kinds — and revisions beside it.** WordPress's `posts` table with `post_type` is the right idea and the wrong execution (everything in one row, meta in another table). Here `cms_contents` holds pages and posts with `kind` PAGE|POST, the columns each actually needs (pages: parent, order, template; posts: excerpt, featured image, taxonomy), a status machine — DRAFT → SCHEDULED → PUBLISHED, and ARCHIVED; soft delete is the bin — and `cms_revisions` snapshots the editable fields on every save so a change can be seen and restored. Slugs are unique per client per kind; a published slug does not change silently — renaming a published page records a redirect.

**3. The body is HTML, written by a block-capable editor, and sanitised on the way in.** Editors expect a visual editor (TipTap in the web app: headings, lists, links, images, quotes, code, tables, embeds). The API stores what it is sent only after `sanitize-html` with an allow-list — tags, attributes, URL schemes — so a stored body can be rendered by the public site without a second thought. A plain-text extract is kept for search and excerpts.

**4. Taxonomies are one table.** `cms_terms` with `taxonomy` CATEGORY|TAG, hierarchical for categories (parent), flat for tags, unique slug per client per taxonomy; `cms_content_terms` joins. Adding a taxonomy later is a value, not a table.

**5. Media has a storage seam.** `cms_media` records what was uploaded — name, mime, size, dimensions, alt text, who, when — and a `StorageService` puts the bytes somewhere: the local disk in development (`STORAGE_ROOT`, served by the API), S3-compatible object storage in production (`STORAGE_DRIVER=s3`), behind one interface. Uploads are limited by size and mime, image dimensions are read, and files are keyed by client so one client's URL space cannot name another's file.

**6. Menus and site settings are content too.** `cms_menus` and `cms_menu_items` (nested, linking to a page, a post, a term or a URL) drive the public header and footer; `cms_site_settings` (one row per client) holds title, tagline, what the home page is — a static page or the latest posts — posts per page, footer text, social links, default SEO. The public site reads them and falls back to the static module where nothing is set, so nothing existing breaks: a client with no CMS content sees exactly the site it saw before.

**7. Publishing is a state, scheduling is a job.** Publish sets `published_at` and clears the CMS cache namespace for the client; scheduling stores `scheduled_for` and the scheduler's default "Publish scheduled content" job (per client, every five minutes) flips due rows to PUBLISHED. Public reads are cached (`cms` namespace, five minutes) and invalidated on any publish-affecting write.

**8. Permissions, in the existing group model.** A new `Content` group: `cms.page.view|manage|publish`, `cms.post.view|manage|publish`, `cms.taxonomy.manage`, `cms.media.view|manage`, `cms.menu.manage`, `cms.settings.manage`. Publish is separate from manage so a writer can draft and an editor can release — WordPress's Contributor/Author/Editor distinction, without new role machinery. Every mutation is audited under `cms.*` actions.

**9. The public site gains dynamic routes and keeps its static ones.** `/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/blog/tag/[slug]`, `/[...slug]` for pages, `sitemap.xml`, `feed.xml`; the header's menu comes from the CMS when a client has one. Existing static pages remain the fallback for their paths.

## Alternatives considered

- **Markdown bodies.** Safer and diff-friendly, but not what a marketing team expects, and the brief said WordPress. HTML with a strict sanitiser and a good editor is the industry answer; Markdown import can be added.
- **A headless CMS (Strapi, Payload, WordPress itself) beside the app.** Another system with its own users, permissions and hosting; content that is not under the client isolation model; a second place to operate. Rejected for the same reason the System screens are in-app.
- **Everything in JSON blocks (Gutenberg-style).** Portable and structured, but every renderer has to understand every block, and the public site would need a block renderer before it could show a paragraph. HTML renders anywhere today; a block model can wrap it later.
- **Comments.** WordPress has them; a courier company's blog rarely wants them and the moderation burden is real. Deferred, not rejected.

## Consequences

- Six new client-scoped tables, four new permissions groups' worth of keys, and a storage dependency (`sanitize-html`, `sharp` for image dimensions, `@aws-sdk/client-s3` for the S3 driver).
- The public site becomes dynamic (per-request reads with a five-minute cache) where it was static; the cache and the fallback keep it fast and keep it working with no content.
- Editors' HTML is only as safe as the allow-list; the list is the security boundary and is tested.
- Media on local disk is per API instance; production must use the S3 driver, and the readiness check says which is configured.
