with open("src/ui/utils/newsDesk.js", "r") as f:
    content = f.read()

content = content.replace("import { buildNarrativeNewsItems } from './leagueNarratives.js';", "export function buildNarrativeNewsItems(league) { return []; }")

with open("src/ui/utils/newsDesk.js", "w") as f:
    f.write(content)
