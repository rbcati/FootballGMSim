const fs = require('fs');

let content = fs.readFileSync('src/ui/components/Roster.jsx', 'utf8');
const handleTagStr = `
  const handleTag = async (player) => {
      if (window.confirm(\`Apply Franchise Tag to \${player.name}?\`)) {
          await actions.applyFranchiseTag(player.id, player.teamId);
          fetchRoster();
      }
  };

  const handleRestructure = async (player) => {
      if (window.confirm(\`Restructure \${player.name}'s contract to save cap space this year?\`)) {
          await actions.restructureContract(player.id, player.teamId);
          fetchRoster();
      }
  };
`;

if (!content.includes('handleTag')) {
    content = content.replace('  const handleRelease = async (player) => {', handleTagStr + '\n  const handleRelease = async (player) => {');

    // Add logic to UI
    const controlsRegex = /<div\n\s*style=\{\{\n\s*display: "flex",\n\s*gap: 4,\n\s*justifyContent: "center",\n\s*\}\}\n\s*>\n\s*<button\n\s*className="btn btn-danger"\n\s*style=\{\{\n\s*fontSize: "var\(--text-xs\)",\n\s*padding: "2px 8px",\n\s*\}\}\n\s*onClick=\{\(\) => handleRelease\(player\)\}/;

    const newControls = `<div
                          style={{
                            display: "flex",
                            gap: 4,
                            justifyContent: "center",
                          }}
                        >
                          {league.phase === 'offseason_resign' && player.contract?.years === 0 && !player.isTagged && (
                            <button
                                className="btn"
                                style={{ fontSize: "10px", padding: "2px 6px", background: "var(--warning)", color: "#000", border: "none" }}
                                onClick={(e) => { e.stopPropagation(); handleTag(player); }}
                                title="Apply Franchise Tag"
                            >
                                TAG
                            </button>
                          )}
                          {player.contract?.years >= 2 && player.contract?.baseAnnual > 5 && (
                             <button
                                className="btn"
                                style={{ fontSize: "10px", padding: "2px 6px" }}
                                onClick={(e) => { e.stopPropagation(); handleRestructure(player); }}
                                title="Restructure Contract"
                             >
                                RESTR
                             </button>
                          )}
                          <button
                            className="btn btn-danger"
                            style={{
                              fontSize: "var(--text-xs)",
                              padding: "2px 8px",
                            }}
                            onClick={(e) => { e.stopPropagation(); handleRelease(player); }}`;

    content = content.replace(controlsRegex, newControls);
    fs.writeFileSync('src/ui/components/Roster.jsx', content);
    console.log('Added tag and restructure buttons to Roster.jsx');
}
