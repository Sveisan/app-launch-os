const fs = require('fs');
const file = './public/index.html';
let html = fs.readFileSync(file, 'utf8');

html = html.replace('</style>', `
        .content-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1000; display: flex; flex-direction: column; justify-content: flex-end; pointer-events: none; opacity: 0; transition: opacity 0.4s ease; }
        .content-modal.active { pointer-events: auto; opacity: 1; }
        .content-modal-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); }
        .content-modal-sheet { position: relative; width: 100%; max-width: 800px; margin: 0 auto; height: 90vh; background: #050505; border-top-left-radius: 24px; border-top-right-radius: 24px; border: 1px solid var(--card-border); border-bottom: none; transform: translateY(100%); transition: transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,0.5); }
        .content-modal.active .content-modal-sheet { transform: translateY(0); }
        .content-modal-handle { width: 40px; height: 4px; background: rgba(255,255,255,0.2); border-radius: 4px; margin: 12px auto; }
        .content-modal-close { position: absolute; top: 15px; right: 20px; background: rgba(255,255,255,0.05); border: none; color: white; width: 36px; height: 36px; border-radius: 50%; font-size: 1.5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10; transition: background 0.3s; }
        .content-modal-close:hover { background: rgba(255,255,255,0.15); }
        .content-modal-body { flex: 1; overflow-y: auto; padding: 0 1.5rem 4rem 1.5rem; scroll-behavior: smooth; }
        .content-modal-loader { width: 30px; height: 30px; border: 2px solid rgba(255,255,255,0.1); border-top-color: var(--secondary); border-radius: 50%; animation: spin 1s linear infinite; margin: 4rem auto; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>`);

const replacements = {
  'Wim Hof': 'wim-hof',
  'SEAL': 'navy-seal-tactical-breathing',
  'Sleep': 'sleep-breathing',
  'Calm': 'coherent-breathing',
  'Release': '4-7-8-breathing',
  'Huberman': 'huberman-physiological-sigh',
  'Box': 'box-breathing',
  'Belly': 'diaphragmatic-breathing'
};

for (const [name, slug] of Object.entries(replacements)) {
  html = html.replace(new RegExp(\`<div class="technique-item" style="--glow-color: (#[A-Z0-9]+);">([\\\\s\\\\S]*?)<div class="technique-name">\${name}</div>([\\\\s\\\\S]*?)</div>\\s*</div>\`, 'g'),
   \`<a href="/breathing/\${slug}" class="technique-item" style="--glow-color: $1; text-decoration: none;">$2<div class="technique-name">\${name}</div>$3</div></a>\`);
}

html = html.replace('</footer>', \`</footer>

    <div id="content-modal" class="content-modal">
        <div class="content-modal-overlay"></div>
        <div class="content-modal-sheet">
            <div class="content-modal-handle"></div>
            <button class="content-modal-close">&times;</button>
            <div class="content-modal-body" id="content-modal-body">
                <div class="content-modal-loader"></div>
            </div>
        </div>
    </div>\`);

html = html.replace('</script>', \`
    // 4. Modal Interception
    const modal = document.getElementById('content-modal');
    const modalOverlay = modal.querySelector('.content-modal-overlay');
    const closeBtn = modal.querySelector('.content-modal-close');
    const modalBody = document.getElementById('content-modal-body');
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => { modalBody.innerHTML = '<div class="content-modal-loader"></div>'; }, 400);
    };
    
    closeBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', closeModal);
    
    document.querySelectorAll('a.technique-item').forEach(link => {
        link.addEventListener('click', async (e) => {
            if (window.isDragging) { e.preventDefault(); return; }
            if (e.shiftKey || e.ctrlKey || e.metaKey || e.button !== 0) return;
            e.preventDefault();
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            try {
                const response = await fetch(link.href);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                
                const content = doc.querySelector('main') || doc.querySelector('article') || doc.querySelector('.content-container') || doc.body;
                if (content) {
                    modalBody.innerHTML = content.innerHTML;
                    modalBody.scrollTop = 0;
                } else {
                    window.location.href = link.href;
                }
            } catch (err) {
                window.location.href = link.href;
            }
        });
    });
    </script>\`);

html = html.replace("viewer.addEventListener('mousemove', e => {\\n        if (!isDown) return;\\n        e.preventDefault();", 
\`viewer.addEventListener('mousemove', e => {
        if (!isDown) return;
        e.preventDefault();
        window.isDragging = true;\`);
html = html.replace("viewer.addEventListener('mousedown', e => {", \`window.isDragging = false;
    viewer.addEventListener('mousedown', e => {\`);

html = html.replace("viewer.addEventListener('mouseup', () => { isDown = false; viewer.style.cursor = 'grab'; });",
\`viewer.addEventListener('mouseup', () => { 
        isDown = false; 
        viewer.style.cursor = 'grab'; 
        setTimeout(() => window.isDragging = false, 50);
    });\`);

html = html.replace('<a href="/breathing/box-breathing" style="color: var(--secondary); text-decoration: none; margin-left: 0.5rem; border-bottom: 1px dotted var(--secondary);">Read the research &rarr;</a>',
'<a href="/library" style="color: var(--secondary); text-decoration: none; margin-left: 0.5rem; border-bottom: 1px dotted var(--secondary);">Explore the Library &rarr;</a>');

html = html.replace('<a href="/breathing/box-breathing">Research</a>', '<a href="/library">Research Library</a>');

fs.writeFileSync(file, html);
console.log('Done!');
