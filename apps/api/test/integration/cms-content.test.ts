import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ContentService } from "../../src/cms/content/content.service";
import { CacheService } from "../../src/core/cache/cache.service";
import { PrismaService } from "../../src/core/database/prisma.service";
import { HOSTS, TEST_ADMIN, signInTestAdmin, startApi } from "./harness";

/**
 * Content, taxonomies, menus, settings and the public read API, end to end
 * over HTTP as the test administrator. Everything created here carries a
 * run-specific marker in its title so a failed run's leftovers cannot make
 * the next run's slugs collide, and is removed at the end.
 */
describe("cms content", () => {
  let app: INestApplication;
  let cookie: string;
  let prisma: PrismaService;
  const marker = `qa${Date.now().toString(36)}`;
  const created = { pages: [] as string[], posts: [] as string[], terms: [] as string[] };

  const api = () => request(app.getHttpServer());
  const admin = (method: "get" | "post" | "put" | "delete", path: string) => api()[method](`/api/v1/${path}`).set("host", HOSTS.a).set("cookie", cookie);
  const pub = (path: string) => api().get(`/api/v1/public/${path}`).set("host", HOSTS.a);

  beforeAll(async () => {
    app = await startApi();
    cookie = await signInTestAdmin(app);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.forClient(TEST_ADMIN.clientId, async (tx) => {
      await tx.cmsContent.deleteMany({ where: { id: { in: [...created.pages, ...created.posts] } } });
      await tx.cmsContent.deleteMany({ where: { title: { contains: marker } } });
      await tx.cmsTerm.deleteMany({ where: { id: { in: created.terms } } });
      await tx.cmsRedirect.deleteMany({ where: { fromPath: { contains: marker } } });
      await tx.cmsMenu.deleteMany({ where: { location: `qa-${marker}` } });
      await tx.cmsSiteSettings.deleteMany({ where: { siteTitle: { contains: marker } } });
    });
    await app.get(CacheService).invalidateNamespace({ clientId: TEST_ADMIN.clientId }, "cms");
    await app.close();
  });

  it("creates a page and a post, slugs them, and strips scripts from the body", async () => {
    const page = await admin("post", "cms/pages").send({ title: `Hello World ${marker}`, body: "<p>Safe</p><script>alert(1)</script>" });
    expect(page.status, JSON.stringify(page.body)).toBe(201);
    expect(page.body.slug).toBe(`hello-world-${marker}`);
    expect(page.body.path).toBe(`/hello-world-${marker}`);
    created.pages.push(page.body.id);

    const detail = await admin("get", `cms/pages/${page.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.body).toBe("<p>Safe</p>");
    expect(detail.body.plainText).toBe("Safe");
    expect(detail.body.status).toBe("DRAFT");
    expect(detail.body.revisionCount).toBe(1);

    // The same title again gets "-2", not a refusal.
    const again = await admin("post", "cms/pages").send({ title: `Hello World ${marker}` });
    expect(again.status).toBe(201);
    expect(again.body.slug).toBe(`hello-world-${marker}-2`);
    created.pages.push(again.body.id);

    const post = await admin("post", "cms/posts").send({ title: `First Post ${marker}`, body: `<p>${"word ".repeat(450)}</p>` });
    expect(post.status, JSON.stringify(post.body)).toBe(201);
    expect(post.body.path).toBe(`/blog/first-post-${marker}`);
    created.posts.push(post.body.id);

    const counts = await admin("get", "cms/pages/counts");
    expect(counts.status).toBe(200);
    expect(counts.body.DRAFT).toBeGreaterThanOrEqual(2);
  });

  it("publishes, is readable publicly only when published, and unpublishes", async () => {
    const id = created.pages[0]!;
    const notYet = await pub(`pages/hello-world-${marker}`);
    expect(notYet.status).toBe(404);

    const published = await admin("post", `cms/pages/${id}/publish`).send({});
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body.status).toBe("PUBLISHED");
    expect(published.body.publishedAt).not.toBeNull();

    const live = await pub(`pages/hello-world-${marker}`);
    expect(live.status, JSON.stringify(live.body)).toBe(200);
    expect(live.body.title).toBe(`Hello World ${marker}`);
    expect(live.body.breadcrumbs).toEqual([{ title: `Hello World ${marker}`, path: `/hello-world-${marker}` }]);

    const unpublished = await admin("post", `cms/pages/${id}/unpublish`);
    expect(unpublished.body.status).toBe("DRAFT");
    const gone = await pub(`pages/hello-world-${marker}`);
    expect(gone.status).toBe(404);

    // A preview token lets the draft through.
    const token = await admin("get", `cms/pages/${id}/preview-token`);
    expect(token.status).toBe(200);
    const previewed = await pub(`pages/hello-world-${marker}?preview=${token.body.token}`);
    expect(previewed.status).toBe(200);
    expect(previewed.body.id).toBe(id);
  });

  it("schedules, and the publish_due handler flips a past-scheduled row", async () => {
    const id = created.pages[1]!;
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const scheduled = await admin("post", `cms/pages/${id}/publish`).send({ at: future });
    expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(200);
    expect(scheduled.body.status).toBe("SCHEDULED");
    expect(scheduled.body.scheduledFor).toBe(future);

    // Move the appointment into the past, then run the job's body.
    const past = new Date(Date.now() - 60_000);
    await prisma.forClient(TEST_ADMIN.clientId, async (tx) => tx.cmsContent.update({ where: { id }, data: { scheduledFor: past } }));
    const result = await app.get(ContentService).publishDue(TEST_ADMIN.clientId);
    expect(result.published).toBeGreaterThanOrEqual(1);

    const detail = await admin("get", `cms/pages/${id}`);
    expect(detail.body.status).toBe("PUBLISHED");
    expect(new Date(detail.body.publishedAt).getTime()).toBe(past.getTime());
  });

  it("keeps revisions and restores one", async () => {
    const id = created.pages[0]!;
    const put = await admin("put", `cms/pages/${id}`).send({ title: `Hello Again ${marker}`, body: "<p>Second</p>" });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.title).toBe(`Hello Again ${marker}`);

    const list = await admin("get", `cms/pages/${id}/revisions`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);
    expect(list.body[0].reason).toBe("save");
    const first = list.body[1];
    expect(first.title).toBe(`Hello World ${marker}`);

    const one = await admin("get", `cms/pages/${id}/revisions/${first.id}`);
    expect(one.body.body).toBe("<p>Safe</p>");

    const restored = await admin("post", `cms/pages/${id}/revisions/${first.id}/restore`);
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect(restored.body.title).toBe(`Hello World ${marker}`);
    expect(restored.body.body).toBe("<p>Safe</p>");
    const after = await admin("get", `cms/pages/${id}/revisions`);
    expect(after.body[0].reason).toBe("restore");
  });

  it("records a redirect when a published page's slug changes", async () => {
    const id = created.pages[1]!; // published by the scheduler test
    const oldSlug = `hello-world-${marker}-2`;
    const put = await admin("put", `cms/pages/${id}`).send({ title: `Renamed ${marker}`, slug: `renamed-${marker}` });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.path).toBe(`/renamed-${marker}`);

    const old = await pub(`pages/${oldSlug}`);
    expect(old.status, JSON.stringify(old.body)).toBe(200);
    expect(old.body.redirect).toEqual({ to: `/renamed-${marker}`, statusCode: 301 });

    const now = await pub(`pages/renamed-${marker}`);
    expect(now.status).toBe(200);
    expect(now.body.slug).toBe(`renamed-${marker}`);
  });

  it("nests pages and resolves the nested path", async () => {
    const parentId = created.pages[1]!;
    const child = await admin("post", "cms/pages").send({ title: `Child ${marker}`, parentId });
    expect(child.status).toBe(201);
    created.pages.push(child.body.id);
    expect(child.body.path).toBe(`/renamed-${marker}/child-${marker}`);
    await admin("post", `cms/pages/${child.body.id}/publish`).send({});
    const live = await pub(`pages/renamed-${marker}/child-${marker}`);
    expect(live.status, JSON.stringify(live.body)).toBe(200);
    expect(live.body.breadcrumbs.length).toBe(2);
    const parent = await pub(`pages/renamed-${marker}`);
    expect(parent.body.children).toEqual([{ title: `Child ${marker}`, path: `/renamed-${marker}/child-${marker}` }]);
  });

  it("lists posts sticky-first, filters by category, and keeps term counts", async () => {
    const category = await admin("post", "cms/terms").send({ taxonomy: "CATEGORY", name: `News ${marker}` });
    expect(category.status, JSON.stringify(category.body)).toBe(201);
    created.terms.push(category.body.id);
    expect(category.body.slug).toBe(`news-${marker}`);
    expect(category.body.path).toBe(`news-${marker}`);

    const dup = await admin("post", "cms/terms").send({ taxonomy: "CATEGORY", name: `News ${marker}` });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("already_exists");

    const plain = created.posts[0]!;
    await admin("put", `cms/posts/${plain}`).send({ title: `First Post ${marker}`, termIds: [category.body.id] });
    await admin("post", `cms/posts/${plain}/publish`).send({});

    const sticky = await admin("post", "cms/posts").send({ title: `Sticky ${marker}`, isSticky: true, termIds: [category.body.id] });
    created.posts.push(sticky.body.id);
    await admin("post", `cms/posts/${sticky.body.id}/publish`).send({});
    // Backdated to be older than the first, so only stickiness can put it first.
    await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
      tx.cmsContent.update({ where: { id: sticky.body.id }, data: { publishedAt: new Date(Date.now() - 86_400_000) } }),
    );
    await app.get(CacheService).invalidateNamespace({ clientId: TEST_ADMIN.clientId }, "cms");

    const listing = await pub(`posts?category=news-${marker}`);
    expect(listing.status, JSON.stringify(listing.body)).toBe(200);
    expect(listing.body.total).toBe(2);
    expect(listing.body.rows[0].title).toBe(`Sticky ${marker}`);
    expect(listing.body.rows[0].isSticky).toBe(true);
    expect(listing.body.rows[1].readingMinutes).toBe(3);
    expect(listing.body.rows[1].categories[0].slug).toBe(`news-${marker}`);

    const one = await pub(`posts/first-post-${marker}`);
    expect(one.status).toBe(200);
    expect(one.body.previous.title).toBe(`Sticky ${marker}`);
    expect(one.body.next).toBeNull();

    const terms = await admin("get", `cms/terms?taxonomy=CATEGORY&search=${marker}`);
    expect(terms.body.find((row: { id: string }) => row.id === category.body.id).count).toBe(2);

    const feed = await pub("feed");
    expect(feed.body.items.some((item: { title: string }) => item.title === `First Post ${marker}`)).toBe(true);
    const sitemap = await pub("sitemap");
    expect(sitemap.body.urls.some((url: { path: string; kind: string }) => url.path === `/blog/category/news-${marker}` && url.kind === "category")).toBe(true);
  });

  it("merges one term into another", async () => {
    const source = await admin("post", "cms/terms").send({ taxonomy: "CATEGORY", name: `Old ${marker}` });
    created.terms.push(source.body.id);
    const target = created.terms[0]!;
    await admin("put", `cms/posts/${created.posts[0]}`).send({ title: `First Post ${marker}`, termIds: [source.body.id] });

    const merged = await admin("post", `cms/terms/${source.body.id}/merge`).send({ intoId: target });
    expect(merged.status, JSON.stringify(merged.body)).toBe(200);
    expect(merged.body.id).toBe(target);
    expect(merged.body.count).toBe(2);
    const gone = await admin("get", `cms/terms?taxonomy=CATEGORY&search=${marker}`);
    expect(gone.body.some((row: { id: string }) => row.id === source.body.id)).toBe(false);
  });

  it("replaces a menu tree and reads it back resolved", async () => {
    const location = `qa-${marker}`;
    const put = await admin("put", `cms/menus/${location}`).send({
      name: "QA menu",
      items: [
        { label: "Renamed", contentId: created.pages[1] },
        { label: "Blog", url: "/blog", children: [{ label: "News", termId: created.terms[0] }] },
      ],
    });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.items[0].url).toBe(`/renamed-${marker}`);
    expect(put.body.items[1].children[0].url).toBe(`/blog/category/news-${marker}`);

    const list = await admin("get", "cms/menus");
    const menu = list.body.find((row: { location: string }) => row.location === location);
    expect(menu.items.length).toBe(2);

    const removed = await admin("delete", `cms/menus/${location}`);
    expect(removed.status).toBe(204);
  });

  it("saves settings, and the cached public site picks the change up", async () => {
    const before = await pub("site");
    expect(before.status).toBe(200);
    const cache = app.get(CacheService);
    expect(await cache.get({ clientId: TEST_ADMIN.clientId }, "cms", "site")).toBeDefined();

    const put = await admin("put", "cms/settings").send({ siteTitle: `Site ${marker}`, blogPath: "/blog/", postsPerPage: 12 });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.blogPath).toBe("/blog");
    expect(put.body.postsPerPage).toBe(12);

    const read = await admin("get", "cms/settings");
    expect(read.body.siteTitle).toBe(`Site ${marker}`);

    const after = await pub("site");
    expect(after.body.title).toBe(`Site ${marker}`);
    expect(after.body.postsPerPage).toBe(12);
  });

  it("trashes, restores, and deletes permanently", async () => {
    const id = created.pages[0]!;
    const trashed = await admin("delete", `cms/pages/${id}`);
    expect(trashed.status).toBe(204);
    const counts = await admin("get", "cms/pages/counts");
    expect(counts.body.TRASH).toBeGreaterThanOrEqual(1);
    const inBin = await admin("get", `cms/pages?status=TRASH`);
    expect(inBin.body.rows.some((row: { id: string }) => row.id === id)).toBe(true);

    const restored = await admin("post", `cms/pages/${id}/restore`);
    expect(restored.body.status).toBe("DRAFT");
    expect(restored.body.deletedAt).toBeNull();

    const gone = await admin("delete", `cms/pages/${id}/permanent`);
    expect(gone.status).toBe(204);
    const missing = await admin("get", `cms/pages/${id}`);
    expect(missing.status).toBe(404);
  });
});
