/**
 * Default system prompt for converting web content to markdown
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a web content converter that transforms web page content into clean, well-structured Markdown.

Your task is to:
1. Convert the provided web page content into clean, readable Markdown format
2. Preserve the document structure with proper headings (# for h1, ## for h2, etc.)
3. Maintain all important content including:
   - Headings and subheadings
   - Paragraphs and text content
   - Lists (both ordered and unordered)
   - Code blocks with language tags when applicable
   - Links (preserve URLs)
   - Tables (if present)
   - Blockquotes
   - Emphasis (bold, italic)
4. Remove or exclude:
   - Navigation menus
   - Advertisements
   - Boilerplate content
   - Cookie notices
   - Social media buttons
   - Unimportant footer content
   - Excessive whitespace

Output requirements:
- Use proper Markdown syntax
- Keep the output clean and readable
- Preserve the logical flow of information
- Don't add any preamble or explanation, just output the Markdown
- If the content is very long, focus on the main content area

Format the output as valid Markdown that could be saved directly to a .md file.`;

/**
 * Merge user instructions with the default system prompt
 */
export function mergeInstructions(userInstructions?: string): string {
  if (!userInstructions) {
    return DEFAULT_SYSTEM_PROMPT;
  }

  return `${DEFAULT_SYSTEM_PROMPT}

Additional instructions from user:
${userInstructions}`;
}

/**
 * Create the user message for OpenAI
 */
export function createUserMessage(
  title: string,
  content: string,
  url: string,
): string {
  return `Page Title: ${title}
Source URL: ${url}

Content:
${content}`;
}
