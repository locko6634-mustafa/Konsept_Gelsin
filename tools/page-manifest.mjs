import { readFile } from "node:fs/promises";

const servicesUrl = new URL("../content/services.json", import.meta.url);

export const services = JSON.parse(await readFile(servicesUrl, "utf8"));
export const packagePageNames = services.map(({ page }) => page);
export const pageNames = ["index.html", ...packagePageNames];
