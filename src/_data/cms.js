// Loads every JSON file under content/ into one nested object.
// content/pages/home.json becomes cms.pages.home, and
// content/fee-groups/right-of-interment.json becomes cms.feeGroups["right-of-interment"].
// Folder names are written in camel case (fee-groups becomes feeGroups). File names are kept as they are.
// Adding a file needs no code change.

const fs = require("fs");
const path = require("path");

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

function load(dir) {
  const out = {};
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      out[camel(name)] = load(full);
    } else if (name.endsWith(".json")) {
      out[name.slice(0, -5)] = JSON.parse(fs.readFileSync(full, "utf8"));
    }
  }
  return out;
}

module.exports = function () {
  return load(path.join(__dirname, "..", "..", "content"));
};
