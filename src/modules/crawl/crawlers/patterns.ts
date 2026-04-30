/**
 * Pattern matching utility for URL filtering.
 */
function normalizePattern(pattern: string): string {
  return pattern.replace(/\/?\*+$/, '');
}

function matchesSinglePattern(url: string, pattern: string): boolean {
  const normalizedPattern = normalizePattern(pattern);

  if (
    normalizedPattern.startsWith('http://') ||
    normalizedPattern.startsWith('https://')
  ) {
    return url.startsWith(normalizedPattern);
  }

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    return pathname.includes(normalizedPattern);
  } catch {
    return url.includes(normalizedPattern);
  }
}

export function matchesPatterns(
  url: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): boolean {
  if (excludePatterns && excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (matchesSinglePattern(url, pattern)) {
        return false;
      }
    }
  }

  if (!includePatterns || includePatterns.length === 0) {
    return true;
  }

  for (const pattern of includePatterns) {
    if (matchesSinglePattern(url, pattern)) {
      return true;
    }
  }

  return false;
}

export function filterUrls(
  urls: string[],
  includePatterns?: string[],
  excludePatterns?: string[],
): string[] {
  return urls.filter((url) =>
    matchesPatterns(url, includePatterns, excludePatterns),
  );
}

export function isSameOrigin(url: string, referenceUrl: string): boolean {
  try {
    const urlObj = new URL(url);
    const refObj = new URL(referenceUrl);
    return urlObj.origin === refObj.origin;
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.hash = '';
    urlObj.searchParams.sort();
    return urlObj.toString();
  } catch {
    return url;
  }
}
