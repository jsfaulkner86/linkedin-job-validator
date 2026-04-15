/**
 * LinkedIn Job Validator — Content Script v3
 * Supports both /jobs/search/ (list+detail panel) and /jobs/view/ (full page)
 * Includes console debug logging for troubleshooting
 */

(function () {
  'use strict';

  const DEBUG = true;
  function log(...args) { if (DEBUG) console.log('[LJV]', ...args); }

  log('Content script loaded on', location.href);

  // ── SELECTOR MAP ─────────────────────────────────────────────────────────
  const SELECTORS = {
    // Job title
    jobTitle: [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title h1',
      'h1.t-24',
      'h1[class*="job-title"]',
      '.job-view-layout h1',
      'h1'
    ],
    // Company name
    companyName: [
      '.job-details-jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name a',
      'a[class*="company-name"]',
      'a[class*="topcard__org"]',
      '.jobs-details-top-card__company-url'
    ],
    // Job description — the most critical selector
    description: [
      '.jobs-description-content__text',
      '.jobs-description__content .jobs-box__html-content',
      '[class*="description__text"]',
      '#job-details',
      '.jobs-description',
      '.job-view-layout .jobs-description',
      '[class*="jobs-description"]'
    ],
    // Salary
    salary: [
      '[class*="salary"]',
      '[class*="compensation"]',
      'li[class*="job-insight"] span',
      '.job-details-jobs-unified-top-card__job-insight'
    ],
    // Verified badge
    verifiedBadge: [
      '[aria-label*="erified"]',
      '[class*="verified"]',
      'li-icon[type="linkedin-bug"]',
      'svg[aria-label*="Verified"]'
    ],
    // Apply button (link type for URL extraction)
    applyButtonLink: [
      '.jobs-apply-button--top-card[href]',
      'a[class*="apply"][href]'
    ],
    // Easy Apply (button, not link)
    easyApplyBtn: [
      'button[aria-label*="Easy Apply"]',
      'button[class*="easy-apply"]',
      'button[aria-label*="easy apply"]',
      '[data-control-name="jobdetails_topcard_inapply"]'
    ],
    // Employee count
    employeeCount: [
      'a[href*="/people/"] span',
      '[class*="num-of-employees"]',
      '[class*="company-size"]',
      'span[class*="employees"]'
    ],
    // Company website
    companyWebsite: [
      'a[data-tracking-control-name*="website"]',
      'a[href*="company-website"]',
      '[class*="company-website"] a'
    ]
  };

  // ── HELPERS ──────────────────────────────────────────────────────────────
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

  // ── SCRAPE HEALTH CHECK ───────────────────────────────────────────────────
  function scrapeHealthy(data) {
    const ok = data.title.length > 0 && data.description.length > 30;
    if (!ok) log('Health check FAILED — title:', data.title.slice(0,40), '| desc chars:', data.description.length);
    else log('Health check OK — title:', data.title.slice(0,40), '| desc chars:', data.description.length);
    return ok;
  }

  // ── EXTRACT JOB DATA ─────────────────────────────────────────────────────
  function extractJobData() {
    const companyEl  = trySelect(SELECTORS.companyName);
    const applyLink  = trySelect(SELECTORS.applyButtonLink);
    const easyApply  = trySelect(SELECTORS.easyApplyBtn);

    let companyDomain = '';
    if (companyEl?.href) {
      const slug = companyEl.href.match(/\/company\/([^/?#]+)/);
      if (slug) companyDomain = slug[1].replace(/-/g, '') + '.com';
    }

    const data = {
      title:                   trySelectText(SELECTORS.jobTitle),
      company:                 companyEl?.textContent?.trim() || '',
      description:             trySelectText(SELECTORS.description),
      salaryDisclosed:         !!trySelect(SELECTORS.salary),
      isVerifiedCompany:       !!trySelect(SELECTORS.verifiedBadge),
      employeeCount:           trySelectText(SELECTORS.employeeCount),
      hasCompanyWebsite:       !!trySelect(SELECTORS.companyWebsite),
      applyUrl:                applyLink?.href || '',
      companyDomain,
      isEasyApply:             !!easyApply,
      posterConnectionCount:   0,
      hasHiringManagerProfile: false,
    };

    log('Extracted data:', {
      title: data.title.slice(0,40),
      company: data.company.slice(0,30),
      descLen: data.description.length,
      isEasyApply: data.isEasyApply,
      isVerified: data.isVerifiedCompany,
    });

    return data;
  }

  // ── FALLBACK BANNER ───────────────────────────────────────────────────────
  function injectFallbackBanner() {
    removeOverlay();
    const banner = document.createElement('div');
    banner.id = 'ljv-overlay';
    banner.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#f9f8f5;border:1px solid #dcd9d5;border-radius:12px;padding:14px 16px;box-shadow:0 4px 20px rgba(40,37,29,0.12);font-family:system-ui,sans-serif;font-size:13px;color:#7a7974;max-width:260px;line-height:1.5;';
    banner.innerHTML = `
      <div style="font-weight:700;color:#28251d;margin-bottom:6px">⚠️ Auto-scrape failed</div>
      <div style="margin-bottom:8px">LinkedIn's layout may have changed or the job hasn't fully loaded.</div>
      <a href="https://jsfaulkner86.github.io/linkedin-job-validator/demo/linkedin-job-validator-demo.html" target="_blank" rel="noopener" style="color:#01696f;font-weight:600">Score manually in demo →</a>
      <button onclick="this.closest('#ljv-overlay').remove()" style="display:block;margin-top:8px;font-size:11px;color:#bab9b4;background:none;border:none;cursor:pointer;padding:0">Dismiss</button>
    `;
    document.body.appendChild(banner);
  }

  function removeOverlay() {
    document.getElementById('ljv-overlay')?.remove();
  }

  // ── INJECT SCORE OVERLAY ──────────────────────────────────────────────────
  function injectOverlay(result) {
    removeOverlay();
    const { score, grade, signals, fraudFlags } = result;
    const circ = 2 * Math.PI * 18;
    const filled = (score / 100) * circ;

    const fraudHtml = fraudFlags.length
      ? `<div class="ljv-fraud-flags"><div class="ljv-fraud-title">⚠ ${fraudFlags.length} Risk Flag${fraudFlags.length > 1 ? 's' : ''}</div>${fraudFlags.slice(0, 3).map(f => `<div class="ljv-fraud-item ljv-fraud-${f.severity}">${f.label}</div>`).join('')}</div>`
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
          <div class="ljv-header-sub">Validity &middot; ${score}/100</div>
        </div>
        <button class="ljv-expand-btn" aria-label="Toggle details">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>
      <div class="ljv-body" id="ljv-body" hidden>
        ${fraudHtml}
        <div class="ljv-signals-list">${signalsHtml}</div>
        <div class="ljv-footer">Faulkner Group &middot; Job Validator v3</div>
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
    toggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggleBody(); });

    log('Overlay injected. Score:', score, grade.label);
  }

  // ── MAIN RUN ──────────────────────────────────────────────────────────────
  function run() {
    log('run() called');
    const data = extractJobData();
    if (!scrapeHealthy(data)) {
      injectFallbackBanner();
      return;
    }
    try {
      const result = scoreJobPosting(data);
      injectOverlay(result);
      chrome.runtime.sendMessage({ type: 'SCORE_RESULT', result, data }).catch(() => {});
    } catch (err) {
      log('scoreJobPosting error:', err);
      injectFallbackBanner();
    }
  }

  // ── WAIT FOR DOM READINESS ────────────────────────────────────────────────
  // Broader set of selectors — any one of these means a job is displayed
  const READY_SELECTORS = [
    '.jobs-description-content__text',
    '.jobs-description__content',
    '#job-details',
    '.jobs-description',
    '[class*="jobs-description"]',
    '.job-view-layout'
  ];

  function isJobReady() {
    return READY_SELECTORS.some(s => {
      const el = document.querySelector(s);
      return el && (el.innerText || el.textContent || '').trim().length > 30;
    });
  }

  let attempts = 0;
  const MAX_ATTEMPTS = 40; // 40 x 500ms = 20 second window

  const readyInterval = setInterval(() => {
    attempts++;
    if (isJobReady()) {
      clearInterval(readyInterval);
      log('DOM ready after', attempts, 'attempts (~' + (attempts * 500) + 'ms)');
      run();
    } else if (attempts >= MAX_ATTEMPTS) {
      clearInterval(readyInterval);
      log('DOM never became ready after', MAX_ATTEMPTS, 'attempts — showing fallback');
      injectFallbackBanner();
    }
  }, 500);

  // ── SPA NAVIGATION OBSERVER ───────────────────────────────────────────────
  // Fires on every job click in the list (React SPA — no full page reload)
  let lastJobId = new URLSearchParams(location.search).get('currentJobId')
               || new URLSearchParams(location.search).get('jobId')
               || location.pathname;

  const spaObserver = new MutationObserver(() => {
    const params = new URLSearchParams(location.search);
    const currentJobId = params.get('currentJobId') || params.get('jobId') || location.pathname;

    if (currentJobId !== lastJobId) {
      lastJobId = currentJobId;
      log('SPA nav detected — new job ID:', currentJobId);
      removeOverlay();

      let waitAttempts = 0;
      const waitInterval = setInterval(() => {
        waitAttempts++;
        if (isJobReady()) {
          clearInterval(waitInterval);
          run();
        } else if (waitAttempts > 30) {
          clearInterval(waitInterval);
          injectFallbackBanner();
        }
      }, 400);
    }
  });

  spaObserver.observe(document.body, { childList: true, subtree: true });

})();
