const fs = require('fs');

let content = fs.readFileSync('src/ui/components/TeamProfile.jsx', 'utf8');

const importStr = `import { useWorker } from "../hooks/useWorker.js";`;
const newImportStr = `import { useWorker } from "../hooks/useWorker.js";\nimport RelocateModal from "./RelocateModal.jsx";`;

if (content.includes(importStr) && !content.includes('RelocateModal')) {
     content = content.replace(importStr, newImportStr);
}

const hookStr = `  const { state, actions } = useWorker();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("roster"); // 'roster' | 'history' | 'coaches'`;

const newHookStr = `  const { state, actions } = useWorker();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("roster"); // 'roster' | 'history' | 'coaches'
  const [showRelocate, setShowRelocate] = useState(false);
  const isUserTeam = state.league?.userTeamId === teamId;`;

if (content.includes(hookStr)) {
    content = content.replace(hookStr, newHookStr);
}

const regex = /<h2\n\s*style=\{\{\n\s*margin: 0,\n\s*fontSize: "var\(--text-2xl\)",([\s\S]*?)\n\s*\}\}\n\s*>\n\s*\{team\.city\} \{team\.name\}\n\s*<\/h2>/;

const replaceWith = `<h2
                  style={{
                    margin: 0,
                    fontSize: "var(--text-2xl)",$1
                  }}
                >
                  {team.city} {team.name}
                  {isUserTeam && state.league.phase === 'offseason' && (
                     <button className="btn" style={{ marginLeft: 10, fontSize: "10px", padding: "2px 6px" }} onClick={() => setShowRelocate(true)}>RELOCATE</button>
                  )}
                </h2>`;

if (content.includes('{team.city} {team.name}')) {
    content = content.replace(regex, replaceWith);
}

const renderStr = `  return (
    <div
      onClick={onClose}`;

const newRenderStr = `  return (
    <>
    <div
      onClick={onClose}`;

const renderStr2 = `    </div>
  );
}`;

const newRenderStr2 = `    </div>
    {showRelocate && team && (
        <RelocateModal team={team} actions={actions} onClose={() => { setShowRelocate(false); onClose(); }} />
    )}
    </>
  );
}`;

if (content.includes(renderStr)) {
     content = content.replace(renderStr, newRenderStr);
     // reverse match the end
     const idx = content.lastIndexOf(renderStr2);
     content = content.slice(0, idx) + newRenderStr2 + content.slice(idx + renderStr2.length);
     fs.writeFileSync('src/ui/components/TeamProfile.jsx', content);
     console.log('Added Relocate modal to TeamProfile.jsx');
}
