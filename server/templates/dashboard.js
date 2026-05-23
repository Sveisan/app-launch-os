const esc = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

function renderDashboard({ userEmail = '', userRole = 'freelancer' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Dashboard | Breathe Collection</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #050505;
            --bg-soft: #0d0d0d;
            --primary: #2C7873;
            --secondary: #52AB98;
            --accent: #E07B39;
            --error: #d97a5b;
            --text-main: #FFFFFF;
            --text-muted: #888;
            --text-soft: #555;
            --card-border: rgba(255,255,255,0.06);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; }
        body {
            font-family: 'Outfit', sans-serif;
            background: radial-gradient(ellipse at center top, #0a1614 0%, var(--bg) 60%);
            color: var(--text-main);
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .topbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 2rem;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        .brand { letter-spacing: 0.18em; text-transform: uppercase; font-weight: 400; }
        .topbar a { color: var(--text-muted); text-decoration: none; }
        .topbar a:hover { color: var(--secondary); }

        main {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            max-width: 720px;
            margin: 0 auto;
            width: 100%;
        }

        .eyebrow {
            color: var(--secondary);
            text-transform: uppercase;
            letter-spacing: 0.22em;
            font-size: 0.7rem;
            margin-bottom: 1.2rem;
            font-weight: 400;
        }
        h1 {
            font-weight: 200;
            font-size: 2.6rem;
            line-height: 1.15;
            letter-spacing: -0.02em;
            text-align: center;
            margin-bottom: 1rem;
        }
        .lede {
            color: var(--text-muted);
            font-size: 1rem;
            max-width: 540px;
            text-align: center;
            margin-bottom: 2.8rem;
            font-weight: 300;
        }

        .composer {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 0.9rem;
        }
        textarea#concept {
            width: 100%;
            background: rgba(255,255,255,0.02);
            border: 1px solid var(--card-border);
            color: var(--text-main);
            border-radius: 14px;
            padding: 1.2rem 1.4rem;
            font-size: 1rem;
            font-family: inherit;
            resize: none;
            min-height: 140px;
            transition: border-color 200ms ease, background 200ms ease;
        }
        textarea#concept:focus {
            outline: none;
            border-color: rgba(82,171,152,0.4);
            background: rgba(255,255,255,0.03);
        }
        textarea#concept::placeholder {
            color: var(--text-soft);
            font-weight: 300;
        }

        .dropzone {
            border: 1px dashed var(--card-border);
            border-radius: 12px;
            padding: 0.9rem 1.2rem;
            color: var(--text-soft);
            font-size: 0.85rem;
            cursor: pointer;
            transition: border-color 200ms ease, color 200ms ease, background 200ms ease;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }
        .dropzone:hover, .dropzone.dragover {
            border-color: rgba(82,171,152,0.4);
            color: var(--text-muted);
            background: rgba(255,255,255,0.015);
        }
        .dropzone.has-file {
            border-style: solid;
            border-color: rgba(82,171,152,0.35);
            color: var(--secondary);
        }
        .dropzone .clear {
            color: var(--text-soft);
            text-decoration: underline;
            cursor: pointer;
            font-size: 0.75rem;
        }
        .dropzone .clear:hover { color: var(--error); }
        input[type=file] { display: none; }

        .actions {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            gap: 1rem;
        }
        button.primary {
            background: var(--secondary);
            color: #042521;
            border: none;
            padding: 0.7rem 1.6rem;
            border-radius: 999px;
            font-family: inherit;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            letter-spacing: 0.02em;
            transition: background 200ms ease, transform 100ms ease;
        }
        button.primary:hover:not(:disabled) { background: #6bc1ae; }
        button.primary:active:not(:disabled) { transform: scale(0.98); }
        button.primary:disabled { opacity: 0.4; cursor: not-allowed; }
        button.ghost {
            background: transparent;
            color: var(--text-muted);
            border: 1px solid var(--card-border);
            padding: 0.6rem 1.2rem;
            border-radius: 999px;
            font-family: inherit;
            font-size: 0.85rem;
            cursor: pointer;
        }
        button.ghost:hover { color: var(--text-main); border-color: rgba(255,255,255,0.15); }

        .helper {
            color: var(--text-soft);
            font-size: 0.78rem;
        }

        .status-panel {
            width: 100%;
            border: 1px solid var(--card-border);
            border-radius: 14px;
            padding: 1.8rem 1.6rem;
            background: rgba(255,255,255,0.02);
            text-align: center;
        }
        .status-panel.error { border-color: rgba(217,122,91,0.35); }
        .status-line {
            font-size: 1.05rem;
            color: var(--text-main);
            margin-bottom: 0.4rem;
            font-weight: 300;
        }
        .status-sub {
            color: var(--text-soft);
            font-size: 0.82rem;
            margin-bottom: 1rem;
        }
        .spinner {
            width: 28px;
            height: 28px;
            border: 2px solid rgba(82,171,152,0.15);
            border-top-color: var(--secondary);
            border-radius: 50%;
            margin: 0 auto 1rem;
            animation: spin 900ms linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .result video {
            width: 100%;
            max-width: 360px;
            border-radius: 12px;
            background: black;
            margin-bottom: 1.4rem;
        }
        .result .row {
            display: flex;
            gap: 0.8rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        .result a.primary-link {
            background: var(--secondary);
            color: #042521;
            padding: 0.7rem 1.6rem;
            border-radius: 999px;
            text-decoration: none;
            font-size: 0.9rem;
            font-weight: 500;
            display: inline-block;
        }
        .result a.primary-link:hover { background: #6bc1ae; }

        details.instructions {
            margin-top: 3.5rem;
            border-top: 1px solid var(--card-border);
            padding-top: 1.8rem;
            width: 100%;
        }
        details.instructions > summary {
            color: var(--text-muted);
            cursor: pointer;
            font-size: 0.85rem;
            list-style: none;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 400;
        }
        details.instructions > summary::-webkit-details-marker { display: none; }
        details.instructions > summary::before {
            content: '+';
            color: var(--secondary);
            font-size: 1rem;
            line-height: 1;
        }
        details[open].instructions > summary::before { content: '–'; }
        .instructions-body {
            padding-top: 1.4rem;
            color: var(--text-muted);
            font-size: 0.9rem;
            line-height: 1.7;
            font-weight: 300;
        }
        .instructions-body h3 {
            color: var(--text-main);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            font-weight: 500;
            margin-top: 1.4rem;
            margin-bottom: 0.6rem;
        }
        .instructions-body h3:first-child { margin-top: 0; }
        .instructions-body ul { padding-left: 1.2rem; margin-bottom: 0.4rem; }
        .instructions-body li { margin-bottom: 0.3rem; }
        .instructions-body em { color: var(--secondary); font-style: normal; }

        footer {
            text-align: center;
            color: var(--text-soft);
            font-size: 0.72rem;
            padding: 2rem;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        .hidden { display: none !important; }
    </style>
</head>
<body>
    <div class="topbar">
        <span class="brand">Breathe&nbsp;Collection</span>
        <span>${esc(userEmail)} &middot; <a href="/freelancer-onboarding.html" target="_blank">guide</a> &middot; <a href="#" onclick="logout(event)">logout</a></span>
    </div>

    <main>
        <div class="eyebrow">Studio</div>
        <h1>What are we shooting today?</h1>
        <p class="lede">Drop a single idea — a feeling, a moment, a body sensation. Or drop an image. We turn it into a 15-second loop ready for TikTok and Instagram.</p>

        <form class="composer" id="composer" onsubmit="return false;">
            <textarea id="concept" name="brief" placeholder="Next"></textarea>

            <label class="dropzone" id="dropzone" for="imageFile">
                <span id="dropLabel">Drop an image (optional) — uses your photo, skips AI image gen</span>
                <span id="clearImage" class="clear hidden" onclick="event.preventDefault(); clearImage()">remove</span>
            </label>
            <input type="file" id="imageFile" name="image" accept="image/jpeg,image/png,image/webp">

            <div class="actions">
                <span class="helper" id="helper">Cmd / Ctrl + Enter to submit</span>
                <button type="submit" class="primary" id="submitBtn" disabled>Generate</button>
            </div>
        </form>

        <div class="status-panel hidden" id="statusPanel">
            <div class="spinner" id="spinner"></div>
            <div class="status-line" id="statusLine">Starting…</div>
            <div class="status-sub" id="statusSub">Usually 30–60 seconds. Sit tight.</div>
        </div>

        <div class="status-panel result hidden" id="resultPanel">
            <video id="resultVideo" controls playsinline></video>
            <div class="status-line" id="resultLine">Ready</div>
            <div class="status-sub" id="resultSub">Saved to Dropbox · Apps · Breathe Collection Studio · Videos</div>
            <div class="row">
                <a class="primary-link" id="openDropbox" target="_blank">Open in Dropbox</a>
                <button class="ghost" onclick="reset()">Generate another</button>
            </div>
        </div>

        <details class="instructions">
            <summary>How to brief a video</summary>
            <div class="instructions-body">
                <h3>The vibe</h3>
                <p>Inner peacefulness. Nature. Pure. Elegant, subtly majestic — the arc is hippie to animal: gentle then primal. iPhone&nbsp;16&nbsp;Pro grade.</p>

                <h3>Format</h3>
                <ul>
                    <li><em>15-second</em> seamless loop, 9:16, 1080×1920.</li>
                    <li>One image, animated into motion — slow, deep, atmospheric.</li>
                    <li>No baked-in text, no logos, no branding — we add captions in TikTok.</li>
                </ul>

                <h3>What works (guardrails)</h3>
                <ul>
                    <li>Humans only forward — <em>never</em> boomerang a person mid-breath.</li>
                    <li>Particles or fill carry the rhythm; no metronomic orb.</li>
                    <li>Judge motion with MediaPipe, not Gemini.</li>
                </ul>

                <h3>Writing your brief</h3>
                <ul>
                    <li>One sentence is enough. Lead with the feeling.</li>
                    <li>Name the setting in three words. (e.g. "alpine fjord, gold hour".)</li>
                    <li>Name the body. (e.g. "woman, slow exhale, eyes closed".)</li>
                </ul>
            </div>
        </details>
    </main>

    <footer>built quietly &nbsp;·&nbsp; ${esc(userRole)}</footer>

    <script>
        const ta = document.getElementById('concept');
        const btn = document.getElementById('submitBtn');
        const form = document.getElementById('composer');
        const fileInput = document.getElementById('imageFile');
        const dropzone = document.getElementById('dropzone');
        const dropLabel = document.getElementById('dropLabel');
        const clearImageBtn = document.getElementById('clearImage');
        const statusPanel = document.getElementById('statusPanel');
        const statusLine = document.getElementById('statusLine');
        const statusSub = document.getElementById('statusSub');
        const spinner = document.getElementById('spinner');
        const resultPanel = document.getElementById('resultPanel');
        const resultVideo = document.getElementById('resultVideo');
        const resultLine = document.getElementById('resultLine');
        const resultSub = document.getElementById('resultSub');
        const openDropbox = document.getElementById('openDropbox');

        function refreshSubmit() {
            const hasBrief = ta.value.trim().length >= 4;
            const hasImage = fileInput.files && fileInput.files.length > 0;
            btn.disabled = !(hasBrief || hasImage);
        }

        ta.addEventListener('input', refreshSubmit);
        ta.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !btn.disabled) {
                e.preventDefault();
                submit();
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) {
                const f = fileInput.files[0];
                dropLabel.textContent = f.name + '  ·  ' + Math.round(f.size / 1024) + ' KB';
                dropzone.classList.add('has-file');
                clearImageBtn.classList.remove('hidden');
            } else {
                clearImage();
            }
            refreshSubmit();
        });

        ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => {
            e.preventDefault(); dropzone.classList.add('dragover');
        }));
        ['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, (e) => {
            e.preventDefault(); dropzone.classList.remove('dragover');
        }));
        dropzone.addEventListener('drop', (e) => {
            const f = e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) {
                const dt = new DataTransfer();
                dt.items.add(f);
                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event('change'));
            }
        });

        function clearImage() {
            fileInput.value = '';
            dropLabel.textContent = 'Drop an image (optional) — uses your photo, skips AI image gen';
            dropzone.classList.remove('has-file');
            clearImageBtn.classList.add('hidden');
            refreshSubmit();
        }
        window.clearImage = clearImage;

        btn.addEventListener('click', submit);
        form.addEventListener('submit', (e) => { e.preventDefault(); if (!btn.disabled) submit(); });

        async function submit() {
            const fd = new FormData();
            fd.append('brief', ta.value.trim());
            if (fileInput.files && fileInput.files[0]) {
                fd.append('image', fileInput.files[0]);
            }

            form.classList.add('hidden');
            statusPanel.classList.remove('hidden');
            statusPanel.classList.remove('error');
            spinner.classList.remove('hidden');
            statusLine.textContent = 'Submitting…';
            statusSub.textContent = ' ';

            try {
                const r = await fetch('/api/video-studio/brief', { method: 'POST', body: fd });
                const j = await r.json();
                if (!r.ok || !j.jobId) {
                    throw new Error(j.error || 'Submit failed');
                }
                poll(j.jobId);
            } catch (err) {
                showError(err.message);
            }
        }

        async function poll(jobId) {
            let tries = 0;
            const tick = async () => {
                tries++;
                try {
                    const r = await fetch('/api/video-studio/status/' + encodeURIComponent(jobId));
                    const j = await r.json();
                    if (j.status === 'completed' && j.result) {
                        showResult(j.result);
                        return;
                    }
                    if (j.status === 'error') {
                        showError(j.error || 'Something went wrong');
                        return;
                    }
                    statusLine.textContent = j.label || 'Working…';
                    statusSub.textContent = 'Usually 30–60 seconds. Sit tight.';
                    setTimeout(tick, 2000);
                } catch (err) {
                    if (tries > 60) {
                        showError('Lost connection to the job. Refresh and check Dropbox.');
                        return;
                    }
                    setTimeout(tick, 3000);
                }
            };
            tick();
        }

        function showResult(result) {
            statusPanel.classList.add('hidden');
            resultPanel.classList.remove('hidden');
            // Dropbox share URLs end with ?dl=0 by default; ?raw=1 makes them stream.
            const rawUrl = result.shareUrl
                ? result.shareUrl.replace('?dl=0', '?raw=1').replace('&dl=0', '&raw=1')
                : result.rawVideoUrl;
            resultVideo.src = rawUrl;
            openDropbox.href = result.shareUrl || rawUrl;
            resultLine.textContent = 'Ready';
            resultSub.textContent = result.dropboxPath
                ? 'Saved to Dropbox · Apps · Breathe Collection Studio' + result.dropboxPath
                : 'Saved to Dropbox';
        }

        function showError(msg) {
            spinner.classList.add('hidden');
            statusPanel.classList.add('error');
            statusLine.textContent = 'Something went wrong';
            statusSub.innerHTML = msg + ' &middot; <a href="#" onclick="reset(); return false;" style="color:var(--secondary)">try again</a>';
        }

        function reset() {
            statusPanel.classList.add('hidden');
            resultPanel.classList.add('hidden');
            form.classList.remove('hidden');
            ta.value = '';
            clearImage();
            refreshSubmit();
            ta.focus();
        }
        window.reset = reset;

        async function logout(e) {
            e.preventDefault();
            await fetch('/mission-control-x89/logout', { method: 'POST' });
            window.location = '/mission-control-x89/login';
        }
    </script>
</body>
</html>`
}

module.exports = { renderDashboard }
