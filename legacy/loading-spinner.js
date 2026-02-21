export function showLoading(message = 'Loading...') {
    let spinner = document.getElementById('global-loading-spinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'global-loading-spinner';
        spinner.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); z-index: 9999;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: white; font-family: sans-serif;
        `;
        spinner.innerHTML = `
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div>
            <p id="loading-text" style="margin-top: 20px; font-size: 1.2rem;"></p>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;
        document.body.appendChild(spinner);
    }

    spinner.querySelector('#loading-text').textContent = message;
    spinner.style.display = 'flex';
}

export function hideLoading() {
    const spinner = document.getElementById('global-loading-spinner');
    if (spinner) {
        spinner.style.display = 'none';
    }
}
