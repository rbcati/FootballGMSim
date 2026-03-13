const fs = require('fs');

let content = fs.readFileSync('src/ui/components/NewLeagueSetup.jsx', 'utf8');

const strToReplace1 = `  const [selectedTeam, setSelectedTeam] = useState(null);
  const [year, setYear] = useState(2025);
  const [creating, setCreating] = useState(false);`;

const newStr1 = `  const [selectedTeam, setSelectedTeam] = useState(null);
  const [year, setYear] = useState(2025);
  const [difficulty, setDifficulty] = useState("Normal");
  const [creating, setCreating] = useState(false);`;

const strToReplace2 = `    await actions.newLeague(DEFAULT_TEAMS, { userTeamId: selectedTeam, year });`;
const newStr2 = `    await actions.newLeague(DEFAULT_TEAMS, { userTeamId: selectedTeam, year, difficulty });`;

const strToReplace3 = `            <div className="card" style={{ padding: "var(--space-6)" }}>
              <h2
                style={{
                  fontSize: "var(--text-xl)",
                  fontWeight: 800,
                  marginBottom: "var(--space-4)",
                  borderBottom: "2px solid var(--hairline)",
                  paddingBottom: "var(--space-2)",
                }}
              >
                League Settings
              </h2>

              <div style={{ marginBottom: "var(--space-4)" }}>
                <label style={{ display: "block", marginBottom: "var(--space-2)", fontWeight: 600 }}>
                  Starting Year
                </label>
                <select
                  className="input"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  <option value={2025}>2025 Season</option>
                  <option value={2024}>2024 Season</option>
                </select>
              </div>
            </div>`;

const newStr3 = `            <div className="card" style={{ padding: "var(--space-6)" }}>
              <h2
                style={{
                  fontSize: "var(--text-xl)",
                  fontWeight: 800,
                  marginBottom: "var(--space-4)",
                  borderBottom: "2px solid var(--hairline)",
                  paddingBottom: "var(--space-2)",
                }}
              >
                League Settings
              </h2>

              <div style={{ marginBottom: "var(--space-4)" }}>
                <label style={{ display: "block", marginBottom: "var(--space-2)", fontWeight: 600 }}>
                  Starting Year
                </label>
                <select
                  className="input"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  <option value={2025}>2025 Season</option>
                  <option value={2024}>2024 Season</option>
                </select>
              </div>

              <div style={{ marginBottom: "var(--space-4)" }}>
                <label style={{ display: "block", marginBottom: "var(--space-2)", fontWeight: 600 }}>
                  Difficulty
                </label>
                <select
                  className="input"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="Easy">Easy (Lenient trades & contracts)</option>
                  <option value="Normal">Normal (Standard)</option>
                  <option value="Hard">Hard (Strict trades & aggressive AI)</option>
                  <option value="Legendary">Legendary (Maximum resistance)</option>
                </select>
              </div>
            </div>`;

if (content.includes(strToReplace1)) {
    content = content.replace(strToReplace1, newStr1);
    content = content.replace(strToReplace2, newStr2);
    content = content.replace(strToReplace3, newStr3);
    fs.writeFileSync('src/ui/components/NewLeagueSetup.jsx', content);
    console.log('Added difficulty dropdown to NewLeagueSetup');
}
