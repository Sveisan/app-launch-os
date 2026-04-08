const esc = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function getBaseHead(title, metaTitle, metaDescription, canonicalUrl, schemaJson) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(metaTitle)}</title>
    <meta name="description" content="${esc(metaDescription)}">
    <link rel="canonical" href="${canonicalUrl}">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
    <script type="application/ld+json">
      ${JSON.stringify(schemaJson)}
    </script>
    <style>
        :root {
            --bg: #000000;
            --primary: #2C7873;
            --secondary: #52AB98;
            --accent: #E07B39;
            --text-main: #FFFFFF;
            --text-muted: #A0A0A0;
            --card-bg: rgba(255, 255, 255, 0.03);
            --card-border: rgba(255, 255, 255, 0.08);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg);
            color: var(--text-main);
            line-height: 1.6;
            letter-spacing: 0.02em;
            -webkit-font-smoothing: antialiased;
        }
        section { padding: 4rem 1.5rem; max-width: 900px; margin: 0 auto; }
        .hero {
            display: flex; flex-direction: column; align-items: center;
            text-align: center; justify-content: center;
            position: relative; overflow: hidden; padding-top: 8rem; padding-bottom: 2rem;
            max-width: 900px; margin: 0 auto;
        }
        h1 { font-size: clamp(2.5rem,6vw,4.5rem); font-weight: 300; letter-spacing: -0.02em; margin-bottom: 1.5rem; line-height: 1.1; }
        .tagline { font-size: clamp(1rem,1.5vw,1.2rem); color: var(--secondary); margin: 0 auto 1.5rem auto; font-weight: 400; text-transform: uppercase; letter-spacing: 0.1em; }
        .intro-text { font-size: 1.2rem; color: var(--text-muted); font-weight: 300; margin-bottom: 2rem; max-width: 700px; }
        
        .sticky-nav {
            position: sticky; top: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px);
            border-bottom: 1px solid var(--card-border); z-index: 100;
            display: flex; justify-content: center; gap: 2rem; padding: 1rem; flex-wrap: wrap;
        }
        .sticky-nav a { color: var(--text-muted); text-decoration: none; transition: color 0.3s ease; }
        .sticky-nav a:hover { color: var(--text-main); }
        
        h2 { font-size: 2rem; font-weight: 300; margin-bottom: 2rem; margin-top: 2rem; }
        h3 { font-size: 1.3rem; font-weight: 400; margin-bottom: 1rem; color: var(--text-main); }
        p { color: var(--text-muted); font-weight: 300; margin-bottom: 1.5rem; }
        
        .steps { list-style: none; counter-reset: my-awesome-counter; margin-bottom: 2rem; }
        .steps li {
            counter-increment: my-awesome-counter; margin-bottom: 1.5rem;
            position: relative; padding-left: 3.5rem; color: var(--text-muted); font-weight: 300;
        }
        .steps li::before {
            content: counter(my-awesome-counter); position: absolute; left: 0; top: -2px;
            width: 32px; height: 32px; border-radius: 50%; background: rgba(82,171,152,0.1);
            color: var(--secondary); display: flex; align-items: center; justify-content: center;
            font-size: 0.9rem; font-weight: 500; border: 1px solid rgba(82,171,152,0.3);
        }
        
        .card {
            background: var(--card-bg); border: 1px solid var(--card-border);
            border-radius: 16px; padding: 2rem; text-align: left; margin-bottom: 1.5rem;
            transition: transform 0.3s ease, border-color 0.3s ease;
        }
        .card:hover { border-color: rgba(82,171,152,0.3); transform: translateY(-3px); }
        .card-title { color: var(--text-main); font-weight: 400; margin-bottom: 0.5rem; font-size: 1.1rem; }
        .card-authors { color: var(--secondary); font-size: 0.9rem; margin-bottom: 1rem; }
        .card-finding { color: var(--text-muted); font-weight: 300; margin-bottom: 1.5rem; }
        .card-link { color: var(--secondary); text-decoration: none; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 0.5rem; }
        .card-link:hover { text-decoration: underline; }
        
        .faq-item { border-bottom: 1px solid var(--card-border); padding: 1.5rem 0; cursor: pointer; }
        .faq-q { color: var(--text-main); font-weight: 400; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0;}
        .faq-a { color: var(--text-muted); font-weight: 300; margin-top: 1rem; display: none; }
        .faq-item.active .faq-a { display: block; }
        .faq-icon { color: var(--secondary); font-size: 1.5rem; transition: transform 0.3s ease; font-weight: 300; }
        .faq-item.active .faq-icon { transform: rotate(45deg); }
        
        .tag-list { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; }
        .tag { background: rgba(255,255,255,0.05); border: 1px solid var(--card-border); padding: 0.5rem 1rem; border-radius: 100px; color: var(--text-muted); font-weight: 300; font-size: 0.9rem; }
        
        .btn-primary {
            display: inline-flex; align-items: center; justify-content: center;
            background-color: var(--text-main); color: var(--bg);
            padding: 1rem 2.5rem; border-radius: 100px; text-decoration: none;
            font-weight: 500; font-size: 1.1rem; transition: all 0.3s ease;
            border: none; cursor: pointer;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(255,255,255,0.1); }
        
        .cta-section { text-align: center; max-width: 600px; padding: 8rem 1.5rem; margin: 0 auto; border-top: 1px solid var(--card-border); }
        .waitlist-form { display: flex; gap: 1rem; margin-top: 2rem; justify-content: center; }
        .waitlist-form input {
            padding: 1rem 1.5rem; border-radius: 100px; border: 1px solid var(--card-border);
            background: rgba(255,255,255,0.05); color: white; font-family: inherit;
            width: 100%; max-width: 300px; outline: none; transition: border-color 0.3s ease;
        }
        .waitlist-form input:focus { border-color: var(--secondary); }
        
        @media (max-width: 768px) {
            .waitlist-form { flex-direction: column; align-items: center; }
            .waitlist-form input, .waitlist-form button { width: 100%; max-width: 100%; }
        }
        
        footer { text-align: center; padding: 4rem 1.5rem; border-top: 1px solid var(--card-border); color: var(--text-muted); font-size: 0.9rem; }
        footer a { color: var(--secondary); text-decoration: none; margin: 0 1rem; transition: color 0.3s ease; }
        footer a:hover { color: var(--text-main); }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
        * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
    </style>
