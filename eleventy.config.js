// Eleventy configuration for the Broadford Cemetery Trust site.
// All wording lives in the JSON files under content/. Templates hold markup only.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const isExternal = (href) => /^https?:\/\//i.test(href || "");
const isSpecial = (href) => /^(mailto:|tel:|#|\/)/i.test(href || "") || isExternal(href);

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/.nojekyll");
  eleventyConfig.addWatchTarget("content/");

  // Turns an object of entries (a folder of JSON files) into a list ordered by "order".
  eleventyConfig.addFilter("entries", (obj) => {
    return Object.keys(obj || {})
      .map((key) => Object.assign({ slug: key }, obj[key]))
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.slug.localeCompare(b.slug));
  });

  eleventyConfig.addFilter("money", (n) => {
    return "$" + Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });

  eleventyConfig.addFilter("longDate", (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    return Number(m[3]) + " " + MONTHS[Number(m[2]) - 1] + " " + m[1];
  });

  // Joins the lines of a multi-line text field with line breaks.
  eleventyConfig.addFilter("lines", (text) => {
    return String(text || "").split("\n").map((l) => l.trim()).join("<br>\n");
  });

  // Removes one wrapping paragraph so rich text can sit inside a caption or note.
  eleventyConfig.addFilter("inline", (html) => {
    const s = String(html || "").trim();
    const m = /^<p>([\s\S]*)<\/p>$/.exec(s);
    return m && m[1].indexOf("</p>") === -1 ? m[1] : s;
  });

  // Prefix for a relative link or file path so it works from any page depth.
  eleventyConfig.addFilter("rel", (href, root) => (isSpecial(href) ? href : (root || "") + href));
  eleventyConfig.addFilter("isExternal", isExternal);

  // Prepares stored rich text for the page:
  //  - relative links get the page's root prefix
  //  - links to other websites open in a new window and get the arrow and screen reader text
  //  - titles of Acts listed in the site details are wrapped in <cite>
  eleventyConfig.addNunjucksFilter("rich", function (html, rootArg) {
    const ctx = (this && this.ctx) || {};
    const root = rootArg !== undefined ? rootArg : ctx.root || "";
    const cited = (ctx.cms && ctx.cms.site && ctx.cms.site.citedTitles) || [];
    const icon = (ctx.cms && ctx.cms.site && ctx.cms.site.newWindowIcon) || "";
    const hidden = (ctx.cms && ctx.cms.site && ctx.cms.site.newWindowText) || "";
    let out = String(html || "");
    out = out.replace(/<a\s+href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (all, href, rest, text) => {
      if (isExternal(href)) {
        if (/visually-hidden/.test(text)) return all;
        return '<a href="' + href + '" target="_blank" rel="noopener">' + text +
          '<span class="ext-icon" aria-hidden="true">' + icon + '</span>' +
          '<span class="visually-hidden"> ' + hidden + '</span></a>';
      }
      if (isSpecial(href)) return all;
      return '<a href="' + (root || "") + href + '"' + rest + ">" + text + "</a>";
    });
    cited.forEach((title) => {
      if (title) out = out.split(title).join("<cite>" + title + "</cite>");
    });
    return out;
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
