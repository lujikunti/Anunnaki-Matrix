const form = document.querySelector('#review-form');
const draftText = document.querySelector('#draft-text');
const fileInput = document.querySelector('#draft-file');
const output = document.querySelector('#review-output');
const emptyState = document.querySelector('#empty-state');
const resultsPanel = document.querySelector('.results-panel');
const reviewButton = document.querySelector('#review-button');
const wordCount = document.querySelector('#word-count');
const sectionCount = document.querySelector('#section-count');
const accessToken = document.querySelector('#access-token');
let latestReport = null;
window.addEventListener('pagehide', () => { accessToken.value = ''; draftText.value = ''; });

function sectionsFromText(text) {
  return text.trim().split(/\n\s*\n+/).map(section => section.trim()).filter(Boolean)
    .map((text, index) => ({ anchor_id: `section-${String(index + 1).padStart(3, '0')}`, text }));
}

function updateDraftMeta() {
  const text = draftText.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  wordCount.textContent = `${words.toLocaleString()} words`;
  sectionCount.textContent = `${sectionsFromText(text).length} sections`;
}

draftText.addEventListener('input', updateDraftMeta);
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const allowed = /\.(md|markdown|txt)$/i.test(file.name);
  if (!allowed || file.size > 300_000) {
    showError('Choose a Markdown or plain text file under 300 KB.');
    fileInput.value = '';
    return;
  }
  draftText.value = await file.text();
  if (!document.querySelector('#candidate-name').value) {
    document.querySelector('#candidate-name').value = file.name.replace(/\.(md|markdown|txt)$/i, '');
  }
  updateDraftMeta();
});

function showError(message) {
  emptyState.hidden = true;
  output.hidden = false;
  output.replaceChildren();
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.textContent = message;
  output.append(banner);
}

function addText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value ?? '';
  parent.append(element);
  return element;
}

function renderReport(report) {
  latestReport = report;
  emptyState.hidden = true;
  output.hidden = false;
  output.replaceChildren();
  const status = document.createElement('div');
  status.className = 'review-status';
  addText(status, 'span', '', `${report.review.findings.length} FINDING${report.review.findings.length === 1 ? '' : 'S'}`);
  addText(status, 'span', 'not-approved', 'HUMAN REVIEW REQUIRED');
  output.append(status);
  addText(output, 'p', 'review-summary', report.review.summary);

  if (!report.review.findings.length) {
    addText(output, 'div', 'review-summary', 'No specific redlines were returned. A human editor must still review the full draft and required product checks.');
  }
  for (const finding of report.review.findings) {
    const card = document.createElement('article');
    card.className = 'finding';
    const top = document.createElement('div');
    top.className = 'finding-top';
    addText(top, 'span', `pill ${finding.severity}`, finding.severity);
    addText(top, 'span', 'pill', finding.category.replaceAll('_', ' '));
    addText(top, 'span', 'anchor', finding.anchor_id);
    card.append(top);
    addText(card, 'h3', '', finding.issue);
    addText(card, 'p', '', finding.rationale);
    addText(card, 'p', 'redline-label', 'SUGGESTED REDLINE');
    addText(card, 'div', 'redline', finding.suggested_redline);
    if (finding.source_needed) addText(card, 'p', 'source-needed', 'Source needed: verify this point against an authoritative source before release.');
    output.append(card);
  }
  if (report.review.unresolved_questions.length) {
    addText(output, 'p', 'redline-label', 'QUESTIONS FOR THE EDITOR');
    const list = document.createElement('ul');
    list.className = 'question-list';
    for (const question of report.review.unresolved_questions) addText(list, 'li', '', question);
    output.append(list);
  }
  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'secondary-button';
  download.textContent = 'Download review report';
  download.addEventListener('click', downloadReport);
  actions.append(download);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'secondary-button';
  clear.textContent = 'Clear report';
  clear.addEventListener('click', () => { latestReport = null; output.replaceChildren(); output.hidden = true; emptyState.hidden = false; });
  actions.append(clear);
  output.append(actions);
}

function reportMarkdown() {
  if (!latestReport) return '';
  const report = latestReport;
  const findings = report.review.findings.map(finding => [
    `## ${finding.severity} · ${finding.category} · ${finding.anchor_id}`,
    '', finding.issue, '', `**Reason:** ${finding.rationale}`, '',
    '**Suggested redline:**', '', `> ${finding.suggested_redline.replaceAll('\n', '\n> ')}`,
    finding.source_needed ? '' : null,
    finding.source_needed ? '**Source needed:** verify against an authoritative source before release.' : null
  ].filter(value => value !== null).join('\n')).join('\n\n');
  const questions = report.review.unresolved_questions.map(item => `- ${item}`).join('\n');
  return `# PIE Editorial Review\n\n- Candidate: ${report.candidate.id}\n- Version: ${report.candidate.version}\n- Content hash: ${report.candidate.content_hash}\n- Product: ${report.product.toUpperCase()}\n- Status: HUMAN REVIEW REQUIRED · NOT RELEASED\n\n## Summary\n\n${report.review.summary}\n\n${findings || 'No specific findings returned.'}\n\n## Questions for the editor\n\n${questions || 'None.'}\n\n---\nPIE is advisory. A human editor must verify findings and approve any change. This report is not a release receipt.\n`;
}

function downloadReport() {
  const blob = new Blob([reportMarkdown()], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pie-editorial-review.md';
  link.click();
  URL.revokeObjectURL(url);
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = draftText.value.trim();
  const sections = sectionsFromText(text);
  if (!document.querySelector('#rights-check').checked) return showError('Confirm that this is a rights-verified publication draft before sending it for review.');
  if (!sections.length) return showError('Add draft text before requesting a review.');
  if (sections.length > 40 || sections.some(section => section.text.length > 12_000) || text.length > 300_000) {
    return showError('This draft exceeds the current limits: 40 sections, 12,000 characters per section, and 300,000 characters total. Split it into smaller publication candidates.');
  }
  const token = accessToken.value;
  const name = document.querySelector('#candidate-name').value.trim();
  const version = document.querySelector('#version').value.trim();
  reviewButton.disabled = true;
  reviewButton.firstElementChild.textContent = 'Reviewing draft…';
  resultsPanel.setAttribute('aria-busy', 'true');
  try {
    const contentHash = await sha256(text);
    const response = await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        classification: 'PUBLICATION_DRAFT', rights_status: 'VERIFIED', product: document.querySelector('#product').value,
        candidate: { id: name, version, content_hash: contentHash }, sections
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `Review failed (${response.status}).`);
    renderReport(data);
  } catch (error) {
    showError(error.message || 'Review could not be completed. Check your connection and try again.');
  } finally {
    reviewButton.disabled = false;
    reviewButton.firstElementChild.textContent = 'Review this draft';
    resultsPanel.setAttribute('aria-busy', 'false');
  }
});

updateDraftMeta();
