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
        .field {
            position: relative;
            width: 100%;
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
        button.primary:hover { background: #6bc1ae; }
        button.primary:active { transform: scale(0.98); }
        button.primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .helper {
            color: var(--text-soft);
            font-size: 0.78rem;
        }

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
    </style>
</head>
<body>
    <div class="topbar">
        <span class="brand">Breathe&nbsp;Collection</span>
        <span>${esc(userEmail)} &middot; <a href="#" onclick="logout(event)">logout</a></span>
    </div>

    <main>
        <div class="eyebrow">Studio</div>
        <h1>What are we shooting today?</h1>
        <p class="lede">Drop a single idea — a feeling, a moment, a body sensation. We turn it into a 15-second loop ready for TikTok and Instagram.</p>

        <form class="composer" onsubmit="return false;">
            <div class="field">
                <textarea id="concept" placeholder="Next" autofocus></textarea>
            </div>
            <div class="actions">
                <span class="helper">Cmd / Ctrl + Enter to submit</span>
                <button type="submit" class="primary" id="submitBtn" disabled>Generate</button>
            </div>
        </form>

        <details class="instructions">
            <summary>How to brief a video</summary>
            <div class="instructions-body">
                <h3>The vibe</h3>
                <p>Inner peacefulness. Nature. Pure. Elegant, subtly majestic — the arc is hippie to animal: gentle then primal. iPhone&nbsp;16&nbsp;Pro grade.</p>

                <h3>Format</h3>
                <ul>
                    <li><em>15-second</em> seamless loop, 9:16, 1080×1920.</li>
                    <li>Three image beats per video, cross-faded forward only.</li>
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
        ta.addEventListener('input', () => {
            btn.disabled = ta.value.trim().length < 4;
        });
        ta.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !btn.disabled) {
                e.preventDefault();
                submit();
            }
        });
        btn.addEventListener('click', submit);

        function submit() {
            // Wired up in next iteration — for now this just acknowledges.
            btn.disabled = true;
            btn.textContent = 'Coming next…';
        }

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
