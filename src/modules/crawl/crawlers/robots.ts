import robotsParser from 'robots-parser';
import { config } from '../../../config/env.js';

type RobotsTxtParser = {
  isAllowed: (url: string, ua?: string) => boolean | undefined;
  getCrawlDelay: (ua?: string) => number | undefined;
};

const parseRobots = robotsParser as unknown as (
  url: string,
  robotsTxt: string,
) => RobotsTxtParser;

const robotsCache = new Map<
  string,
  {
    parser: RobotsTxtParser;
    fetchedAt: Date;
  }
>();

const CACHE_DURATION = 60 * 60 * 1000;

async function getRobotsParser(url: string): Promise<RobotsTxtParser | null> {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.origin;

    const cached = robotsCache.get(domain);
    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_DURATION) {
        return cached.parser;
      }
    }

    const robotsUrl = `${domain}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': config.crawler.userAgent,
      },
      signal: AbortSignal.timeout(10000),
    });

    let robotsTxt = '';
    if (response.ok) {
      robotsTxt = await response.text();
    }

    const parser = parseRobots(robotsUrl, robotsTxt);

    robotsCache.set(domain, {
      parser,
      fetchedAt: new Date(),
    });

    return parser;
  } catch (error) {
    console.warn(`Failed to fetch robots.txt for ${url}:`, error);
    return null;
  }
}

export async function isAllowedByRobots(
  url: string,
  userAgent?: string,
): Promise<boolean> {
  const agent = userAgent || config.crawler.userAgent;

  try {
    const parser = await getRobotsParser(url);
    if (!parser) {
      return true;
    }

    const allowed = parser.isAllowed(url, agent);
    if (!allowed) {
      console.log(`✗ Blocked by robots.txt: ${url}`);
    }
    return allowed !== false;
  } catch (error) {
    console.warn(`Error checking robots.txt for ${url}:`, error);
    return true;
  }
}

export async function getCrawlDelay(
  url: string,
  userAgent?: string,
): Promise<number | null> {
  const agent = userAgent || config.crawler.userAgent;

  try {
    const parser = await getRobotsParser(url);
    if (!parser) {
      return null;
    }

    const delay = parser.getCrawlDelay(agent);
    return delay !== undefined ? delay * 1000 : null;
  } catch {
    return null;
  }
}

export function clearRobotsCache(): void {
  robotsCache.clear();
  console.log('✓ Robots.txt cache cleared');
}
