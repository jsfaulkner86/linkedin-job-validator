/**
 * LinkedIn Job Validator — Content Script
 * Scrapes the current LinkedIn job posting page and injects the validity score overlay.
 */

(function () {
  'use strict';

  const SELECTORS = {
    jobTitle: [
      '.job-details-jobs-unified-top-card__job-title h1',
      'h1.t-24', 'h1[class*="job-title"]', 'h1'
    ],
    companyName: [
      '.job-details-jobs-unified-top-card__company-name a',
      '[class*="company-name"] a',
      'a[class*="topcard__org"]'
    ],
    description: [
      '.jobs-description-content__text',
      '[class*="description__text"]',
      '#job-details',
      '.jobs-description'
    ],
    salary: [
      '[class*="salary"]',
      '[class*="compensation"]',
      '[class*="pay"]'
    ],
    verifiedBadge: [
      '[aria-label*="verified"]',
      '[class*="verified"]',
      'svg[aria-label*="Verified"]'
    ],
    applyButton: [
      '.jobs-apply-button',
      '[class*="apply-button"]',
      'button[class*="apply"]'
    ],
    easyApplyBtn: [
      '[data-control-name="jobdetails_topcard_inapply"]',
      'button[class*="easy-apply"]',
      'button[aria-label*="Easy Apply"]'
    ],
    employeeCount: [
      '[class*="num-of-employees"]',
      'a[href*="people"] span',
      '[class*="company-size"]',
      '[class*="employees"]'
    ],
    companyWebsite: [
      'a[href*="company-website"]',
      'a[data-tracking-control-name*="website"]',
      '[class*="company-website"] a'
    ]
  };

  function trySelect(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function extractJobData() {
    const titleEl      = trySelect(SELECTORS.jobTitle);
    const companyEl    = trySelect(SELECTORS.companyName);
    const descEl       = trySelect(SELECTORS.description);
    const salaryEl     = trySelect(SELECTORS.salary);
    const verifiedEl   = trySelect(SELECTORS.verifiedBadge);
    const applyBtn     = trySelect(SELECTORS.applyButton);
    const easyApplyBtn = trySelect(SELECTORS.easyApplyBtn);
    const employeeEl   = trySelect(SELECTORS.employeeCount);
    const websiteEl    = trySelect(SELECTORS.companyWebsite);

    let companyDomain = '';
    if (companyEl && companyEl.href) {
      const slug = companyEl.href.match(/company\/([^/]+)/);
      if (slug) companyDomain = slug[1];
    }

    let applyUrl = '';
    if (applyBtn) {
      applyUrl = applyBtn.dataset?.applyUrl || applyBtn.href || '';
    }

    return {
      title:                  titleEl?.textContent?.trim()    || '',
      company:                companyEl?.textContent?.trim()  || '',
      description:            descEl?.innerText               || descEl?.textContent || '',
      salaryDisclosed:        !!salaryEl,
      isVerifiedCompany:      !!verifiedEl,
      employeeCount:          employeeEl?.textContent?.trim() || '',
      hasCompanyWebsite:      !!websiteEl,
      applyUrl,
      companyDomain,
      isEasyApply:            !!easyApplyBtn,
      posterConnectionCount:  0,
      hasHiringManagerProfile:false,
    };
  }

  function injectOverlay(result) {
    const existing = document.getElementById('ljv-overlay');
    if (existing) existing.remove();

    const { score, grade, signals, fraudFlags } = result;

    const overlay = document.createElement('div');
    overlay.id = 'ljv-overlay';
    overlay.setAttribute('role', 'complementary');
    overlay.setAttribute('aria-label', `Job validity score: ${score}/100`);

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

    overlay.innerHTML = `
      <div class="ljv-header" id="ljv-toggle" role="button" tabindex="0" aria-expanded="false">
        <div class="ljv-score-ring">
          <svg viewBox="0 0 44 44" class="ljv-ring-svg" aria-hidden="true">
            <circle cx="22" cy="22" r="18" class="ljv-ring-bg"/>
            <circle cx="22" cy="22" r="18" class="ljv-ring-fill"
              stroke-dasharray="${(score / 100) * 113} 113"
              stroke="${grade.color}"/>
          </svg>
          <span class="ljv-score-num">${score}</span>
        </div>
        <div class="ljv-header-info">
          <div class="ljv-grade-badge" style="color:${grade.color};background:${grade.bg}">
            ${grade.label}
          </div>
          <div class="ljv-header-sub">Validity Score \u00b7 ${score}/100</div>
        </div>
        <button class="ljv-expand-btn" aria-label="Toggle details">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>
      <div class="ljv-body" id="ljv-body" hidden>
        ${fraudHtml}
        <div class="ljv-signals-list">${signalsHtml}</div>
        <div class="ljv-footer">Powered by Faulkner Group \u00b7 Job Validator</div>
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
      btn.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    toggle.addEventListener('click', toggleBody);
    toggle.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && toggleBody());
  }

  function run() {
    const data   = extractJobData();
    const result = scoreJobPosting(data);
    injectOverlay(result);
    chrome.runtime.sendMessage({ type: 'SCORE_RESULT', result, data });
  }

  let attempts = 0;
  const interval = setInterval(() => {
    if (document.querySelector('.jobs-description, .jobs-description-content__text, #job-details') || attempts > 20) {
      clearInterval(interval);
      run();
    }
    attempts++;
  }, 400);

  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(run, 1200);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
