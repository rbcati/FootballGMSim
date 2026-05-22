import re

with open('src/core/league-memory.js', 'r') as f:
    content = f.read()

def replace_fn(match):
    return """  const targetId = Number(userTeamId);
  let userRow = null;
  for (let i = 0; i < sorted.length; i++) {
    if (Number(sorted[i].id) === targetId) {
      userRow = sorted[i];
      break;
    }
  }

  const teamMap = new Map();
  let userTeam = null;
  for (const t of (teams || [])) {
    if (t?.id != null) {
      teamMap.set(Number(t.id), t);
      if (Number(t.id) === targetId) userTeam = t;
    }
  }

  const userRows = [];
  for (let i = 0; i < seasonStats.length; i++) {
    if (Number(seasonStats[i]?.teamId) === targetId) {
      userRows.push(seasonStats[i]);
    }
  }
"""

content = re.sub(
    r'<<<<<<< HEAD.*?=======\s*const teamMap = new Map\(\);\s*for \(const t of \(teams \|\| \[\]\)\) \{\s*if \(t\?\.id != null\) teamMap\.set\(Number\(t\.id\), t\);\s*\}\s*const userRow = sorted\.find\(\(t\) => Number\(t\.id\) === Number\(userTeamId\)\) \|\| null;\s*const userTeam = teamMap\.get\(Number\(userTeamId\)\) \?\? null;\s*const userRows = seasonStats\.filter\(\(row\) => Number\(row\?\.teamId\) === Number\(userTeamId\)\);\s*>>>>>>> origin/main',
    replace_fn,
    content,
    flags=re.DOTALL
)

with open('src/core/league-memory.js', 'w') as f:
    f.write(content)
