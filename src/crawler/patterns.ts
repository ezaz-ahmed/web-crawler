/**
 * Pattern matching utility for URL filtering.
 *
 * Uses simple prefix matching for simplicity. Patterns like:
 * - "/docs" matches any URL containing "/docs" (e.g., "/docs/intro", "/docs/api")
 * - "/blog/*" is treated as "/blog/" prefix
 * - "https://example.com/api" matches exact domain + path prefix
 */

/**
 * Converts a pattern with wildcards to a prefix for matching
 */
function normalizePattern(pattern: string): string {
  // Remove trailing wildcard for prefix matching
  return pattern.replace(/\/?\*+$/, '');
}

/**
 * Check if a URL matches a single pattern
 */
function matchesSinglePattern(url: string, pattern: string): boolean {
  const normalizedPattern = normalizePattern(pattern);

  // If pattern starts with http:// or https://, match full URL
  if (
    normalizedPattern.startsWith('http://') ||
    normalizedPattern.startsWith('https://')
  ) {
    return url.startsWith(normalizedPattern);
  }

  // Otherwise, match against the pathname part
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Handle path-based patterns
    return pathname.includes(normalizedPattern);
  } catch {
    // If URL parsing fails, do simple string matching
    return url.includes(normalizedPattern);
  }
}

/**
 * Check if a URL matches any of the include patterns (if provided)
 * and doesn't match any exclude patterns
 *
 * @param url - The URL to check
 * @param includePatterns - Optional whitelist patterns (at least one must match)
 * @param excludePatterns - Optional blacklist patterns (none can match)
 * @returns true if URL should be processed, false otherwise
 */
export function matchesPatterns(
  url: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): boolean {
  // First check exclude patterns - if any match, reject immediately
  if (excludePatterns && excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (matchesSinglePattern(url, pattern)) {
        return false; // Excluded
      }
    }
  }

  // If no include patterns specified, accept (unless already excluded)
  if (!includePatterns || includePatterns.length === 0) {
    return true;
  }

  // Check include patterns - at least one must match
  for (const pattern of includePatterns) {
    if (matchesSinglePattern(url, pattern)) {
      return true; // Included
    }
  }

  // No include pattern matched
  return false;
}

/**
 * Filter a list of URLs based on include/exclude patterns
 */
export function filterUrls(
  urls: string[],
  includePatterns?: string[],
  excludePatterns?: string[],
): string[] {
  return urls.filter((url) =>
    matchesPatterns(url, includePatterns, excludePatterns),
  );
}

/**
 * Check if a URL belongs to the same origin (domain) as a reference URL
 */
export function isSameOrigin(url: string, referenceUrl: string): boolean {
  try {
    const urlObj = new URL(url);
    const refObj = new URL(referenceUrl);
    return urlObj.origin === refObj.origin;
  } catch {
    return false;
  }
}

/**
 * Normalize a URL (remove fragments, sort query params for deduplication)
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove fragment
    urlObj.hash = '';
    // Sort query parameters for consistent comparison
    urlObj.searchParams.sort();
    return urlObj.toString();
  } catch {
    return url;
  }
}
