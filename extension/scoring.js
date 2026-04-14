/**
 * LinkedIn Job Validity Scoring Engine
 * Faulkner Group — Agentic AI Architect
 *
 * Evaluates extracted job posting data against weighted signal categories.
 * Returns a 0–100 score with per-signal breakdown.
 */

const FRAUD_PATTERNS = [
  { pattern: /earn(ing)?\s+\$[\d,]+\s*(per|a|\/)?\s*(hour|day|week|month)/i, label: 'Unrealistic earnings promise' },
  { pattern: /work from home.*\$[\d,]+/i, label: 'WFH income claim' },
  { pattern: /be your own boss/i, label: '"Be your own boss" language' },
  { pattern: /no experience (needed|required|necessary)/i, label: 'No experience required' },
  { pattern: /(upfront|up-front)\s*(fee|payment|cost|investment)/i, label: 'Upfront payment required' },
  { pattern: /training fee/i, label: 'Training fee mentioned' },
  { pattern: /wire transfer/i, label: 'Wire transfer mentioned' },
  { pattern: /guaranteed (income|salary|pay|earning)/i, label: 'Guaranteed income claim' },
  { pattern: /unlimited (earning|income|potential|commission)/i, label: 'Unlimited earnings claim' },
  { pattern: /multi.?level marketing|network marketing|direct sales opportunity/i, label: 'MLM/network marketing' },
  { pattern: /pyramid scheme|ponzi/i, label: 'Pyramid scheme reference' },
  { pattern: /invest(ment)? required|buy your (starter|kit)/i, label: 'Investment required' },
  { pattern: /\b(get rich|passive income|financial freedom)\b/i, label: 'Get-rich language' },
  { pattern: /home.based business opportunity/i, label: 'Home-based "opportunity"' },
];

const QUALITY_INDICATORS = {
  hasYearsExperience: /\d+\+?\s*years?(\s+of)?\s+experience/i,
  hasDegreeReq:       /bachelor|master|phd|mba|degree|b\.s\.|m\.s\.|associate/i,
  hasCertReq:         /certification|certified|license|credential/i,
  hasToolsOrStack:    /(proficiency|experience|knowledge|skill)\s+(in|with)\s+\w+/i,
  hasTeamStructure:   /report(s|ing)?\s+to|team\s+of\s+\d+|work(ing)?\s+with\s+\w+\s+team/i,
  hasResponsibilities:/you\s+will\s+(be|have)|responsibilities\s+(include|:)|key\s+duties/i,
  hasSalaryRange:     /\$[\d,]+\s*[-\u2013\u2014]\s*\$[\d,]+|\$[\d,]+k?\s*[-\u2013]\s*\$?[\d,]+k?|salary.{1,30}range|compensation.{1,30}range/i,
  hasBenefits:        /health\s*insurance|dental|vision|401\s*k|pto|paid\s+time\s+off|equity|stock\s+option|parental\s+leave/i,
};

const SUSPICIOUS_EXTERNAL_DOMAINS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'rebrand.ly',
  'click.', 'redirect.', 'track.', 'apply-now.', 'careers-hub.',
];

/**
 * @param {Object} data - Extracted job posting data
 * @returns {Object} { score, grade, signals, categories, fraudFlags }
 */
