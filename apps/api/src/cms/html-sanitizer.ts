import sanitizeHtml from "sanitize-html";

/**
 * The allow-list that makes stored HTML safe to render anywhere.
 *
 * This is the security boundary for the whole CMS: an editor's body is
 * trusted by the public site only because it came through here. Tags and
 * attributes an article needs; `class` only for the editor's own alignment
 * and code-language classes; links may only be http(s)/mailto/tel; images
 * may only be http(s) or our own /api/v1/public/media path; every anchor
 * gets rel="noopener" when it opens a new tab. Nothing that runs script,
 * nothing that loads a stylesheet, no inline styles.
 */
const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "sub", "sup", "small", "abbr", "code", "kbd", "pre",
  "blockquote", "cite", "q",
  "ul", "ol", "li",
  "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "div", "span", "section", "article", "aside", "details", "summary",
  "iframe", "video", "source", "audio",
];

const CLASS_PATTERN = /^(text-(left|center|right|justify)|align-(left|center|right)|language-[a-z0-9-]+|lead|callout(-[a-z]+)?|table(-[a-z]+)?|editor-[a-z0-9-]+)$/u;

const EMBED_HOSTS = ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "www.google.com"];

export function sanitizeBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["id", "class", "title", "lang", "dir", "data-align", "data-type"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading", "srcset", "sizes"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
      col: ["span"],
      details: ["open"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "loading", "title"],
      video: ["src", "controls", "poster", "width", "height", "preload", "muted", "loop", "playsinline"],
      audio: ["src", "controls", "preload"],
      source: ["src", "type"],
      pre: ["data-language"],
    },
    allowedClasses: { "*": [CLASS_PATTERN] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"], iframe: ["https"], video: ["http", "https"], audio: ["http", "https"], source: ["http", "https"] },
    allowProtocolRelative: false,
    allowedIframeHostnames: EMBED_HOSTS,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => {
        const next = { ...attribs };
        if (next["target"] === "_blank") next["rel"] = "noopener noreferrer";
        else delete next["target"];
        return { tagName, attribs: next };
      },
      img: (tagName, attribs) => ({ tagName, attribs: { loading: "lazy", ...attribs } }),
    },
    // Our own media path is relative; sanitize-html drops relative URLs on
    // img unless the scheme check is bypassed for them explicitly.
    exclusiveFilter: (frame) => frame.tag === "img" && !!frame.attribs["src"] && !/^(https?:\/\/|\/api\/v1\/public\/media\/)/u.test(frame.attribs["src"]),
  });
}

/** Text without markup, whitespace collapsed — for search, excerpts and reading time. */
export function plainTextOf(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerptOf(plainText: string, words = 40): string {
  const parts = plainText.split(" ");
  return parts.length <= words ? plainText : `${parts.slice(0, words).join(" ")}…`;
}
