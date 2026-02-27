import re

with open('src/ui/components/LeagueDashboard.jsx', 'r') as f:
    content = f.read()

# Add import
content = content.replace(
    "import NewsFeed        from './NewsFeed.jsx';",
    "import NewsFeed        from './NewsFeed.jsx';\nimport StatLeadersWidget from './StatLeadersWidget.jsx';"
)

# Insert the widget into the grid
widget_code = """
        {/* Stat Leaders Widget */}
        {league.phase !== 'preseason' && (
          <StatLeadersWidget onPlayerSelect={setSelectedPlayerId} />
        )}
"""

# Place it after the grid
content = content.replace(
    "        {/* News Feed */}\n        <NewsFeed />\n      </div>",
    "        {/* News Feed */}\n        <NewsFeed />\n" + widget_code + "\n      </div>"
)

with open('src/ui/components/LeagueDashboard.jsx', 'w') as f:
    f.write(content)
