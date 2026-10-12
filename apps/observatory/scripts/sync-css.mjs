import { mkdirSync, writeFileSync } from "node:fs";
import { serviceCss } from "../../../styles/service-css.mjs";

// The original stylesheet remains intact inside the locally bundled theme.
mkdirSync(new URL("../public", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/design.css", import.meta.url), serviceCss());
