import fs from 'fs';

const filePath = 'src/core/league-memory.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `<<<<<<< HEAD
  const numericUserTeamId = Number(userTeamId);

  let userRow = null;
  for (let i = 0; i < sorted.length; i++) {
    if (Number(sorted[i]?.id) === numericUserTeamId) {
      userRow = sorted[i];
      break;
    }
  }

  let userTeam = null;
  for (let i = 0; i < (teams || []).length; i++) {
    if (Number(teams[i]?.id) === numericUserTeamId) {
      userTeam = teams[i];
      break;
    }
  }

  const userRows = [];
  for (let i = 0; i < (seasonStats || []).length; i++) {
    if (Number(seasonStats[i]?.teamId) === numericUserTeamId) {
      userRows.push(seasonStats[i]);
    }
  }
=======

  const teamMap = new Map();
  for (const t of (teams || [])) {
    if (t?.id != null) teamMap.set(Number(t.id), t);
  }

  const userRow = sorted.find((t) => Number(t.id) === Number(userTeamId)) || null;
  const userTeam = teamMap.get(Number(userTeamId)) ?? null;
  const userRows = seasonStats.filter((row) => Number(row?.teamId) === Number(userTeamId));
>>>>>>> origin/main`;

const replacement = `  const teamMap = new Map();
  for (const t of (teams || [])) {
    if (t?.id != null) teamMap.set(Number(t.id), t);
  }

  const numericUserTeamId = Number(userTeamId);

  let userRow = null;
  for (let i = 0; i < sorted.length; i++) {
    if (Number(sorted[i]?.id) === numericUserTeamId) {
      userRow = sorted[i];
      break;
    }
  }

  const userTeam = teamMap.get(numericUserTeamId) ?? null;

  const userRows = [];
  for (let i = 0; i < (seasonStats || []).length; i++) {
    if (Number(seasonStats[i]?.teamId) === numericUserTeamId) {
      userRows.push(seasonStats[i]);
    }
  }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Merge conflict resolved successfully');
} else {
  console.log('Could not find merge conflict block');
}
