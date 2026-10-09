# Broadford Cemetery Trust website (proof of concept)

This is a small website for the Broadford Cemetery Trust, built with Eleventy. It is a proof of concept for a content management system, and the banner at the top of every page says so. It is not the Trust's website.

To run it on your own computer, install Node 22 or later, then run `npm ci` once and `npm start`. The site opens at http://localhost:8080/ and updates as files change. `npm run build` writes the finished site to the `_site` folder.

All wording, links, fees, image paths and page titles live in JSON files in the `content` folder. Templates in `src` hold only markup and class names. Every file in `content` is loaded automatically, so adding a file needs no code change. `cms.config.json` describes each content file and its fields, and the content management system reads it to build its editing forms. Images, the stylesheet and the scripts are in `src/assets`.

Pushing to the `main` branch runs the workflow in `.github/workflows/deploy.yml`. It installs the packages, builds the site and publishes the `_site` folder to GitHub Pages. Links in the site are relative, so it works from any address, including a repository sub-path.
