const esc = str => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function renderLibraryPage(articles) {
  const techniques = articles.filter(a => a.type === 'technique');
  const useCases = articles.filter(a => a.type === 'use-case');
  const faqs = articles.filter(a => a.type === 'faq-cluster');

  const renderSection = (title, items) => {
    if (items.length === 0) return '';
    return `
      <div class="library-section">
        <h2 class="section-title">${esc(title)}</h2>
        <div class="grid">
          ${items.map(item => `
            <a href="/breathing/${esc(item.slug)}" class="card-link">
              <div class="card">
                <h3 class="card-name">${esc(item.title)}</h3>
                <p class="card-desc">${esc(item.meta_description || '')}</p>
                <div class="card-footer">Read research &rarr;</div>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Science Library | Breathe Collection</title>
    <meta name="description" content="Explore the deep physiological science, protocols, and use-cases behind the world's most powerful breathing techniques.">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #000000;
            --primary: #2C7873;
            --secondary: #52AB98;
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
            -webkit-font-smoothing: antialiased;
        }
        nav {
            padding: 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 1200px;
            margin: 0 auto;
        }
        .back-link {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 1.1rem;
            transition: color 0.3s ease;
        }
        .back-link:hover { color: var(--text-main); }
        header {
            text-align: center;
            padding: 6rem 1.5rem 4rem 1.5rem;
            border-bottom: 1px solid var(--card-border);
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            font-size: clamp(2.5rem, 5vw, 4rem);
            font-weight: 300;
            letter-spacing: -0.02em;
            margin-bottom: 1rem;
        }
        .subtitle {
            font-size: 1.2rem;
            color: var(--text-muted);
            font-weight: 300;
        }
        main {
            max-width: 1200px;
            margin: 0 auto;
            padding: 4rem 1.5rem;
        }
        .library-section {
            margin-bottom: 6rem;
        }
        .section-title {
            font-size: 1.8rem;
            font-weight: 300;
            margin-bottom: 2rem;
            color: var(--secondary);
            border-bottom: 1px solid var(--card-border);
            padding-bottom: 1rem;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
        }
        .card-link {
            text-decoration: none;
            color: inherit;
            display: block;
        }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 16px;
            padding: 2rem;
            height: 100%;
            transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease;
        }
        .card-link:hover .card {
            transform: translateY(-4px);
            border-color: rgba(82, 171, 152, 0.4);
            background: rgba(255, 255, 255, 0.05);
        }
        .card-name {
            font-size: 1.3rem;
            font-weight: 500;
            margin-bottom: 0.8rem;
        }
        .card-desc {
            color: var(--text-muted);
            font-size: 0.95rem;
            font-weight: 300;
            margin-bottom: 1.5rem;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }
        .card-footer {
            color: var(--secondary);
            font-size: 0.9rem;
            font-weight: 400;
            opacity: 0.8;
            transition: opacity 0.3s ease;
        }
        .card-link:hover .card-footer {
            opacity: 1;
        }
        footer {
            text-align: center;
            padding: 4rem 1.5rem;
            border-top: 1px solid var(--card-border);
            color: var(--text-muted);
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <nav>
        <a href="/" class="back-link">&larr; Return Home</a>
    </nav>

    <header>
        <h1>The Science Library</h1>
        <p class="subtitle">An encyclopedia of peer-reviewed physiological protocols, targeted use-cases, and advanced breathing mechanics.</p>
    </header>

    <main>
        ${renderSection('Core Techniques', techniques)}
        ${renderSection('Targeted States & Use-cases', useCases)}
        ${renderSection('Physiology & FAQs', faqs)}
    </main>

    <footer>
        <p>&copy; Breathe Collection. Expanding the science of breath.</p>
    </footer>
</body>
</html>`;
}

module.exports = { renderLibraryPage };
