import puppeteer, { type Browser, type Page } from 'puppeteer';
import { logger } from '../../../utils/logger.js';
import type {
  AuthenticatedCsaeSession,
  CsaeLoginResult,
} from './csae.types.js';

const LOGIN_URL =
  'https://csae-login.wicketcloud.com/login?service=https://csae.com/&locale=en';

const NAVIGATION_TIMEOUT_MS = 30_000;

// WicketCloud CAS login selectors
const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input[id="username"]',
  'input[type="email"]',
  'input[name="email"]',
  'input[autocomplete="username"]',
];

const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input[id="password"]',
  'input[type="password"]',
  'input[autocomplete="current-password"]',
];

const SUBMIT_SELECTORS = [
  'input[type="submit"]',
  'button[type="submit"]',
  'button[name="submit"]',
];

async function fillFirstAvailableSelector(
  page: Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;
      await element.click({ clickCount: 3 });
      await element.type(value, { delay: 30 });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function clickFirstAvailableSelector(
  page: Page,
  selectors: string[],
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;
      await element.click();
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function performCsaeLogin(
  page: Page,
  email: string,
  password: string,
): Promise<CsaeLoginResult> {
  logger.info(`Navigating to CSAE login page: ${LOGIN_URL}`);

  await page.goto(LOGIN_URL, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  try {
    await page.waitForNetworkIdle({ timeout: 10_000 });
  } catch {
    // continue anyway
  }

  logger.info('Attempting to fill CSAE login form');

  const emailFilled = await fillFirstAvailableSelector(
    page,
    USERNAME_SELECTORS,
    email,
  );

  const passwordFilled = await fillFirstAvailableSelector(
    page,
    PASSWORD_SELECTORS,
    password,
  );

  logger.info(
    `CSAE login fields filled: email=${emailFilled}, password=${passwordFilled}`,
  );

  if (!emailFilled || !passwordFilled) {
    return {
      success: false,
      message: `Unable to locate email/password fields on CSAE login page (current URL: ${page.url()})`,
    };
  }

  const clicked = await clickFirstAvailableSelector(page, SUBMIT_SELECTORS);

  if (!clicked) {
    await page.keyboard.press('Enter');
  }

  try {
    await page.waitForNavigation({
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  } catch {
    // navigation may have already completed
  }

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const currentUrl = page.url();

  if (currentUrl.includes('csae.com') && !currentUrl.includes('/login')) {
    logger.info(`CSAE login successful, landed on: ${currentUrl}`);
    return { success: true, message: 'Login successful' };
  }

  // Check for error messages on the page
  try {
    const bodyText = await page.content();
    const errorMatch = bodyText.match(
      /(invalid|incorrect|failed|unable|error|try again|bad credentials)/i,
    );
    if (errorMatch) {
      return {
        success: false,
        message: `Login failed: ${errorMatch[0]}`,
      };
    }
  } catch {
    // ignore
  }

  return {
    success: false,
    message: `Login failed: still on login page (${currentUrl})`,
  };
}

export async function testCsaeLogin(
  csaeUrl: string,
  email: string,
  password: string,
): Promise<CsaeLoginResult> {
  const normalizedBaseUrl = new URL(csaeUrl).origin;
  logger.info(`Starting CSAE login test for ${normalizedBaseUrl}`);
  const browser = await puppeteer.launch({ headless: false });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    return await performCsaeLogin(page, email, password);
  } finally {
    await browser.close();
  }
}

export async function withAuthenticatedCsaeSession<T>(
  csaeUrl: string,
  email: string,
  password: string,
  action: (ctx: {
    browser: Browser;
    page: Page;
    session: AuthenticatedCsaeSession;
  }) => Promise<T>,
): Promise<T> {
  const browser = await puppeteer.launch({ headless: false });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const loginResult = await performCsaeLogin(page, email, password);

    if (!loginResult.success) {
      throw new Error(loginResult.message);
    }

    const normalizedBaseUrl = new URL(csaeUrl).origin;
    const session: AuthenticatedCsaeSession = { normalizedBaseUrl };

    return await action({ browser, page, session });
  } finally {
    await browser.close();
  }
}
