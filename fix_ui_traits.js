const fs = require('fs');

let content = fs.readFileSync('src/ui/components/PlayerProfile.jsx', 'utf8');

const regex = /\{\/\* Traits \*\/\}([\s\S]*?)\{\/\* Contract Status \*\/\}/;

const replaceWith = `{/* Traits and Personality */}
                <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
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

                {/* Contract Status */}`;

content = content.replace(regex, replaceWith);
fs.writeFileSync('src/ui/components/PlayerProfile.jsx', content);
console.log('Fixed PlayerProfile.jsx to include personality traits');
