// news-viewer.js

export function renderNews() {
    console.log('Rendering Newsroom...');
    const newsContainer = document.getElementById('news');
    if (!newsContainer) {
        // Fallback: try to create it if it doesn't exist
        const content = document.querySelector('.content');
        if (content) {
            const section = document.createElement('section');
            section.id = 'news';
            section.className = 'view';
            section.hidden = true;
            content.appendChild(section);
            // Recursive call to render now that it exists
            return renderNews();
        }
        return;
    }

    const engine = window.newsEngine;
    if (!engine) {
        newsContainer.innerHTML = '<div class="card"><p>News Engine loading...</p></div>';
        return;
    }

    const stories = engine.stories;

    if (!stories || stories.length === 0) {
        newsContainer.innerHTML = `
            <div class="card">
                <h2>The Newsroom</h2>
                <div class="muted">No news stories available yet. Simulate some games to see headlines!</div>
            </div>
        `;
        return;
    }

    const storiesHtml = stories.map(story => `
        <div class="card mt" style="border-left: 4px solid var(--accent);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="tag" style="background: var(--surface-secondary); color: var(--text-muted); font-size: 0.8rem;">${story.category}</span>
                <span class="muted" style="font-size: 0.8rem;">Week ${story.week}, ${story.year}</span>
            </div>
            <h3 style="margin: 0 0 10px 0;">${story.headline}</h3>
            <p style="margin: 0; line-height: 1.5;">${story.body}</p>
        </div>
    `).join('');

    newsContainer.innerHTML = `
        <div class="card" style="margin-bottom: 20px;">
            <h2 style="margin: 0;">The Newsroom</h2>
            <p class="muted" style="margin: 5px 0 0 0;">Latest headlines from around the league</p>
        </div>
        <div class="news-feed">
            ${storiesHtml}
        </div>
    `;
}

// Global Export
if (typeof window !== 'undefined') {
    window.renderNews = renderNews;
}
