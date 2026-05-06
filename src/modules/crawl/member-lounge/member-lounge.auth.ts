import { chromium, type BrowserContext, type Page } from 'playwright';
import { logger } from '../../../utils/logger.js';
import type {
  AuthenticatedSession,
  MemberLoungeLoginResult,
} from './member-lounge.types.js';

const NAVIGATION_TIMEOUT_MS = 25_000;
const FIELD_LOOKUP_TIMEOUT_MS = 2_000;

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
  'button:has-text("Sign In")',
  'button:has-text("Login")',
];

function normalizeBaseUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

async function hasVisibleSelector(
  page: Page,
  selectors: string[],
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return true;
    }
  }

  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if ((await locator.count()) > 0) {
        return true;
      }
    }
  }

  return false;
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

      await page
        .waitForLoadState('networkidle', { timeout: 10_000 })
        .catch(() => undefined);

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
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) === 0) {
        continue;
      }
      await locator.waitFor({
        state: 'attached',
        timeout: FIELD_LOOKUP_TIMEOUT_MS,
      });
      await locator.fill(value);
      return true;
    } catch {
      try {
        await locator.fill(value, {
          force: true,
          timeout: FIELD_LOOKUP_TIMEOUT_MS,
        });
        return true;
      } catch {
        // try next selector
      }
    }
  }

  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      try {
        if ((await locator.count()) === 0) {
          continue;
        }
        await locator.waitFor({
          state: 'attached',
          timeout: FIELD_LOOKUP_TIMEOUT_MS,
        });
        await locator.fill(value);
        return true;
      } catch {
        try {
          await locator.fill(value, {
            force: true,
            timeout: FIELD_LOOKUP_TIMEOUT_MS,
          });
          return true;
        } catch {
          // try next selector/frame
        }
      }
    }
  }

  return false;
}

async function clickFirstAvailableSelector(
  page: Page,
  selectors: string[],
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) === 0) {
        continue;
      }
      await locator.waitFor({
        state: 'attached',
        timeout: FIELD_LOOKUP_TIMEOUT_MS,
      });
      await locator.click();
      return true;
    } catch {
      try {
        await locator.click({ force: true, timeout: FIELD_LOOKUP_TIMEOUT_MS });
        return true;
      } catch {
        // try next selector
      }
    }
  }

  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      try {
        if ((await locator.count()) === 0) {
          continue;
        }
        await locator.waitFor({
          state: 'attached',
          timeout: FIELD_LOOKUP_TIMEOUT_MS,
        });
        await locator.click();
        return true;
      } catch {
        try {
          await locator.click({
            force: true,
            timeout: FIELD_LOOKUP_TIMEOUT_MS,
          });
          return true;
        } catch {
          // try next selector/frame
        }
      }
    }
  }

  return false;
}

async function readLoginError(page: Page): Promise<string | null> {
  const text = await page.locator('body').innerText();
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const matched = lines.find((line) =>
    /(invalid|incorrect|failed|unable|error|try again)/i.test(line),
  );

  return matched || null;
}

async function detectRoleFromUi(
  page: Page,
): Promise<AuthenticatedSession['userRole']> {
  const text = (await page.locator('body').innerText()).toLowerCase();

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

  await page
    .waitForLoadState('networkidle', { timeout: NAVIGATION_TIMEOUT_MS })
    .catch(() => undefined);

  logger.info('Attempting to fill login form fields');

  const labelEmailFilled = await page
    .getByLabel(/email/i)
    .first()
    .fill(email)
    .then(() => true)
    .catch(() => false);

  const emailFilled =
    labelEmailFilled ||
    (await fillFirstAvailableSelector(page, EMAIL_SELECTORS, email)) ||
    (await page
      .getByPlaceholder(/gmail|email/i)
      .first()
      .fill(email)
      .then(() => true)
      .catch(() => false));

  const labelPasswordFilled = await page
    .getByLabel(/password/i)
    .first()
    .fill(password)
    .then(() => true)
    .catch(() => false);

  const passwordFilled =
    labelPasswordFilled ||
    (await fillFirstAvailableSelector(page, PASSWORD_SELECTORS, password)) ||
    (await page
      .getByPlaceholder(/\*{3,}|password/i)
      .first()
      .fill(password)
      .then(() => true)
      .catch(() => false));

  logger.info(
    `Login page filled: email field - ${emailFilled}, password field - ${passwordFilled}`,
  );

  if (!emailFilled || !passwordFilled) {
    return {
      success: false,
      message: `Unable to locate email/password fields on login page (current URL: ${page.url()})`,
    };
  }

  const clicked =
    (await clickFirstAvailableSelector(page, SUBMIT_SELECTORS)) ||
    (await page
      .getByRole('button', { name: /sign in|login|log in/i })
      .first()
      .click()
      .then(() => true)
      .catch(() => false));

  if (!clicked) {
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(1200);

  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    logger.info('Login successful');
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
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

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
    context: BrowserContext;
    page: Page;
    session: AuthenticatedSession;
  }) => Promise<T>,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(memberLoungeUrl);
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const loginResult = await performLoginFlow(page, baseUrl, email, password);
    if (!loginResult.success) {
      throw new Error(loginResult.message);
    }

    const role = await detectRoleFromUi(page);

    return await action({
      context,
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
