const axios = require('axios');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.PERSONAL_TOKEN;

const USERNAME = 'Akhilesh2220';

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN not set in .env');
  process.exit(1);
}

const colors = [
  '#005f73', '#0a9396', '#94d2bd', '#e9d8a6', '#ee9b00',
  '#ca6702', '#bb3e03', '#ae2012', '#9b2226',
  '#031d44', '#04395e', '#70a288', '#dab785', '#d5896f'
];

async function fetchAllRepos(username) {
  let page = 1;
  let repos = [];
  while (true) {
    const res = await axios.get(`https://api.github.com/users/${username}/repos`, {
      params: { per_page: 100, page },
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
    });
    repos = repos.concat(res.data);
    if (res.data.length < 100) break;
    page++;
  }
  return repos;
}

async function fetchLanguages(owner, repo) {
  const res = await axios.get(`https://api.github.com/repos/${owner}/${repo}/languages`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
  });
  return res.data;
}

function generateDonutSVG(languages) {
  const totalBytes = languages.reduce((sum, lang) => sum + lang.bytes, 0);
  const data = languages.map(lang => ({
    ...lang,
    percentage: lang.bytes / totalBytes
  }));

  // Original dimensions
  const originalSize = 400;
  const originalLegendWidth = 200;

  // Scale factor
  const scale = 0.75;

  // Scaled dimensions
  const size = originalSize * scale;           // 300
  const legendWidth = originalLegendWidth * scale;  // 150

  const radius = size / 2 - 40 * scale;  // Adjust the 40 for padding accordingly
  const center = size / 2;
  const donutWidth = 80 * scale;

  const spacing = 0.01;

  let cumulativePercent = 0;
  const paths = [];

  function polarToCartesian(cx, cy, r, angle) {
    const rad = (angle - 90) * Math.PI / 180.0;
    return {
      x: cx + (r * Math.cos(rad)),
      y: cy + (r * Math.sin(rad))
    };
  }

  data.forEach((lang, i) => {
    const startPercent = cumulativePercent + spacing;
    const endPercent = cumulativePercent + lang.percentage;

    if (lang.percentage <= 0) {
      cumulativePercent += lang.percentage;
      return;
    }

    const startAngle = startPercent * 360;
    const endAngle = endPercent * 360;

    const startOuter = polarToCartesian(center, center, radius, endAngle);
    const endOuter = polarToCartesian(center, center, radius, startAngle);
    const startInner = polarToCartesian(center, center, radius - donutWidth, endAngle);
    const endInner = polarToCartesian(center, center, radius - donutWidth, startAngle);

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    const pathData = [
      `M ${startOuter.x} ${startOuter.y}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
      `L ${endInner.x} ${endInner.y}`,
      `A ${radius - donutWidth} ${radius - donutWidth} 0 ${largeArcFlag} 1 ${startInner.x} ${startInner.y}`,
      'Z'
    ].join(' ');

    paths.push(`<path d="${pathData}" fill="${colors[i % colors.length]}" />`);

    cumulativePercent = endPercent;
  });

  // Legend vertical centering calculations
  const legendItemHeight = 30 * scale; // scale height too
  const legendHeight = data.length * legendItemHeight;
  const legendOffsetY = (size - legendHeight) / 2;

  const legendItems = data.map((lang, i) => {
    const y = legendOffsetY + 20 * scale + i * legendItemHeight;
    const color = colors[i % colors.length];
    const percentText = (lang.percentage * 100).toFixed(1) + '%';
    return `
      <circle cx="${10 * scale}" cy="${y - 5 * scale}" r="${8 * scale}" fill="${color}" />
      <text x="${30 * scale}" y="${y}" font-family="sans-serif" font-size="${16 * scale}" fill="#333" dominant-baseline="middle">
        ${lang.language} — ${percentText}
      </text>
    `;
  }).join('\n');

  return `
<svg width="${size + legendWidth}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub language stats donut chart">
  <title>GitHub Language Stats Donut Chart for ${USERNAME}</title>
  <g transform="translate(0,0)">
    ${paths.join('\n')}
    <circle cx="${center}" cy="${center}" r="${radius - donutWidth}" fill="#0E1117" />
  </g>
  <g transform="translate(${size + 20 * scale}, 0)">
    ${legendItems}
  </g>
</svg>
`;
}


async function main() {
  try {
    console.log('Fetching repos...');
    const repos = await fetchAllRepos(USERNAME);

    console.log(`Fetched ${repos.length} repos. Fetching languages...`);
    const languageTotals = {};

    // Fetch languages in parallel with a limit
    const concurrency = 5;
    let index = 0;

    async function fetchBatch() {
      while (index < repos.length) {
        const batch = repos.slice(index, index + concurrency);
        index += concurrency;
        const results = await Promise.all(batch.map(repo => fetchLanguages(USERNAME, repo.name).catch(() => ({}))));
        results.forEach(langs => {
          Object.entries(langs).forEach(([lang, bytes]) => {
            languageTotals[lang] = (languageTotals[lang] || 0) + bytes;
          });
        });
      }
    }
    await fetchBatch();

    // Prepare data array
    const languages = Object.entries(languageTotals)
      .map(([language, bytes]) => ({ language, bytes }))
      .filter(l => l.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes);

    if (languages.length === 0) {
      console.log('No language data found.');
      return;
    }

    console.log('Generating SVG...');
    const svg = generateDonutSVG(languages);

    const outPath = path.join(__dirname, 'language-stats.svg');
    fs.writeFileSync(outPath, svg);
    console.log(`SVG saved to ${outPath}`);

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();

