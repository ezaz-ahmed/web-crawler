import puppeteer, { type Browser, type Frame, type Page } from 'puppeteer';
import { logger } from '../../../utils/logger.js';
import type {
  AuthenticatedSession,
  MemberLoungeLoginResult,
} from './member-lounge.types.js';

const NAVIGATION_TIMEOUT_MS = 25_000;

const EMAIL_SELECTORS = [
  'input[name="email"][type="text"]',
  'input[id^=":r"][name="email"]',
  'input[type="email"]',
  'input[name="email"]',
  'input[placeholder="smith@gmail.com"]',
  'input[autocomplete="email"]',
  'input#email',
];

const PASSWORD_SELECTORS = [
  'input[name="password"][type="password"]',
  'input[id^=":r"][name="password"]',
  'input[type="password"]',
  'input[name="password"]',
  'input[placeholder="******"]',
  'input[autocomplete="current-password"]',
  'input#password',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button[name="submit"]',
  'button[id*="login" i]',
  'button[class*="login" i]',
];

function normalizeBaseUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

async function hasVisibleSelector(
  page: Page,
  selectors: string[],
): Promise<boolean> {
  const roots: Array<Page | Frame> = [page, ...page.frames()];

  for (const root of roots) {
    for (const selector of selectors) {
      if (await root.$(selector)) {
        return true;
      }
    }
  }

  return false;
}

async function waitForIdle(page: Page, timeout: number): Promise<void> {
  try {
    await page.waitForNetworkIdle({ timeout });
  } catch {
    // Continue when network idle cannot be reached.
  }
}

async function fillOnRoot(
  root: Page | Frame,
  selector: string,
  value: string,
): Promise<boolean> {
  try {
    const element = await root.$(selector);
    if (!element) {
      return false;
    }

    await element.focus();
    await element.click({ clickCount: 3 });
    await element.press('Backspace');
    await element.type(value, { delay: 15 });
    return true;
  } catch {
    return false;
  }
}

async function clickOnRoot(
  root: Page | Frame,
  selector: string,
): Promise<boolean> {
  try {
    const element = await root.$(selector);
    if (!element) {
      return false;
    }

    await element.click();
    return true;
  } catch {
    return false;
  }
}

async function navigateToLoginPage(
  page: Page,
  baseUrl: string,
): Promise<string> {
  const loginCandidates = [
    `${baseUrl}/login`,
    `${baseUrl}/sign-in`,
    `${baseUrl}/signin`,
    `${baseUrl}/auth/login`,
    `${baseUrl}/users/sign_in`,
    baseUrl,
  ];

  for (const candidate of loginCandidates) {
    try {
      logger.info(`Navigating to login page candidate: ${candidate}`);
      await page.goto(candidate, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      await waitForIdle(page, 10_000);

      const hasEmail = await hasVisibleSelector(page, EMAIL_SELECTORS);
      const hasPassword = await hasVisibleSelector(page, PASSWORD_SELECTORS);

      if (hasEmail && hasPassword) {
        logger.info(`Using login page candidate: ${candidate}`);
        return candidate;
      }
    } catch {
      // Try next candidate.
    }
  }

  return `${baseUrl}/login`;
}

async function fillFirstAvailableSelector(
  page: Page,
  selectors: string[],
  value: string,
): Promise<boolean> {
  const roots: Array<Page | Frame> = [page, ...page.frames()];

  for (const root of roots) {
    for (const selector of selectors) {
      if (await fillOnRoot(root, selector, value)) {
        return true;
      }
    }
  }

  return false;
}

async function clickFirstAvailableSelector(
  page: Page,
  selectors: string[],
): Promise<boolean> {
  const roots: Array<Page | Frame> = [page, ...page.frames()];

  for (const root of roots) {
    for (const selector of selectors) {
      if (await clickOnRoot(root, selector)) {
        return true;
      }
    }
  }

  return false;
}

async function readLoginError(page: Page): Promise<string | null> {
  const text = await page.$eval('body', (el) => el.textContent || '');
  const lines = text
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);

  const matched = lines.find((line: string) =>
    /(invalid|incorrect|failed|unable|error|try again)/i.test(line),
  );

  return matched || null;
}

async function detectRoleFromUi(
  page: Page,
): Promise<AuthenticatedSession['userRole']> {
  const text = (
    await page.$eval('body', (el) => el.textContent || '')
  ).toLowerCase();

  if (text.includes('super admin')) {
    return 'super-admin';
  }

  if (text.includes('admin')) {
    return 'admin';
  }

  if (
    text.includes('logout') ||
    text.includes('sign out') ||
    text.includes('my account')
  ) {
    return 'member';
  }

  return 'unknown';
}

async function performLoginFlow(
  page: Page,
  baseUrl: string,
  email: string,
  password: string,
): Promise<MemberLoungeLoginResult> {
  const loginUrl = await navigateToLoginPage(page, baseUrl);

  logger.info(`Navigating to login page: ${loginUrl}`);

  if (page.url() !== loginUrl) {
    await page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  }

  logger.info(`Filling login form for domain: ${baseUrl}`);

  await waitForIdle(page, NAVIGATION_TIMEOUT_MS);

  logger.info('Attempting to fill login form fields');

  const emailFilled = await fillFirstAvailableSelector(
    page,
    EMAIL_SELECTORS,
    email,
  );
  const passwordFilled = await fillFirstAvailableSelector(
    page,
    PASSWORD_SELECTORS,
    password,
  );

  logger.info(
    `Login page filled: email field - ${emailFilled}, password field - ${passwordFilled}`,
  );

  if (!emailFilled || !passwordFilled) {
    return {
      success: false,
      message: `Unable to locate email/password fields on login page (current URL: ${page.url()})`,
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
    // Navigation can complete too quickly.
  }

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    logger.info('Login successful — waiting for page to fully load');
    await waitForIdle(page, 10_000);

    logger.info('Page loaded — waiting 5 seconds before visiting calendar');
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    try {
      logger.info(`Navigating to calendar page: ${baseUrl}/calendar`);
      await page.goto(`${baseUrl}/calendar`, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await waitForIdle(page, 10_000);
      logger.info('Calendar page loaded');
    } catch {
      logger.info('Calendar page navigation failed — continuing');
    }

    return {
      success: true,
      message: 'Login successful',
    };
  }

  const loginError = await readLoginError(page);
  return {
    success: false,
    message: loginError || 'Login failed: credentials were not accepted',
  };
}

export async function testMemberLoungeLogin(
  memberLoungeUrl: string,
  email: string,
  password: string,
): Promise<MemberLoungeLoginResult> {
  const baseUrl = normalizeBaseUrl(memberLoungeUrl);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    return await performLoginFlow(page, baseUrl, email, password);
  } finally {
    await browser.close();
  }
}

export async function withAuthenticatedSession<T>(
  memberLoungeUrl: string,
  email: string,
  password: string,
  action: (ctx: {
    browser: Browser;
    page: Page;
    session: AuthenticatedSession;
  }) => Promise<T>,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(memberLoungeUrl);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const loginResult = await performLoginFlow(page, baseUrl, email, password);
    if (!loginResult.success) {
      throw new Error(loginResult.message);
    }

    const role = await detectRoleFromUi(page);

    return await action({
      browser,
      page,
      session: {
        normalizedBaseUrl: baseUrl,
        userRole: role,
      },
    });
  } finally {
    await browser.close();
  }
}
