import { type Browser, chromium, type Page } from 'playwright';
import { config } from '../config.ts';
import {
  openSessionMismatches, parseOpenSession, parseSessionsPage, type SessionCard, type SessionsPage,
} from './session_page.ts';

const TIMEOUT_MS = 30000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


async function waitFor(check: () => Promise<boolean>, description: string, timeoutMs = TIMEOUT_MS) {
  const startedAt = Date.now();
  while (! await check()) {
    if (Date.now() - startedAt > timeoutMs)
      throw new Error(`Timed out waiting for ${description}`);

    await sleep(250);
  }
}


// Drives one browser page through piuscores player Sessions pages. piuscores is a Blazor Server
// app: the HTML only arrives after the page connects, and every click re-renders over that
// connection, so each step waits for the page to show the expected content.
export class SessionsBrowser {
  private constructor(private readonly browser: Browser, private readonly page: Page) {}


  static async launch(): Promise<SessionsBrowser> {
    const browser = await chromium.launch({ channel: config.browserChannel, headless: config.headless });
    // Dates on the page are read as month/day, as piuscores formats them for en-US.
    const context = await browser.newContext({ locale: 'en-US' });
    return new SessionsBrowser(browser, await context.newPage());
  }


  async close() {
    await this.browser.close();
  }


  // Opens a player's Sessions page; returns false when the player has no sessions listed.
  async openPlayer(playerId: string): Promise<boolean> {
    await sleep(config.scrapeDelayMs);
    await this.page.goto(`${config.piuscoresUrl}/Player/${encodeURIComponent(playerId)}/Sessions`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });

    await this.page.waitForSelector('main h5', { timeout: TIMEOUT_MS });
    const cards = await this.page.waitForSelector('[data-testid="session-card"]', { timeout: 10000 })
      .then(() => true, () => false);

    if (! /Sessions$/i.test((await this.page.textContent('main h5'))?.trim()  ||  ''))
      throw new Error(`No Sessions page for player ${playerId}`);

    return cards;
  }


  async readPage(): Promise<SessionsPage> {
    return parseSessionsPage(await this.page.content());
  }


  private cardSignature(): Promise<string> {
    return this.page.$$eval('[data-testid="session-card"]', (cards) => cards.map((card) =>
      `${card.querySelector('.sbd-card-when')?.textContent}|${card.querySelector('.sbd-card-meta')?.textContent}`).join('\n'));
  }


  async goToPage(direction: 'older' | 'newer') {
    await sleep(config.scrapeDelayMs);
    const before = await this.cardSignature();
    const label = direction === 'older' ? 'Next page' : 'Previous page';
    await this.page.click(`[data-testid="session-pagination"] button[aria-label="${label}"]`);
    await waitFor(async () => await this.cardSignature() !== before, `the ${direction} Sessions page`);
  }


  // PUMBILITY of the open session; it may render a moment after the cards.
  async readOpenPumbility(): Promise<number | null> {
    let pumbility: number | null = null;
    await waitFor(async () => {
      pumbility = parseOpenSession(await this.openSessionHtml())?.pumbility  ??  null;
      return pumbility !== null;
    }, 'PUMBILITY', 3000).catch(() => {});

    return pumbility;
  }


  private async openSessionHtml(): Promise<string> {
    return this.page.locator('[data-testid="session-hero"]').evaluate((hero) => hero.outerHTML).catch(() => '');
  }


  // Opens `card`'s session (on the current page) with all of its plays shown; returns the page HTML.
  async openSession(card: SessionCard): Promise<string> {
    const { cards } = await this.readPage();
    const index = cards.findIndex((c) => c.title === card.title  &&  c.timestamp === card.timestamp);
    if (index < 0)
      throw new Error(`Session "${card.title}" (${card.timestamp}) is no longer on its page`);

    await sleep(config.scrapeDelayMs);
    await this.page.locator('[data-testid="session-card"]').nth(index).click();

    let mismatches: string[] = [];
    await waitFor(async () => {
      mismatches = openSessionMismatches(parseOpenSession(await this.openSessionHtml()), card);
      return mismatches.length === 0  &&  await this.page.locator('[data-testid="session-all-plays"]').count() > 0;
    }, `session "${card.title}" (${card.timestamp}) to open`).catch((error) => {
      throw new Error(`${error.message}: ${mismatches.join('; ')  ||  'all plays list is missing'}`);
    });

    const showAll = this.page.locator('[data-testid="session-show-all-plays"]');
    if (await showAll.count()) {
      const total = parseOpenSession(await this.openSessionHtml())?.playsTotal  ??  0;
      await showAll.click();
      await waitFor(async () => await showAll.count() === 0
        ||  await this.page.locator('[data-testid="session-score-row"]').count() >= total,
      `all plays of "${card.title}" (${card.timestamp}) to load`);
    }

    return this.page.content();
  }
}
