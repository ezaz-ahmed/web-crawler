import robotsParser from 'robots-parser';
import { config } from '../config.js';

type RobotsTxtParser = {
  isAllowed: (url: string, ua?: string) => boolean | undefined;
  getCrawlDelay: (ua?: string) => number | undefined;
};

const parseRobots = robotsParser as unknown as (
  url: string,
  robotsTxt: string,
) => RobotsTxtParser;

// Cache for robots.txt files (domain -> {parser, fetchedAt})
const robotsCache = new Map<
  string,
  {
    parser: RobotsTxtParser;
    fetchedAt: Date;
  }
>();

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Get the robots.txt parser for a domain (cached)
 */
async function getRobotsParser(url: string): Promise<RobotsTxtParser | null> {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.origin;

    // Check cache
    const cached = robotsCache.get(domain);
    if (cached) {
      const age = Date.now() - cached.fetchedAt.getTime();
      if (age < CACHE_DURATION) {
        return cached.parser;
      }
    }

    // Fetch robots.txt
    const robotsUrl = `${domain}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: {
        'User-Agent': config.crawler.userAgent,
      },
      signal: AbortSignal.timeout(10000), // 10s timeout for robots.txt
    });

    let robotsTxt = '';
    if (response.ok) {
      robotsTxt = await response.text();
    }

    // Parse robots.txt (even if empty/not found, parser handles gracefully)
    const parser = parseRobots(robotsUrl, robotsTxt);

    // Cache the result
    robotsCache.set(domain, {
      parser,
      fetchedAt: new Date(),
    });

    return parser;
  } catch (error) {
    // If fetching fails, assume allowed (don't block on robots.txt errors)
    console.warn(`Failed to fetch robots.txt for ${url}:`, error);
    return null;
  }
}

/**
 * Check if a URL is allowed by robots.txt
 */
export async function isAllowedByRobots(
  url: string,
  userAgent?: string,
): Promise<boolean> {
  const agent = userAgent || config.crawler.userAgent;

  try {
    const parser = await getRobotsParser(url);
    if (!parser) {
      // If no parser available, assume allowed
      return true;
    }

    const allowed = parser.isAllowed(url, agent);
    if (!allowed) {
      console.log(`✗ Blocked by robots.txt: ${url}`);
    }
    return allowed !== false; // Treat undefined as allowed
  } catch (error) {
    // On error, assume allowed (fail open)
    console.warn(`Error checking robots.txt for ${url}:`, error);
    return true;
  }
}

/**
 * Get crawl delay from robots.txt (in milliseconds)
 */
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
    return delay !== undefined ? delay * 1000 : null; // Convert to milliseconds
  } catch {
    return null;
  }
}

/**
 * Clear robots.txt cache (for testing or manual refresh)
 */
export function clearRobotsCache(): void {
  robotsCache.clear();
  console.log('✓ Robots.txt cache cleared');
}
