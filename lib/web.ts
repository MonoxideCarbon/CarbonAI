import { search } from 'duck-duck-scrape'

export type WebResult = { title: string; url: string; snippet: string }
export type WebPage = { title: string; url: string; text: string }

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; CarbonAI-Private/1.0; +https://carbonai-private.vercel.app)',
  Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
}

export async function searchWeb(query: string): Promise<WebResult[]> {
  const result = await search(query, { safeSearch: 0 })
  return (result.results || []).slice(0, 6).map((item: any) => ({
    title: String(item.title || 'Untitled'),
    url: String(item.url || ''),
    snippet: String(item.description || item.snippet || ''),
  })).filter((item: WebResult) => item.url)
}

function stripHtml(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = (titleMatch?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return { title, text: cleaned.slice(0, 60_000) }
}

export async function readWebPage(url: string, timeoutMs = 6000): Promise<WebPage | null> {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(parsed.toString(), { headers: DEFAULT_HEADERS, redirect: 'follow', signal: controller.signal, cache: 'no-store' })
      if (!response.ok) return null
      const contentType = response.headers.get('content-type') || ''
      const raw = await response.text()
      if (!contentType.includes('html') && !contentType.includes('text/plain')) return null
      const { title, text } = contentType.includes('html') ? stripHtml(raw) : { title: parsed.hostname, text: raw.slice(0, 60_000) }
      if (!text) return null
      return { title: title || parsed.hostname, url: parsed.toString(), text }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/[^\s<>"']+/gi) || []).map(url => url.replace(/[),.!?;:]+$/, '')))].slice(0, 3)
}

export function shouldUseWeb(query: string): boolean {
  const q = query.toLowerCase()
  return /(https?:\/\/|www\.|latest|today|tonight|right now|current|currently|recent|news|breaking|weather|price|stock|market|score|schedule|who won|election|search the web|look up|find online|according to)/i.test(q)
}
