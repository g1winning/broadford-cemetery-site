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
  // The map library, served from this site rather than a third-party CDN.
  eleventyConfig.addPassthroughCopy({ "node_modules/leaflet/dist/leaflet.js": "assets/vendor/leaflet/leaflet.js" });
  eleventyConfig.addPassthroughCopy({ "node_modules/leaflet/dist/leaflet.css": "assets/vendor/leaflet/leaflet.css" });
  eleventyConfig.addPassthroughCopy({ "node_modules/leaflet/dist/images": "assets/vendor/leaflet/images" });
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

  // ---- Cemetery records (published from the CMS into content/cemetery/) ----

  // GeoJSON polygon -> Leaflet ring of [lat, lng].
  const ring = (g) => (g && g.coordinates && g.coordinates[0] ? g.coordinates[0].map((p) => [p[1], p[0]]) : null);

  // Compact data for the interactive map: grave-search/map-data.json.
  eleventyConfig.addFilter("mapData", (cem) => {
    if (!cem || !cem.info) return {};
    const i = cem.info;
    return {
      centre: i.centre,
      bounds: ring(i.bounds),
      imagery: i.imagery,
      sections: (cem.sections || []).filter((s) => s.polygon).map((s) => ({ name: s.name, ring: ring(s.polygon) })),
      plots: (cem.plots || []).filter((p) => p.geometry).map((p) => ({
        ref: p.ref, slug: p.slug, status: p.status, section: p.section, forSale: p.forSale,
        ring: ring(p.geometry), centre: p.centre,
        thumb: p.photos && p.photos[0] ? p.photos[0].thumb : "",
        people: p.people.map((x) => ({ id: x.id, name: x.name, short: x.short, first: x.first, last: x.last, born: x.born, died: x.died, bornText: x.bornText, diedText: x.diedText, age: x.age })),
      })),
      forms: (cem.forms || []).map((f) => ({ key: f.key, title: f.title, plotStatuses: f.plotStatuses, forSaleOnly: f.forSaleOnly })),
    };
  });

  // Years lived, e.g. "1873 to 1950", from partial dates.
  eleventyConfig.addFilter("lifespan", (p) => {
    const y = (d) => (d ? String(d).slice(0, 4) : "");
    const b = y(p.born), d = y(p.died);
    if (b && d) return b + " to " + d;
    if (d) return "died " + d;
    if (b) return "born " + b;
    return "";
  });

  // Forms that may be sent about a given plot.
  eleventyConfig.addFilter("formsForPlot", (forms, plot) => (forms || []).filter((f) => {
    if (!plot) return !f.plotStatuses.length && !f.forSaleOnly;
    if (f.forSaleOnly) return plot.forSale;
    return !f.plotStatuses.length || f.plotStatuses.includes(plot.status);
  }));

  eleventyConfig.addFilter("storiesFor", (stories, ids) => (stories || []).filter((s) => (ids || []).includes(s.id)));
  eleventyConfig.addFilter("byKey", (list, key, value) => (list || []).filter((x) => x[key] === value));

  // People grouped by the first letter of their surname, for the name index.
  eleventyConfig.addFilter("peopleIndex", (plots) => {
    const all = [];
    (plots || []).forEach((p) => p.people.forEach((x) => all.push(Object.assign({ plotRef: p.ref, plotSlug: p.slug, section: p.section }, x))));
    all.sort((a, b) => (a.last || "~").localeCompare(b.last || "~") || (a.first || "").localeCompare(b.first || "") || String(a.died).localeCompare(String(b.died)));
    const groups = new Map();
    all.forEach((x) => {
      const letter = /^[A-Za-z]/.test(x.last || "") ? x.last[0].toUpperCase() : "#";
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(x);
    });
    return [...groups.entries()].map(([letter, people]) => ({ letter, people }));
  });

  // Plots grouped by section name, for the plot index.
  eleventyConfig.addFilter("plotsBySection", (plots) => {
    const groups = new Map();
    (plots || []).forEach((p) => {
      const k = p.section || "Other";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([name, plots]) => ({ name, plots }));
  });

  eleventyConfig.addFilter("inputType", (t) => ({ email: "email", tel: "tel", date: "date", datetime: "datetime-local", number: "number" })[t] || "text");
  eleventyConfig.addFilter("names", (people) => (people || []).map((p) => p.name).join(", "));
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("encode", (v) => encodeURIComponent(String(v == null ? "" : v)));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    templateFormats: ["njk", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
