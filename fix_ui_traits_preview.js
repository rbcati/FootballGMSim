const fs = require('fs');

let content = fs.readFileSync('src/ui/components/PlayerPreview.jsx', 'utf8');

const regex = /\{\/\* Ratings grid \*\/\}([\s\S]*?)<\/div>\n      <\/div>\n    <\/div>\n  \);\n\}/;

const replaceWith = `{/* Ratings grid */}
      <div style={{ marginTop: "var(--space-2)", padding: "0 var(--space-3)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)", fontSize: "var(--text-xs)" }}>
          {getTopRatings(player).map(([k, v]) => (
             <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
               <span style={{ color: "var(--text-muted)" }}>{k}</span>
               <span style={{ fontWeight: 600 }}>{v}</span>
             </div>
          ))}
        </div>
      </div>

      {/* Traits */}
      {(player.traits?.length > 0 || player.personality?.traits?.length > 0) && (
          <div style={{ marginTop: "var(--space-2)", padding: "0 var(--space-3)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap", justifyContent: "center" }}>
            {(player.traits || []).map((t, i) => (
                <span
                    key={i}
                    style={{
                    padding: "2px 6px",
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    }}
                >
                    {t}
                </span>
            ))}
            {player.personality?.traits?.map((t, i) => (
                <span
                    key={\`pers-\${i}\`}
                    style={{
                    padding: "2px 6px",
                    backgroundColor: "var(--accent-muted)",
                    border: "1px solid var(--accent)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "var(--accent)",
                    }}
                >
                    {t}
                </span>
            ))}
          </div>
      )}

    </div>
  );
}`;

content = content.replace(/\{\/\* Ratings grid \*\/\}([\s\S]*?)<\/div>\n      <\/div>\n    <\/div>\n  \);\n\}/, replaceWith);
fs.writeFileSync('src/ui/components/PlayerPreview.jsx', content);
console.log('Fixed PlayerPreview.jsx to include personality traits');
