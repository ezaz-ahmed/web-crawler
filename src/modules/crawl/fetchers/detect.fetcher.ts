import type { ContentType } from '../../../types.js';

export function detectContentType(
  url: string,
  contentTypeHeader?: string,
): ContentType {
  if (contentTypeHeader) {
    const lowerContentType = contentTypeHeader.toLowerCase();

    if (
      lowerContentType.includes('text/html') ||
      lowerContentType.includes('application/xhtml')
    ) {
      return 'html';
    }
    if (lowerContentType.includes('application/pdf')) {
      return 'pdf';
    }
    if (
      lowerContentType.includes(
        'application/vnd.openxmlformats-officedocument.wordprocessingml',
      ) ||
      lowerContentType.includes('application/msword')
    ) {
      return 'docx';
    }
  }

  const urlLower = url.toLowerCase();

  if (urlLower.endsWith('.pdf')) {
    return 'pdf';
  }
  if (urlLower.endsWith('.docx') || urlLower.endsWith('.doc')) {
    return 'docx';
  }
  if (
    urlLower.endsWith('.html') ||
    urlLower.endsWith('.htm') ||
    urlLower.endsWith('/') ||
    !urlLower.includes('.')
  ) {
    return 'html';
  }

  return 'unsupported';
}

export function getContentTypeDescription(contentType: ContentType): string {
  switch (contentType) {
    case 'html':
      return 'HTML Web Page';
    case 'pdf':
      return 'PDF Document';
    case 'docx':
      return 'Word Document';
    case 'unsupported':
      return 'Unsupported Format';
  }
}
