const fs = require('fs');

let content = fs.readFileSync('src/core/ai-logic.js', 'utf8');

const regex = /        const hardCap     = Constants\.SALARY_CAP\.HARD_CAP;/g;
const replace = `        let targetCap = Constants.SALARY_CAP.HARD_CAP;
        // On higher difficulties, AI targets a lower cap utilization to preserve space for free agency
        if (meta.difficulty === 'Hard') targetCap = Constants.SALARY_CAP.HARD_CAP - 10; // Target $10M buffer
        if (meta.difficulty === 'Legendary') targetCap = Constants.SALARY_CAP.HARD_CAP - 25; // Target $25M buffer
        const hardCap = targetCap;`;

if (content.includes('const hardCap     = Constants.SALARY_CAP.HARD_CAP;')) {
    content = content.replace(regex, replace);
    fs.writeFileSync('src/core/ai-logic.js', content);
    console.log('Added difficulty scaling to AI cap management');
}
