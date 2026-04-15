/**
 * LinkedIn Job Validator — Content Script v2
 * Auto-scrapes LinkedIn job pages. Tracks currentJobId param for SPA nav.
 * Falls back to manual entry banner if scrape health-check fails.
 */

(function () {
  'use strict';

  // ── SELECTOR MAP (versioned — update here when LinkedIn DOM drifts) ──
  const SELECTORS = {
    jobTitle: [
      '.job-details-jobs-unified-top-card__job-title h1',
      'h1.t-24',
      'h1[class*="job-title"]',
      'h1'
    ],
    companyName: [
      '.job-details-jobs-unified-top-card__company-name a',
      'a[class*="company-name"]',
      'a[class*="topcard__org"]',
      '.jobs-unified-top-card__company-name a'
    ],
    description: [
      '.jobs-description-content__text',
      '[class*="description__text"]',
      '#job-details',
      '.jobs-description__content',
      '.jobs-description'
    ],
    salary: [
      '[class*="salary"]',
      '[class*="compensation"]',
      'div[class*="job-insight"] span'
    ],
    verifiedBadge: [
      '[aria-label*="erified"]',
      '[class*="verified"]',
      'svg[aria-label*="Verified"]',
      'li-icon[type="linkedin-bug"]'
    ],
    applyButton: [
      '.jobs-apply-button--top-card',
      '.jobs-apply-button',
      '[class*="apply-button"]'
    ],
    easyApplyBtn: [
      'button[aria-label*="Easy Apply"]',
      'button[class*="easy-apply"]',
      '[data-control-name="jobdetails_topcard_inapply"]'
    ],
    employeeCount: [
      'a[href*="/people/"] span',
      '[class*="num-of-employees"]',
      '[class*="company-size"]',
      '[class*="employees"]'
    ],
    companyWebsite: [
      'a[data-tracking-control-name*="website"]',
      'a[href*="company-website"]',
      '[class*="company-website"] a'
    ]
  };

  // ── HELPERS ──
  function trySelect(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (_) {}
    }
    return null;
  }

  function trySelectText(selectors) {
    const el = trySelect(selectors);
    return el?.innerText?.trim() || el?.textContent?.trim() || '';
  }

  // ── SCRAPE HEALTH CHECK ──
  // If title AND description both come back empty, the DOM isn't ready or
  // selectors have drifted. Show the manual fallback banner instead of
  // injecting a zero-scored overlay.
  function scrapeHealthy(data) {
    return data.title.length > 0 && data.description.length > 50;
  }

  // ── EXTRACT JOB DATA ──
  function extractJobData() {
    const companyEl  = trySelect(SELECTORS.companyName);
    const applyBtn   = trySelect(SELECTORS.applyButton);
    const easyApply  = trySelect(SELECTORS.easyApplyBtn);

    // Derive company domain from LinkedIn company slug as a heuristic
    let companyDomain = '';
    if (companyEl?.href) {
      const slug = companyEl.href.match(/\/company\/([^/?#]+)/);
      if (slug) companyDomain = slug[1].replace(/-/g, '') + '.com';
    }

    // Apply URL: prefer href on a-tag apply buttons over button elements
    let applyUrl = '';
    const applyLink = trySelect([
      '.jobs-apply-button--top-card[href]',
      'a[class*="apply-button"][href]'
    ]);
    if (applyLink?.href) {
      applyUrl = applyLink.href;
    } else if (applyBtn?.dataset?.applyUrl) {
      applyUrl = applyBtn.dataset.applyUrl;
    }

    return {
      title:                  trySelectText(SELECTORS.jobTitle),
      company:                companyEl?.textContent?.trim() || '',
      description:            trySelectText(SELECTORS.description),
      salaryDisclosed:        !!trySelect(SELECTORS.salary),
      isVerifiedCompany:      !!trySelect(SELECTORS.verifiedBadge),
      employeeCount:          trySelectText(SELECTORS.employeeCount),
      hasCompanyWebsite:      !!trySelect(SELECTORS.companyWebsite),
      applyUrl,
      companyDomain,
      isEasyApply:            !!easyApply,
      posterConnectionCount:  0,
      hasHiringManagerProfile: false,
    };
  }

  // ── MANUAL FALLBACK BANNER ──
  // Shown when health check fails — guides user to demo page with pre-filled URL
  function injectFallbackBanner() {
    const existing = document.getElementById('ljv-overlay');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'ljv-overlay';
    banner.style.cssText = [
      'position:fixed','bottom:20px','right:20px','z-index:2147483647',
      'background:#f9f8f5','border:1px solid #dcd9d5','border-radius:12px',
      'padding:14px 16px','box-shadow:0 4px 20px rgba(40,37,29,0.12)',
      'font-family:system-ui,sans-serif','font-size:13px','color:#7a7974',
      'max-width:260px','line-height:1.5'
    ].join(';');
    banner.innerHTML = `
      <div style="font-weight:700;color:#28251d;margin-bottom:6px">⚠️ Scrape failed</div>
      <div>LinkedIn's layout may have changed. <a href="https://jsfaulkner86.github.io/linkedin-job-validator/demo/linkedin-job-validator-demo.html" target="_blank" rel="noopener" style="color:#01696f">Open demo</a> to score manually.</div>
      <button onclick="this.closest('#ljv-overlay').remove()" style="margin-top:8px;font-size:11px;color:#bab9b4;background:none;border:none;cursor:pointer;padding:0">Dismiss</button>
    `;
    document.body.appendChild(banner);
  }

  // ── INJECT OVERLAY ──
  function injectOverlay(result) {
    const existing = document.getElementById('ljv-overlay');
    if (existing) existing.remove();

    const { score, grade, signals, fraudFlags } = result;
    const circ = 2 * Math.PI * 18;
    const filled = (score / 100) * circ;

    const fraudHtml = fraudFlags.length
      ? `<div class="ljv-fraud-flags">
          <div class="ljv-fraud-title">\u26a0 ${fraudFlags.length} Risk Flag${fraudFlags.length > 1 ? 's' : ''}</div>
          ${fraudFlags.slice(0, 3).map(f =>
            `<div class="ljv-fraud-item ljv-fraud-${f.severity}">${f.label}</div>`
          ).join('')}
        </div>`
      : '';

    const signalsHtml = signals.map(s =>
      `<div class="ljv-signal ${s.passed ? 'ljv-pass' : 'ljv-fail'}">
        <span class="ljv-signal-icon">${s.passed ? '\u2713' : '\u2717'}</span>
        <span class="ljv-signal-label">${s.label}</span>
        <span class="ljv-signal-pts">${s.earned}/${s.max}</span>
      </div>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'ljv-overlay';
    overlay.setAttribute('role', 'complementary');
    overlay.setAttribute('aria-label', `Job validity score: ${score}/100`);
    overlay.innerHTML = `
      <div class="ljv-header" id="ljv-toggle" role="button" tabindex="0" aria-expanded="false">
        <div class="ljv-score-ring">
          <svg viewBox="0 0 44 44" class="ljv-ring-svg" aria-hidden="true">
            <circle cx="22" cy="22" r="18" class="ljv-ring-bg"/>
            <circle cx="22" cy="22" r="18" class="ljv-ring-fill"
              stroke-dasharray="${filled.toFixed(1)} ${circ.toFixed(1)}"
              stroke="${grade.color}"
              transform="rotate(-90 22 22)"/>
          </svg>
          <span class="ljv-score-num">${score}</span>
        </div>
        <div class="ljv-header-info">
          <div class="ljv-grade-badge" style="color:${grade.color};background:${grade.bg}">${grade.label}</div>
          <div class="ljv-header-sub">Validity \u00b7 ${score}/100</div>
        </div>
        <button class="ljv-expand-btn" aria-label="Toggle details">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="ljv-body" id="ljv-body" hidden>
        ${fraudHtml}
        <div class="ljv-signals-list">${signalsHtml}</div>
        <div class="ljv-footer">Faulkner Group \u00b7 Job Validator v2</div>
      </div>
    `;

    document.body.appendChild(overlay);

    const toggle = overlay.querySelector('#ljv-toggle');
    const body   = overlay.querySelector('#ljv-body');
    const btn    = overlay.querySelector('.ljv-expand-btn');

    function toggleBody() {
      const open = !body.hidden;
      body.hidden = open;
      toggle.setAttribute('aria-expanded', String(!open));
      btn.style.transform = open ? '' : 'rotate(180deg)';
    }

    toggle.addEventListener('click', toggleBody);
    toggle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') toggleBody();
    });
  }

  // ── MAIN RUN ──
  function run() {
    const data = extractJobData();
    if (!scrapeHealthy(data)) {
      injectFallbackBanner();
      return;
    }
    const result = scoreJobPosting(data);
    injectOverlay(result);
    chrome.runtime.sendMessage({ type: 'SCORE_RESULT', result, data }).catch(() => {});
  }

  // ── WAIT FOR DOM READINESS ──
  let attempts = 0;
  const READY_SELECTORS = [
    '.jobs-description-content__text',
    '#job-details',
    '.jobs-description'
  ];

  const readyInterval = setInterval(() => {
    const ready = READY_SELECTORS.some(s => document.querySelector(s));
    if (ready || attempts > 25) {
      clearInterval(readyInterval);
      if (ready) run();
    }
    attempts++;
  }, 400);

  // ── SPA NAVIGATION OBSERVER ──
  // LinkedIn is a React SPA. Track currentJobId param — fires on every
  // job list click without a full page reload.
  let lastJobId = new URLSearchParams(location.search).get('currentJobId') || location.pathname;

  const spaObserver = new MutationObserver(() => {
    const currentJobId =
      new URLSearchParams(location.search).get('currentJobId') ||
      new URLSearchParams(location.search).get('jobId') ||
      location.pathname;

    if (currentJobId !== lastJobId) {
      lastJobId = currentJobId;
      // Wait for the new job's DOM to settle before scraping
      let waitAttempts = 0;
      const waitInterval = setInterval(() => {
        const ready = READY_SELECTORS.some(s => document.querySelector(s));
        if (ready || waitAttempts > 20) {
          clearInterval(waitInterval);
          if (ready) run();
        }
        waitAttempts++;
      }, 300);
    }
  });

  spaObserver.observe(document.body, { childList: true, subtree: true });

})();
