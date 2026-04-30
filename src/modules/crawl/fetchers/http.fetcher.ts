import { detectContentType } from './detect.fetcher.js';

export async function fetchHeadContentType(
  url: string,
): Promise<string | undefined> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.headers.get('content-type') || undefined;
  } catch {
    return undefined;
  }
}

export { detectContentType };
