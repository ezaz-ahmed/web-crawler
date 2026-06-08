import puppeteer, { type Browser, type Page } from 'puppeteer';
import { logger } from '../../../utils/logger.js';
import type {
  AuthenticatedCsaeSession,
  CsaeLoginResult,
} from './csae.types.js';

const LOGIN_URL =
  'https://csae-login.wicketcloud.com/login?service=https://csae.com/&locale=en';

const NAVIGATION_TIMEOUT_MS = 30_000;

const EVENTS_CALENDAR_PATH = '/events/calendar';

const CREATE_BTN_WRAPPER_SELECTOR = '.navbar.navbar-default #CreateBtnWrapper';

const PAGE_LOGIN_LINK_SELECTORS = [
  '#RibbitWelcome .btn.btn-primary',
  '#RibbitWelcome a[href*="login"]',
  'a[href*="wicketcloud.com/login"]',
  'a[href*="/login"]',
  '.login-link',
];

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

async function waitForPageToSettle(page: Page, step: string): Promise<void> {
  logger.info(`CSAE step: waiting for page to settle after ${step}`);

  try {
    await page.waitForNavigation({
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  } catch {
    logger.info(`CSAE step: no navigation event captured after ${step}`);
  }

  try {
    await page.waitForNetworkIdle({ timeout: 10_000 });
  } catch {
    logger.info(`CSAE step: network idle timeout after ${step}, continuing`);
  }
}

async function fillFirstAvailableSelector(
  page: Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (!element) continue;
      await element.focus();
      await element.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await element.type(value, { delay: 15 });
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

async function fillAndSubmitLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<CsaeLoginResult> {
  logger.info(`CSAE step: filling login form at ${page.url()}`);

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
    `CSAE step: login fields filled email=${emailFilled} password=${passwordFilled}`,
  );

  if (!emailFilled || !passwordFilled) {
    return {
      success: false,
      message: `Unable to locate email/password fields on CSAE login page (current URL: ${page.url()})`,
    };
  }

  const clicked = await clickFirstAvailableSelector(page, SUBMIT_SELECTORS);

  logger.info(
    `CSAE step: submitting login form using ${clicked ? 'button click' : 'keyboard enter'}`,
  );

  if (!clicked) {
    await page.keyboard.press('Enter');
  }

  await waitForPageToSettle(page, 'submitting login form');
  logger.info(`CSAE step: login flow finished loading at ${page.url()}`);

  const currentUrl = page.url();

  if (currentUrl.includes('csae.com') && !currentUrl.includes('/login')) {
    logger.info(
      `CSAE step: login successful, landed on ${currentUrl} — waiting for page to fully load`,
    );
    try {
      await page.waitForNetworkIdle({ timeout: 20_000 });
    } catch {
      logger.info('CSAE step: network idle timeout after redirect, continuing');
    }
    logger.info(`CSAE step: page fully loaded at ${page.url()}`);
    return { success: true, message: 'Login successful' };
  }

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

async function performCsaeLogin(
  page: Page,
  email: string,
  password: string,
): Promise<CsaeLoginResult> {
  logger.info(`CSAE step: going to login page ${LOGIN_URL}`);

  await page.goto(LOGIN_URL, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  await waitForPageToSettle(page, 'opening login page');
  logger.info(`CSAE step: login page loaded at ${page.url()}`);

  return fillAndSubmitLoginForm(page, email, password);
}

export async function testCsaeLogin(
  csaeUrl: string,
  email: string,
  password: string,
): Promise<CsaeLoginResult> {
  const normalizedBaseUrl = new URL(csaeUrl).origin;
  logger.info(`Starting CSAE login test for ${normalizedBaseUrl}`);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

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
  logger.info(`CSAE step: launching browser for ${csaeUrl}`);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    logger.info('CSAE step: browser page ready');

    const loginResult = await performCsaeLogin(page, email, password);

    if (!loginResult.success) {
      throw new Error(loginResult.message);
    }

    const normalizedBaseUrl = new URL(csaeUrl).origin;
    const session: AuthenticatedCsaeSession = { normalizedBaseUrl };
    logger.info(
      `CSAE step: authenticated session ready for ${normalizedBaseUrl}`,
    );

    return await action({ browser, page, session });
  } finally {
    logger.info('CSAE step: closing browser');
    await browser.close();
  }
}

export async function withCsaeEventSession<T>(
  csaeUrl: string,
  email: string,
  password: string,
  action: (ctx: {
    browser: Browser;
    page: Page;
    session: AuthenticatedCsaeSession;
  }) => Promise<T>,
): Promise<T> {
  const normalizedBaseUrl = new URL(csaeUrl).origin;
  const calendarUrl = `${normalizedBaseUrl}${EVENTS_CALENDAR_PATH}`;

  logger.info(
    `CSAE step: launching browser, navigating directly to ${calendarUrl}`,
  );
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(calendarUrl, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await waitForPageToSettle(page, 'opening events calendar');
    logger.info(`CSAE step: calendar page loaded at ${page.url()}`);

    const createBtnWrapper = await page.$(CREATE_BTN_WRAPPER_SELECTOR);
    const isLoggedIn = createBtnWrapper !== null;
    logger.info(
      `CSAE step: auth check via CreateBtnWrapper — logged in: ${isLoggedIn}`,
    );

    if (!isLoggedIn) {
      logger.info('CSAE step: not authenticated, clicking login button');

      const clicked = await clickFirstAvailableSelector(
        page,
        PAGE_LOGIN_LINK_SELECTORS,
      );

      if (clicked) {
        logger.info('CSAE step: login button clicked, waiting for navigation');
        await waitForPageToSettle(page, 'clicking login button');
        logger.info(`CSAE step: redirected to ${page.url()}`);
      } else {
        logger.warn(
          'CSAE step: no login button found on page, falling back to direct login URL',
        );
        await page.goto(LOGIN_URL, {
          waitUntil: 'domcontentloaded',
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        await waitForPageToSettle(page, 'navigating to login URL');
      }

      const loginResult = await fillAndSubmitLoginForm(page, email, password);
      if (!loginResult.success) {
        throw new Error(loginResult.message);
      }

      logger.info(
        `CSAE step: login complete, navigating back to ${calendarUrl}`,
      );
      await page.goto(calendarUrl, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await waitForPageToSettle(
        page,
        'returning to events calendar after login',
      );
      logger.info(`CSAE step: back at calendar page at ${page.url()}`);
    }

    const session: AuthenticatedCsaeSession = { normalizedBaseUrl };
    return await action({ browser, page, session });
  } finally {
    logger.info('CSAE step: closing browser');
    await browser.close();
  }
}
