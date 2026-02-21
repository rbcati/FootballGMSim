// data-visualization.js - Enhanced Data Visualization with Charts
// Better than competitors - Visual charts and graphs for stats

(function() {
  'use strict';

  /**
   * Creates a simple bar chart using CSS
   * @param {Array} data - Array of {label, value, color} objects
   * @param {Object} options - Chart options
   * @returns {string} HTML for chart
   */
  window.createBarChart = function(data, options = {}) {
    if (!data || data.length === 0) return '<p>No data available</p>';

    const maxValue = Math.max(...data.map(d => d.value || 0), 1);
    const height = options.height || 200;
    const showValues = options.showValues !== false;

    let html = `
      <div class="bar-chart" style="width: 100%; height: ${height}px; display: flex; align-items: flex-end; justify-content: space-around; gap: 5px; padding: 10px; background: var(--surface); border-radius: 8px; border: 1px solid var(--hairline);">
    `;

    data.forEach((item, index) => {
      const barHeight = ((item.value || 0) / maxValue) * (height - 40);
      const color = item.color || 'var(--accent)';
      
      html += `
        <div style="
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          height: 100%;
          justify-content: flex-end;
        ">
          <div style="
            width: 100%;
            background: ${color};
            border-radius: 4px 4px 0 0;
            height: ${barHeight}px;
            min-height: ${barHeight > 0 ? '4px' : '0'};
            transition: all 0.3s;
            position: relative;
          " title="${item.label}: ${item.value}">
            ${showValues && barHeight > 20 ? `
              <div style="
                position: absolute;
                top: -20px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 11px;
                color: var(--text);
                white-space: nowrap;
                font-weight: 600;
              ">${item.value}</div>
            ` : ''}
          </div>
          <div style="
            margin-top: 5px;
            font-size: 11px;
            color: var(--text-muted);
            text-align: center;
            writing-mode: horizontal-tb;
            transform: rotate(0deg);
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
          ">${item.label}</div>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  };

  /**
   * Creates a line chart for trends over time
   * @param {Array} data - Array of {label, value} objects
   * @param {Object} options - Chart options
   * @returns {string} HTML for chart
   */
  window.createLineChart = function(data, options = {}) {
    if (!data || data.length === 0) return '<p>No data available</p>';

    const maxValue = Math.max(...data.map(d => d.value || 0), 1);
    const minValue = Math.min(...data.map(d => d.value || 0), 0);
    const range = maxValue - minValue || 1;
    const height = options.height || 200;
    const width = options.width || 600;
    const color = options.color || 'var(--accent)';

    // Create SVG for line chart
    let html = `
      <div class="line-chart" style="width: 100%; max-width: ${width}px; height: ${height}px; padding: 20px; background: var(--surface); border-radius: 8px; border: 1px solid var(--hairline);">
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
    `;

    // Draw grid lines
    for (let i = 0; i <= 4; i++) {
      const y = 20 + (i * (height - 40) / 4);
      const value = maxValue - (i * range / 4);
      html += `
        <line x1="40" y1="${y}" x2="${width - 20}" y2="${y}" stroke="var(--hairline)" stroke-width="1" />
        <text x="35" y="${y + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${value.toFixed(0)}</text>
      `;
    }

    // Draw data points and line
    const points = [];
    data.forEach((item, index) => {
      const x = 40 + (index * (width - 60) / (data.length - 1 || 1));
      const y = 20 + ((maxValue - (item.value || 0)) / range) * (height - 40);
      points.push({ x, y, label: item.label, value: item.value });
    });

    // Draw line
    if (points.length > 1) {
      let path = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x} ${points[i].y}`;
      }
      html += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" />`;
    }

    // Draw points
    points.forEach(point => {
      html += `
        <circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}" />
        <text x="${point.x}" y="${point.y - 8}" fill="var(--text)" font-size="10" text-anchor="middle">${point.value}</text>
      `;
    });

    // Draw labels
    points.forEach((point, index) => {
      if (index % Math.ceil(data.length / 6) === 0 || index === data.length - 1) {
        html += `
          <text x="${point.x}" y="${height - 5}" fill="var(--text-muted)" font-size="10" text-anchor="middle">${point.label}</text>
        `;
      }
    });

    html += `
        </svg>
      </div>
    `;

    return html;
  };

  /**
   * Creates a pie/donut chart
   * @param {Array} data - Array of {label, value, color} objects
   * @param {Object} options - Chart options
   * @returns {string} HTML for chart
   */
  window.createPieChart = function(data, options = {}) {
    if (!data || data.length === 0) return '<p>No data available</p>';

    const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
    if (total === 0) return '<p>No data available</p>';

    const size = options.size || 200;
    const radius = size / 2 - 10;
    const center = size / 2;

    let html = `
      <div class="pie-chart" style="width: ${size}px; height: ${size}px; position: relative; margin: 20px auto;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    `;

    let currentAngle = -90; // Start at top
    const colors = ['var(--accent)', '#4CAF50', '#FFC107', '#FF9800', '#2196F3', '#9C27B0', '#F44336'];

    data.forEach((item, index) => {
      const value = item.value || 0;
      const percentage = (value / total) * 100;
      const angle = (percentage / 100) * 360;
      
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      
      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);
      
      const largeArc = angle > 180 ? 1 : 0;
      
      const color = item.color || colors[index % colors.length];
      
      html += `
        <path d="M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" 
              fill="${color}" 
              stroke="var(--background)" 
              stroke-width="2"
              title="${item.label}: ${percentage.toFixed(1)}%">
        </path>
      `;
      
      currentAngle += angle;
    });

    html += `
        </svg>
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          background: var(--surface);
          border-radius: 50%;
          width: ${size * 0.4}px;
          height: ${size * 0.4}px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 600;
          color: var(--text);
        ">${total.toFixed(0)}</div>
      </div>
      <div class="pie-legend" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 15px;">
    `;

    data.forEach((item, index) => {
      const percentage = ((item.value || 0) / total) * 100;
      const color = item.color || colors[index % colors.length];
      html += `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 13px;">
          <div style="width: 16px; height: 16px; background: ${color}; border-radius: 3px;"></div>
          <span style="color: var(--text);">${item.label}</span>
          <span style="color: var(--text-muted); margin-left: auto;">${percentage.toFixed(1)}%</span>
        </div>
      `;
    });

    html += `</div>`;
    return html;
  };

  /**
   * Renders player stat trends chart
   */
  window.renderPlayerStatChart = function(playerId, statName) {
    const L = window.state?.league;
    if (!L) return '';

    // Find player
    let player = null;
    for (const team of L.teams || []) {
      if (team.roster) {
        player = team.roster.find(p => p.id === playerId);
        if (player) break;
      }
    }

    if (!player || !player.stats) return '';

    const seasonStats = player.stats.season || {};
    const data = [];

    // Get stat values across seasons
    Object.keys(seasonStats).sort().forEach(year => {
      const value = seasonStats[year]?.[statName] || 0;
      if (value > 0) {
        data.push({ label: year.toString(), value: value });
      }
    });

    if (data.length === 0) return '<p>No data available</p>';

    return window.createLineChart(data, {
      height: 200,
      color: 'var(--accent)'
    });
  };

  /**
   * Renders team stat comparison chart
   */
  window.renderTeamStatComparison = function(statName) {
    const L = window.state?.league;
    if (!L || !L.teams) return '';

    const data = L.teams
      .map(team => ({
        label: team.abbr || team.name,
        value: team.stats?.[statName] || 0,
        color: team.teamId === window.state?.userTeamId ? 'var(--accent)' : 'var(--text-muted)'
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10

    return window.createBarChart(data, { height: 250, showValues: true });
  };

  console.log('✅ Data Visualization System loaded');

})();
