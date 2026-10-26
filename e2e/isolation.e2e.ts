// Two users sign in with Clerk, each saves an adventure draft, and neither can see the other's: not in
// their own list, and not by opening the other's draft by its address. A signed-out visitor is sent to
// sign-in. The checks that keep drafts apart are `owned` in lib/api/drafts.ts (a draft opens only for
// its owner) and `cadmium_list_drafts` in the drafts migration (a list holds only the caller's drafts).
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { USERS } from "./users";

const run = Date.now().toString(36);

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email });
  return page;
}

/** Opens a signed-in page, accepting the terms first when a new account is asked to. */
async function open(page: Page, path: string) {
  const response = await page.goto(path);
  if (new URL(page.url()).pathname === "/accept-terms") {
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.waitForURL((url) => url.pathname !== "/accept-terms");
    return page.goto(path);
  }
  return response;
}

/** Saves a draft through the New adventure form, requiring the first installed setting, and returns its address. */
async function saveDraft(page: Page, title: string, id: string): Promise<string> {
  await open(page, "/adventures/new");
  const settings = page.getByRole("group", { name: "Required settings" }).getByRole("checkbox");
  if ((await settings.count()) === 0) throw new Error("no settings are installed: publish the bundles at /admin (pnpm bundles) before running the end-to-end tests");
  await settings.first().check();
  await page.getByLabel("Id").fill(id);
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create draft" }).click();
  const edited = /\/adventures\/[^/]+\/edit$/;
  const refused = page.getByRole("alert").filter({ hasText: /\S/ });
  await Promise.race([page.waitForURL(edited), refused.first().waitFor()]);
  if (!edited.test(new URL(page.url()).pathname)) throw new Error(`the draft was not created: ${await refused.first().innerText()}`);
  return new URL(page.url()).pathname;
}

/** Deletes every draft this test saved for the signed-in user, this run's and any a failed run left. */
async function deleteTestDrafts(page: Page) {
  await open(page, "/adventures");
  await page.waitForLoadState("networkidle");
  const remove = page.getByRole("button", { name: /^Delete Isolation test / });
  for (let left = await remove.count(); left > 0; left--) {
    // The server action posts to the page itself; Clerk's own requests go elsewhere.
    const deleted = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/adventures");
    await remove.first().click();
    await deleted;
    await page.reload();
  }
  await expect(remove).toHaveCount(0);
}

test("two users cannot see each other's adventure drafts", async ({ browser }) => {
  const a = await signedIn(browser, USERS.a);
  const b = await signedIn(browser, USERS.b);
  const titleA = `Isolation test A ${run}`;
  const titleB = `Isolation test B ${run}`;
  try {
    const draftA = await saveDraft(a, titleA, `e2e_a_${run}`);
    const draftB = await saveDraft(b, titleB, `e2e_b_${run}`);

    // Each sees their own draft in their list, and not the other's.
    await open(a, "/adventures");
    await expect(a.getByRole("link", { name: titleA })).toBeVisible();
    await expect(a.getByRole("link", { name: titleB })).toHaveCount(0);
    await open(b, "/adventures");
    await expect(b.getByRole("link", { name: titleB })).toBeVisible();
    await expect(b.getByRole("link", { name: titleA })).toHaveCount(0);

    // Neither can open the other's draft by its address.
    expect((await open(b, draftA))?.status()).toBe(404);
    expect((await open(a, draftB))?.status()).toBe(404);

    // A signed-out visitor sees no one's drafts: the list sends them to sign-in.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto("/adventures");
    await expect(visitor).toHaveURL(/\/sign-in/);
  } finally {
    // Remove what the run saved, even after a failure.
    await deleteTestDrafts(a).catch((e: Error) => console.error(`cleanup: ${e.message}`));
    await deleteTestDrafts(b).catch((e: Error) => console.error(`cleanup: ${e.message}`));
  }
});
