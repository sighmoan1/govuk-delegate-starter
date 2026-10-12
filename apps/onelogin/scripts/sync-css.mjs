import { mkdirSync, writeFileSync } from "node:fs";
import { serviceCss } from "../../../styles/service-css.mjs";

mkdirSync(new URL("../public", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/design.css", import.meta.url), serviceCss("onelogin"));