</head>
<body>
`;
}

function getFooter() {
  return `
    <section class="cta-section">
        <h2 style="margin-top:0;">Android coming soon</h2>
        <p class="intro-text" style="font-size:1.1rem; margin:0 auto;">Join the waitlist to be notified.</p>
        <form class="waitlist-form" id="waitlist-form">
            <input type="email" name="email" placeholder="Your email address" required>
            <button type="submit" class="btn-primary" style="padding: 1rem 1.5rem;">Join Waitlist</button>
        </form>
        <p id="waitlist-msg" style="margin-top:1rem; color: var(--secondary); display:none;"></p>
    </section>

    <footer>
        <div class="footer-links">
            <a href="/">Home</a>
            <a href="/breathing/box-breathing">Research</a>
            <a href="/breathe/support">Support</a>
            <a href="/breathe/feedback">Feedback</a>
        </div>
        <p>&copy; Breathe Collection. All rights reserved.</p>
    </footer>

    <script>
    document.getElementById('waitlist-form')?.addEventListener('submit', async function(e) {
        e.preventDefault()
        const email = this.querySelector('input[type=email]').value
        const msg = document.getElementById('waitlist-msg')
        try {
            const res = await fetch('/api/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            })
            msg.style.display = 'block'
            msg.textContent = res.ok ? "You're on the list." : "Something went wrong. Try again."
            msg.style.color = res.ok ? 'var(--secondary)' : 'var(--accent)'
            if (res.ok) this.reset()
        } catch {
            msg.style.display = 'block'
            msg.textContent = "Something went wrong. Try again."
            msg.style.color = 'var(--accent)'
        }
    })
    
    document.querySelectorAll('.faq-item').forEach(item => {
        item.addEventListener('click', () => {
            item.classList.toggle('active');
        });
    });
    </script>
</body>
</html>
`;
}

function renderTechniquePage(row) {
    const data = row.content_json || {};
    const baseUrl = process.env.BASE_URL || "https://breathe-collection.com";
    const canonical = `${baseUrl}/breathing/${esc(row.slug)}`;
    
    let html = getBaseHead(row.title, row.meta_title, row.meta_description, canonical, row.schema_json);
    
    html += `
    <header class="hero">
        <div class="tagline">Technique</div>
        <h1>${esc(row.title)}</h1>
        <p class="intro-text">${esc(data.intro)}</p>
        ${data.appreciation_note ? `<p style="font-size: 0.9rem; color: var(--secondary); font-style: italic; max-width: 600px; margin-top: -1rem; margin-bottom: 2rem; opacity: 0.8;">${esc(data.appreciation_note)}</p>` : ''}
    </header>
    
    <div class="sticky-nav">
        ${data.how_to ? '<a href="#how-to">How to do it</a>' : ''}
        ${data.research && data.research.length ? '<a href="#research">The Research</a>' : ''}
        ${data.use_cases && data.use_cases.length ? '<a href="#when-to-use">When to use it</a>' : ''}
        ${data.faqs && data.faqs.length ? '<a href="#faqs">FAQs</a>' : ''}
    </div>
    
    ${data.how_to ? `
    <section id="how-to">
        <h2>How to do it</h2>
        <p><strong>Pattern:</strong> ${esc(data.how_to.pattern)}</p>
        ${data.how_to.duration_minutes ? `<p><strong>Duration:</strong> ${esc(data.how_to.duration_minutes)} minutes</p>` : ''}
        
        <ol class="steps">
            ${data.how_to.steps ? data.how_to.steps.map(step => `<li>${esc(step)}</li>`).join('') : ''}
        </ol>
        
        ${data.how_to.tips && data.how_to.tips.length ? `
        <h3>Pro Tips</h3>
        <ul>
            ${data.how_to.tips.map(tip => `<li style="margin-bottom: 0.5rem; color: var(--text-muted); font-weight: 300;">${esc(tip)}</li>`).join('')}
        </ul>
        ` : ''}
    </section>
    ` : ''}
    `;
    
    if (data.research && data.research.length > 0) {
        html += `
    <section id="research">
        <h2>The Research</h2>
        ${data.research.map(study => `
        <div class="card">
            <h3 class="card-title">${esc(study.title)}</h3>
            <p class="card-authors">${esc(study.authors)} • ${esc(study.journal)} (${esc(study.year)})</p>
            <p class="card-finding">${esc(study.finding)}</p>
            ${study.url ? `<a href="${esc(study.url)}" target="_blank" class="card-link" rel="nofollow noopener">Read on PubMed &rarr;</a>` : ''}
        </div>
        `).join('')}
    </section>
        `;
    }
    
    if (data.use_cases && data.use_cases.length > 0) {
        html += `
    <section id="when-to-use">
        <h2>When to use it</h2>
        <div class="tag-list">
            ${data.use_cases.map(uc => `<span class="tag">${esc(uc)}</span>`).join('')}
        </div>
    </section>
        `;
    }
    
    if (data.faqs && data.faqs.length > 0) {
        html += `
    <section id="faqs">
        <h2>FAQs</h2>
        ${data.faqs.map(faq => `
        <div class="faq-item">
            <div class="faq-q">${esc(faq.q)} <span class="faq-icon">+</span></div>
            <div class="faq-a">${esc(faq.a)}</div>
        </div>
        `).join('')}
    </section>
        `;
    }
    
    // Bottom CTA
    html += getFooter();
    return html;
}

function renderUseCasePage(row) {
    const data = row.content_json || {};
    const baseUrl = process.env.BASE_URL || "https://breathe-collection.com";
    const canonical = `${baseUrl}/breathing/for/${esc(row.slug)}`;
    
    let html = getBaseHead(row.title, row.meta_title, row.meta_description, canonical, row.schema_json);
    
    html += `
    <header class="hero">
        <div class="tagline">${row.type === 'faq-cluster' ? 'FAQ' : 'Breathing for'}</div>
        <h1>${esc(row.title)}</h1>
        <p class="intro-text">${esc(data.intro)}</p>
    </header>
    
    <div class="sticky-nav">
        ${data.mechanism ? '<a href="#mechanism">How it works</a>' : ''}
        ${data.research && data.research.length ? '<a href="#research">The Research</a>' : ''}
        ${data.related_techniques && data.related_techniques.length ? '<a href="#techniques">Techniques</a>' : ''}
        ${data.faqs && data.faqs.length ? '<a href="#faqs">FAQs</a>' : ''}
    </div>
    
    ${data.mechanism ? `
    <section id="mechanism">
        <h2>How it works</h2><p>${esc(data.mechanism)}</p>
    </section>
    ` : ''}

    ${data.research && data.research.length ? `
    <section id="research">
        <h2>The Research</h2>
        ${data.research.map(study => `
        <div class="card">
            <h3 class="card-title">${esc(study.title)}</h3>
            <p class="card-authors">${esc(study.authors)} • ${esc(study.journal)} (${esc(study.year)})</p>
            <p class="card-finding">${esc(study.finding)}</p>
            ${study.url ? `<a href="${esc(study.url)}" target="_blank" class="card-link" rel="nofollow noopener">Read on PubMed &rarr;</a>` : ''}
        </div>
        `).join('')}
    </section>
    ` : ''}
    `;
    
    if (data.related_techniques && data.related_techniques.length > 0) {
        html += `
    <section id="techniques">
        <h2>Best Techniques</h2>
        <div class="tag-list">
            ${data.related_techniques.map(slug => `
            <a href="/breathing/${esc(slug)}" style="text-decoration:none;"><span class="tag">#${esc(slug).replace(/-/g, ' ')}</span></a>
            `).join('')}
        </div>
    </section>
        `;
    }
    
    if (data.faqs && data.faqs.length > 0) {
        html += `
    <section id="faqs">
        <h2>FAQs</h2>
        ${data.faqs.map(faq => `
        <div class="faq-item">
            <div class="faq-q">${esc(faq.q)} <span class="faq-icon">+</span></div>
            <div class="faq-a">${esc(faq.a)}</div>
        </div>
        `).join('')}
    </section>
        `;
    }
    
    html += getFooter();
    return html;
}

module.exports = {
    renderTechniquePage,
    renderUseCasePage
};
