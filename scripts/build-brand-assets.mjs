// Reproducible vector assets. Geometry is a cleaned construction of the supplied
// Sparked N and geometric wordmark, not a runtime font or embedded raster image.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const output = fileURLToPath(new URL("../apps/web/public/brand/", import.meta.url));
await mkdir(output, { recursive: true });

const palettes = {
  light: ["#171A1F", "#2B3038", "#C94F2D", "#FFB35C"],
  dark: ["#AAB8C0", "#DCE3E6", "#C94F2D", "#FFB35C"],
  mono: ["#171A1F", "#171A1F", "#171A1F", "#171A1F"],
};
function mark([pillar, diagonal, ember, spark]) {
  return `<path fill="${pillar}" d="M0 14 23 37v60L0 114z"/><path fill="${ember}" d="m77 43 23-15v86H77z"/><path fill="${diagonal}" d="m0 14 100 100H76L0 38z"/><path fill="${spark}" d="M88 0c2 10 5 14 12 17-7 3-10 7-12 17-2-10-5-14-12-17C83 14 86 10 88 0Z"/>`;
}
// Letter outlines are stable at every size and do not depend on installed fonts.
const wordmark = `<path d="M0 56V0h9l31 42V0h9v56h-9L9 14v42ZM102 39H69c1 8 6 12 14 12 5 0 10-2 14-5v8c-4 3-10 4-15 4-14 0-22-9-22-22 0-13 9-22 21-22 14 0 22 10 21 25ZM69 32h24c-1-7-5-11-12-11s-11 4-12 11ZM115 16h9v40h-9ZM114 4a5.5 5.5 0 1 1 11 0 5.5 5.5 0 1 1-11 0ZM137 45c5 4 10 6 16 6 6 0 9-2 9-5 0-4-4-5-10-7-10-2-15-5-15-12 0-8 7-13 18-13 6 0 11 1 15 4v8c-5-3-10-5-15-5-6 0-9 2-9 5 0 3 3 4 10 6 10 2 15 5 15 13 0 8-7 13-18 13-6 0-12-2-16-5ZM185 5h9v11h12v7h-12v21c0 5 2 7 6 7l6-1v7l-8 1c-9 0-13-5-13-14V23h-7v-7h7ZM217 16h9v7c3-5 8-8 15-8v9c-10-1-15 4-15 14v18h-9ZM248 19c5-3 11-5 17-5 13 0 19 6 19 18v24h-9v-5c-4 5-9 7-15 7-9 0-15-5-15-13 0-9 7-14 20-14h10c0-7-3-10-11-10-6 0-11 2-16 5ZM275 38h-10c-8 0-11 2-11 7 0 4 3 6 8 6 8 0 13-5 13-11Z" fill-rule="evenodd"/>`;
function svg(viewBox, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>\n`;
}
for (const [theme, colors] of Object.entries(palettes)) {
  const name = theme === "light" ? "neistra-mark" : `neistra-mark-${theme}`;
  await writeFile(join(output, `${name}.svg`), svg("0 0 100 114", mark(colors)));
  if (theme !== "mono") {
    await writeFile(join(output, `neistra-lockup-${theme}.svg`), svg("0 0 402 114",
      `${mark(colors)}<g fill="${colors[0]}" transform="translate(118 45) scale(.96)">${wordmark}</g>`));
    await writeFile(join(output, `neistra-icon-${theme}.svg`), svg("0 0 40 40",
      `<rect width="40" height="40" rx="8" fill="${theme === "light" ? "#F4F1EB" : "#171A1F"}"/><g transform="translate(8 5) scale(.26)">${mark(colors)}</g>`));
  }
}
await writeFile(join(output, "neistra-favicon.svg"), svg("0 0 40 40",
  `<style>.pillar{fill:#171A1F}.diagonal{fill:#2B3038}@media(prefers-color-scheme:dark){.pillar{fill:#AAB8C0}.diagonal{fill:#DCE3E6}}</style><g transform="translate(6 3) scale(.30)">${mark(palettes.light).replace('fill="#171A1F"', 'class="pillar"').replace('fill="#2B3038"', 'class="diagonal"')}</g>`));
// ImageMagick renders our vectors only; supplied raster artwork is never edited.
for (const size of [16, 32, 180]) {
  const filename = size === 180 ? "neistra-touch-icon.png" : `neistra-favicon-${size}.png`;
  execFileSync("magick", ["-background", "none", "-density", "432", join(output, "neistra-icon-light.svg"), "-resize", `${size}x${size}`, join(output, filename)]);
}
console.log(`Generated Neistra assets in ${output}`);