function scoreJobPosting(data) {
  const signals = [];
  const fraudFlags = [];

  function addSignal(id, label, category, earned, max, passed, detail = '') {
    signals.push({ id, label, category, earned, max, passed, detail });
  }

  // ── COMPANY LEGITIMACY (30 pts) ──────────────────────────────────────────
  addSignal(
    'verified_company', 'Company verified by LinkedIn',
    'company', data.isVerifiedCompany ? 15 : 0, 15,
    !!data.isVerifiedCompany,
    data.isVerifiedCompany ? 'LinkedIn has verified this company' : 'No verification badge detected'
  );

  const sizeScore = parseEmployeeScore(data.employeeCount);
  addSignal(
    'company_size', 'Company has substantial employee presence',
    'company', sizeScore, 8,
    sizeScore >= 5,
    data.employeeCount ? `${data.employeeCount} employees` : 'Employee count not listed'
  );

  addSignal(
    'company_website', 'Company website linked on profile',
    'company', data.hasCompanyWebsite ? 7 : 0, 7,
    !!data.hasCompanyWebsite,
    data.hasCompanyWebsite ? 'Company has a linked website' : 'No company website found'
  );

  // ── POSTING QUALITY (35 pts) ─────────────────────────────────────────────
  const descLen = (data.description || '').replace(/<[^>]+>/g, '').length;
  const descScore = descLen > 600 ? 8 : descLen > 300 ? 5 : descLen > 100 ? 2 : 0;
  addSignal(
    'description_length', 'Detailed job description',
    'posting', descScore, 8,
    descLen > 300,
    `Description is ~${descLen} characters`
  );

  const desc = data.description || '';
  const hasSalary = data.salaryDisclosed || QUALITY_INDICATORS.hasSalaryRange.test(desc);
  addSignal(
    'salary_disclosed', 'Salary / compensation range disclosed',
    'posting', hasSalary ? 12 : 0, 12,
    hasSalary,
    hasSalary ? 'Salary range or compensation details found' : 'No salary information provided'
  );

  const hasQualifications = QUALITY_INDICATORS.hasYearsExperience.test(desc) ||
                            QUALITY_INDICATORS.hasDegreeReq.test(desc) ||
                            QUALITY_INDICATORS.hasCertReq.test(desc);
  addSignal(
    'qualifications', 'Specific qualifications or requirements listed',
    'posting', hasQualifications ? 8 : 0, 8,
    hasQualifications,
    hasQualifications ? 'Specific education/experience requirements found' : 'No clear qualifications stated'
  );

  const hasResponsibilities = QUALITY_INDICATORS.hasResponsibilities.test(desc) ||
                              QUALITY_INDICATORS.hasTeamStructure.test(desc);
  addSignal(
    'responsibilities', 'Clear responsibilities defined',
    'posting', hasResponsibilities ? 7 : 0, 7,
    hasResponsibilities,
    hasResponsibilities ? 'Job duties and team context mentioned' : 'Responsibilities unclear or vague'
  );

  // ── APPLICATION PROCESS (20 pts) ─────────────────────────────────────────
  let applyScore = 0;
  let applyDetail = '';

  if (data.isEasyApply) {
    applyScore = 10;
    applyDetail = 'LinkedIn Easy Apply (internal) — lowest friction for applicants';
  } else if (data.applyUrl && data.companyDomain) {
    const domainMatch = data.applyUrl.toLowerCase().includes(data.companyDomain.toLowerCase());
    const isSuspicious = SUSPICIOUS_EXTERNAL_DOMAINS.some(d => data.applyUrl.toLowerCase().includes(d));
    if (isSuspicious) {
      applyScore = 0;
      applyDetail = 'Apply URL uses a suspicious redirect domain';
      fraudFlags.push({ severity: 'high', label: 'Apply link uses a redirect/shortener URL' });
    } else if (domainMatch) {
      applyScore = 20;
      applyDetail = `Apply link points to company domain (${data.companyDomain})`;
    } else {
      applyScore = 8;
      applyDetail = 'Apply link goes to an external careers platform';
    }
  } else if (data.applyUrl) {
    const isSuspicious = SUSPICIOUS_EXTERNAL_DOMAINS.some(d => data.applyUrl.toLowerCase().includes(d));
    applyScore = isSuspicious ? 0 : 6;
    applyDetail = isSuspicious
      ? 'Apply URL uses a URL shortener — high risk'
      : 'External apply link, company domain not confirmed';
    if (isSuspicious) fraudFlags.push({ severity: 'high', label: 'Apply link uses a URL shortener' });
  }

  addSignal(
    'apply_process', 'Application process is legitimate',
    'application', applyScore, 20,
    applyScore >= 6,
    applyDetail
  );

  // ── FRAUD DETECTION (15 pts) ─────────────────────────────────────────────
  const fraudMatches = FRAUD_PATTERNS.filter(f => f.pattern.test(desc));
  fraudMatches.forEach(f => fraudFlags.push({ severity: 'critical', label: f.label }));

  const fraudPenalty = Math.min(fraudMatches.length * 5, 15);
  const fraudScore = Math.max(0, 15 - fraudPenalty);

  addSignal(
    'fraud_patterns', 'No fraudulent language patterns detected',
    'fraud', fraudScore, 15,
    fraudMatches.length === 0,
    fraudMatches.length === 0
      ? 'No suspicious phrases found'
      : `${fraudMatches.length} suspicious pattern(s): ${fraudMatches.slice(0, 2).map(f => f.label).join(', ')}`
  );

  // ── CALCULATE TOTAL ──────────────────────────────────────────────────────
  const totalEarned = signals.reduce((sum, s) => sum + s.earned, 0);
  const totalMax = signals.reduce((sum, s) => sum + s.max, 0);
  const score = Math.round((totalEarned / totalMax) * 100);

  const grade =
    score >= 80 ? { label: 'High Confidence', color: '#437a22', bg: '#d4dfcc', code: 'A' } :
    score >= 60 ? { label: 'Moderate Signal', color: '#d19900', bg: '#e9e0c6', code: 'B' } :
    score >= 40 ? { label: 'Low Confidence', color: '#964219', bg: '#ddcfc6', code: 'C' } :
                  { label: 'High Risk',       color: '#a12c7b', bg: '#e0ced7', code: 'D' };

  const categories = buildCategoryBreakdown(signals);

  return { score, grade, signals, categories, fraudFlags, totalEarned, totalMax };
}

function parseEmployeeScore(employeeCount) {
  if (!employeeCount) return 0;
  const s = employeeCount.toLowerCase().replace(/,/g, '');
  if (/1.?employee|self.employed/.test(s)) return 0;
  if (/2.?10\b/.test(s)) return 2;
  if (/11.?50\b/.test(s)) return 4;
  if (/51.?200\b/.test(s)) return 6;
  if (/201.?500\b/.test(s)) return 7;
  if (/501|1000|5000|10000|50000/.test(s)) return 8;
  return 3;
}

function buildCategoryBreakdown(signals) {
  const cats = {};
  signals.forEach(s => {
    if (!cats[s.category]) cats[s.category] = { earned: 0, max: 0, signals: [] };
    cats[s.category].earned += s.earned;
    cats[s.category].max += s.max;
    cats[s.category].signals.push(s);
  });
  return cats;
}

if (typeof module !== 'undefined') module.exports = { scoreJobPosting };
