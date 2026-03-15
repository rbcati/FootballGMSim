import re

with open('src/core/game-simulator.js', 'r') as f:
    content = f.read()

# Add playLogs to simulateFullGame
# Find: const result = {
# Replace: const result = { playLogs: [],

content = re.sub(
    r"(const result = \{)",
    r"\1\n          playLogs: [],",
    content
)

# Add synthetic play generation to simulateFullGame
# After possession = U.random() < 0.5 ? 'home' : 'away'; inside the function but outside the loop? No, inside the loop.

# Inside the loop:
#                 if (typeRoll < tdShare) {
#                     // Touchdown

synthetic_play_logic = """
            // --- SYNTHETIC PLAY LOG GENERATION ---
            if (options && options.generateLogs) {
                const homeName = "Home"; // Need to pass these in, but we can use 'home' and 'away' strings
                const awayName = "Away";
                const offName = isHome ? "Home" : "Away";
                const defName = isHome ? "Away" : "Home";

                const qtr = Math.min(4, Math.floor((d / totalDrives) * 4) + 1);
                const clockMins = 15 - Math.floor(( (d % (totalDrives/4)) / (totalDrives/4) ) * 15);
                const clockStr = `${clockMins}:00`;

                const addLog = (text, yl, dn, dist) => {
                    result.playLogs.push({
                        scoreHome: result.home.score,
                        scoreAway: result.away.score,
                        quarter: qtr,
                        clock: clockStr,
                        yardLine: yl,
                        down: dn,
                        distance: dist,
                        possession: possession,
                        playText: text
                    });
                };

                let currentYardLine = 25; // Start at own 25

                // Generate a few filler plays
                const numFiller = U.rand(2, 6);
                for (let p=0; p<numFiller; p++) {
                    const isPass = U.random() > 0.5;
                    const gain = U.rand(2, 15);
                    const playDesc = isPass ? `${offName} pass complete for ${gain} yards.` : `${offName} runs for ${gain} yards.`;
                    addLog(playDesc, currentYardLine, (p%3)+1, 10);
                    currentYardLine += gain;
                    if (currentYardLine > 100) currentYardLine = 99; // Don't cross goal line yet
                }

                // Now the outcome
                if (driveRoll < scoreProb) {
                    if (typeRoll < tdShare) {
                        addLog(`${offName} TOUCHDOWN!`, currentYardLine, 1, 'Goal');
                    } else {
                        addLog(`${offName} FIELD GOAL is GOOD.`, currentYardLine, 4, 'Goal');
                    }
                } else {
                    if (U.random() < turnoverChance) {
                        addLog(`${offName} Pass INTERCEPTED by ${defName}!`, currentYardLine, 3, 8);
                    } else {
                        addLog(`${offName} PUNTS the ball away.`, currentYardLine, 4, 10);
                    }
                }
            }
            // ------------------------------------
"""

# We need to inject this AFTER calculating turnoverChance, scoreProb, etc.
# Actually, it's easier to inject right before `if (driveRoll < scoreProb) {`
# But we need `typeRoll` and `turnoverChance`.
# Let's just do a simpler injection at the end of the drive loop, or right when events happen.

def inject_logs(match):
    return match.group(1) + """
                if (options && options.generateLogs) {
                    const qtr = Math.min(4, Math.floor((d / totalDrives) * 4) + 1);
                    const clockMins = 15 - Math.floor(( (d % (totalDrives/4)) / (totalDrives/4) ) * 15);
                    const clockStr = `${clockMins}:00`;

                    const addLog = (text) => {
                        result.playLogs.push({
                            scoreHome: result.home.score,
                            scoreAway: result.away.score,
                            quarter: qtr,
                            clock: clockStr,
                            yardLine: 50,
                            down: 1,
                            distance: 10,
                            possession: possession,
                            playText: text
                        });
                    };

                    const offName = isHome ? "Home" : "Away";
                    const defName = isHome ? "Away" : "Home";

                    // Filler plays
                    for(let i=0; i<U.rand(2, 5); i++) {
                        const gain = U.rand(1, 15);
                        addLog(U.random() > 0.5 ? `${offName} pass complete for ${gain} yds.` : `${offName} runs for ${gain} yds.`);
                    }

                    if (driveRoll < scoreProb) {
                        if (typeRoll < tdShare) {
                            addLog(`${offName} TOUCHDOWN!`);
                        } else {
                            addLog(`${offName} FIELD GOAL is GOOD.`);
                        }
                    } else {
                        if (U.random() < turnoverChance) { // Use hardcoded chance if undefined
                            addLog(`${offName} TURNOVER! Ball recovered by ${defName}.`);
                        } else {
                            addLog(`${offName} PUNTS.`);
                        }
                    }
                }
"""

content = re.sub(
    r"(if\s*\(driveRoll\s*<\s*scoreProb\)\s*\{\s*\/\/\s*---\s*SCORING\s*DRIVE\s*---\s*const\s*typeRoll\s*=\s*U\.random\(\);)",
    inject_logs,
    content
)

# Pass options into simulateFullGame
content = re.sub(
    r"(const simulateFullGame = \(homeStr, awayStr, homeDefStr, awayDefStr, diff, hMods, aMods)\)",
    r"\1, options)",
    content
)

content = re.sub(
    r"(simulateFullGame\(\s*homeStrength,\s*awayStrength,\s*homeDefenseStrength,\s*awayDefenseStrength,\s*strengthDiff,\s*homeMods,\s*awayMods)",
    r"\1, options",
    content
)

# Return playLogs in simGameStats
content = re.sub(
    r"(awayTurnoversForced:\s*awayRes\.turnoversForced\s*\|\|\s*0,)",
    r"\1\n      playLogs: fullGameResult.playLogs || [],",
    content
)

# Return playLogs in commitGameResult
content = re.sub(
    r"(defensiveTDs:\s*\{\s*home:\s*gameData\.homeDefTDs\s*\|\|\s*0,\s*away:\s*gameData\.awayDefTDs\s*\|\|\s*0\s*\},)",
    r"\1\n        playLogs: gameData.playLogs || [],",
    content
)

# Pass playLogs to commitGameResult inside simulateBatch
content = re.sub(
    r"(awayDefTDs:\s*pair\._awayDefTDs\s*\|\|\s*0,)",
    r"\1\n                playLogs: gameScores.playLogs || [],",
    content
)


with open('src/core/game-simulator.js', 'w') as f:
    f.write(content)
