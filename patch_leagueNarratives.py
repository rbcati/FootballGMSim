with open("src/ui/utils/leagueNarratives.js", "r") as f:
    content = f.read()

content = content.replace("import { buildNarrativeNewsItems } from './leagueNarratives.js';", "")
content += "\nexport function buildStorylineCards(league) { return []; }\nexport function buildNarrativeNewsItems(league) { return []; }\n"

with open("src/ui/utils/leagueNarratives.js", "w") as f:
    f.write(content)
