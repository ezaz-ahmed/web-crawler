import type { Page } from 'puppeteer';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { convertToMarkdown } from '../processor.js';

function normalizeFileType(url: string): 'pdf' | 'docx' | 'other' {
  const lower = url.toLowerCase();

  if (lower.endsWith('.pdf')) {
    return 'pdf';
  }

  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    return 'docx';
  }

  return 'other';
}

export async function buildMarkdownByFilename(
  page: Page,
  files: Array<{ name: string; url: string }>,
  instructions?: string,
): Promise<Record<string, string>> {
  const markdownByFilename: Record<string, string> = {};

  for (const file of files) {
    const fileType = normalizeFileType(file.url);

    if (fileType === 'other') {
      continue;
    }

    try {
      const filePage = await page.browser().newPage();

      let buffer: Buffer;
      try {
        const response = await filePage.goto(file.url, {
          waitUntil: 'networkidle0',
          timeout: 25_000,
        });

        if (!response || !response.ok()) {
          const status = response?.status() ?? 'unknown';
          throw new Error(`HTTP ${status} while fetching file`);
        }

        buffer = Buffer.from(await response.buffer());
      } finally {
        await filePage.close();
      }

      const extractedText =
        fileType === 'pdf'
          ? (await pdfParse(buffer)).text
          : (await mammoth.extractRawText({ buffer })).value;

      const markdown = await convertToMarkdown(
        extractedText,
        file.name,
        file.url,
        instructions,
      );

      markdownByFilename[file.name] = markdown;
    } catch (error) {
      markdownByFilename[file.name] =
        `# ${file.name}\n\n[Failed to extract file content: ${(error as Error).message}]`;
    }
  }

  return markdownByFilename;
}
