import { stripHtml, computeContentHash } from './normalize';

export interface NormalizedEntry {
  url: string;
  title: string;
  published_at: string;
  raw_text: string;
  content_hash: string;
}

export interface RawFeedItem {
  title: string;
  url: string;
  published_at?: string;
  content: string;
}

/**
 * Universal RSS 2.0 and Atom XML parser.
 */
export async function parseRssOrAtom(
  xmlText: string,
  sourceBaseUrl: string,
): Promise<NormalizedEntry[]> {
  const entries: NormalizedEntry[] = [];

  // 1. Detect if Atom (<entry>) or RSS (<item>)
  const isAtom = xmlText.includes('<entry>') || xmlText.includes('<entry ');
  const itemRegex = isAtom
    ? /<entry[\s\S]*?<\/entry>/gi
    : /<item[\s\S]*?<\/item>/gi;

  const matches = xmlText.match(itemRegex) || [];

  for (const block of matches) {
    // Title
    const titleMatch =
      block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ||
      block.match(/<title[^>]*\/>/i);
    const rawTitle = titleMatch ? stripHtml(titleMatch[1] || '') : 'Untitled';

    // Link/URL
    let link = '';
    if (isAtom) {
      // Atom link can be <link href="..." /> or <link>...</link>
      const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefMatch) {
        link = hrefMatch[1].trim();
      } else {
        const textLinkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
        link = textLinkMatch ? stripHtml(textLinkMatch[1]) : '';
      }
    } else {
      const rssLinkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      link = rssLinkMatch ? stripHtml(rssLinkMatch[1]) : '';
    }

    if (!link) {
      // Fallback: check <guid> or <id>
      const guidMatch =
        block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) ||
        block.match(/<id[^>]*>([\s\S]*?)<\/id>/i);
      const possibleUrl = guidMatch ? stripHtml(guidMatch[1]) : '';
      if (possibleUrl.startsWith('http://') || possibleUrl.startsWith('https://')) {
        link = possibleUrl;
      } else {
        link = `${sourceBaseUrl}#${entries.length + 1}`;
      }
    }

    // Published Date
    const dateMatch =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
    let publishedAt = new Date().toISOString();
    if (dateMatch) {
      const parsedDate = new Date(stripHtml(dateMatch[1]));
      if (!isNaN(parsedDate.getTime())) {
        publishedAt = parsedDate.toISOString();
      }
    }

    // Content / Raw Text
    const contentMatch =
      block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
      block.match(/<content[^>]*>([\s\S]*?)<\/content>/i) ||
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const rawContent = contentMatch
      ? stripHtml(contentMatch[1])
      : rawTitle;

    const contentHash = await computeContentHash(link, rawTitle, rawContent);

    entries.push({
      url: link,
      title: rawTitle,
      published_at: publishedAt,
      raw_text: rawContent,
      content_hash: contentHash,
    });
  }

  return entries;
}

/**
 * GitHub Releases parser.
 * Supports both GitHub REST API JSON responses (/repos/:owner/:repo/releases)
 * and GitHub Atom release feeds (https://github.com/:owner/:repo/releases.atom).
 */
export async function parseGitHubReleases(
  payload: string,
  sourceUrl: string,
): Promise<NormalizedEntry[]> {
  const trimmed = payload.trim();

  // If payload is JSON array (GitHub API format)
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const releasesList = Array.isArray(parsed) ? parsed : [parsed];
      const entries: NormalizedEntry[] = [];

      for (const item of releasesList) {
        if (!item || typeof item !== 'object') continue;
        const link = item.html_url || `${sourceUrl}#${item.tag_name || entries.length + 1}`;
        const title = item.name || item.tag_name || 'New GitHub Release';
        const rawText = stripHtml(item.body || title);
        let publishedAt = new Date().toISOString();
        if (item.published_at || item.created_at) {
          const d = new Date(item.published_at || item.created_at);
          if (!isNaN(d.getTime())) {
            publishedAt = d.toISOString();
          }
        }
        const contentHash = await computeContentHash(link, title, rawText);

        entries.push({
          url: link,
          title,
          published_at: publishedAt,
          raw_text: rawText,
          content_hash: contentHash,
        });
      }

      return entries;
    } catch {
      // Fallback to XML parser if JSON parsing failed
    }
  }

  // If payload is Atom XML feed
  return parseRssOrAtom(payload, sourceUrl);
}

/**
 * Extension Point: Custom API Source
 */
export async function parseApiSource(
  payload: string,
  sourceUrl: string,
): Promise<NormalizedEntry[]> {
  try {
    const data = JSON.parse(payload);
    const items = Array.isArray(data) ? data : data.items || data.articles || [data];
    const entries: NormalizedEntry[] = [];

    for (const item of items) {
      const link = item.url || item.link || `${sourceUrl}#${entries.length + 1}`;
      const title = item.title || 'Untitled';
      const text = stripHtml(item.text || item.content || item.summary || title);
      const publishedAt = item.published_at || new Date().toISOString();
      const contentHash = await computeContentHash(link, title, text);

      entries.push({
        url: link,
        title,
        published_at: publishedAt,
        raw_text: text,
        content_hash: contentHash,
      });
    }

    return entries;
  } catch (err) {
    throw new Error(`API source parsing error for ${sourceUrl}: ${(err as Error).message}`);
  }
}

/**
 * Extension Point: Newsletter Source (e.g. Inbound Webhook / Markdown digest)
 */
export async function parseNewsletterSource(
  payload: string,
  sourceUrl: string,
): Promise<NormalizedEntry[]> {
  // If payload is HTML or RSS-like, leverage universal parser
  if (payload.includes('<item') || payload.includes('<entry')) {
    return parseRssOrAtom(payload, sourceUrl);
  }

  // Plain text / markdown digest: treat as single normalized entry
  const firstLine = payload.split('\n')[0] || 'Newsletter Update';
  const title = stripHtml(firstLine).slice(0, 150);
  const rawText = stripHtml(payload);
  const contentHash = await computeContentHash(sourceUrl, title, rawText);

  return [
    {
      url: sourceUrl,
      title,
      published_at: new Date().toISOString(),
      raw_text: rawText,
      content_hash: contentHash,
    },
  ];
}

/**
 * Dispatcher for feed normalization based on news_sources.kind.
 */
export async function parseFeedSource(
  kind: 'rss' | 'github_releases' | 'api' | 'newsletter',
  content: string,
  sourceUrl: string,
): Promise<NormalizedEntry[]> {
  switch (kind) {
    case 'rss':
      return parseRssOrAtom(content, sourceUrl);
    case 'github_releases':
      return parseGitHubReleases(content, sourceUrl);
    case 'api':
      return parseApiSource(content, sourceUrl);
    case 'newsletter':
      return parseNewsletterSource(content, sourceUrl);
    default:
      return parseRssOrAtom(content, sourceUrl);
  }
}
