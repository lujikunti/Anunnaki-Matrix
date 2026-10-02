import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReviewRequest } from '../src/review.mjs';

const env = { PIE_EDITORIAL_API_TOKEN: 'test-secret', OPENAI_API_KEY: 'test-openai-key', PIE_EDITORIAL_MODEL: 'test-model' };
const validBody = {
  classification: 'PUBLICATION_DRAFT',
  rights_status: 'VERIFIED',
  product: 'mn',
  candidate: { id: 'article-7', version: 'v3', content_hash: 'sha256:abc123' },
  sections: [{ anchor_id: 'intro', text: 'A draft paragraph.' }]
};

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; },
    json() { return JSON.parse(this.body); }
  };
}

function request(body = validBody, { method = 'POST', authorization = 'Bearer test-secret' } = {}) {
  return { method, headers: { authorization }, body };
}

const modelPayload = {
  output: [{ content: [{ type: 'output_text', text: JSON.stringify({
    summary: 'One claim needs sourcing.',
    findings: [{
      anchor_id: 'intro', severity: 'P2', category: 'accuracy', issue: 'The claim is unsupported.',
      suggested_redline: 'Qualify the claim or add evidence.', rationale: 'No supporting source was supplied.', source_needed: true
    }],
    unresolved_questions: ['What evidence supports the claim?']
  }) }] }]
};

test('requires bearer token and keeps response private', async () => {
  const res = responseRecorder();
  await handleReviewRequest(request(validBody, { authorization: 'Bearer wrong' }), res, env, async () => { throw new Error('must not call model'); });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error, 'unauthorized');
  assert.equal(res.headers['Cache-Control'], 'no-store, max-age=0');
});

test('rejects non-POST methods', async () => {
  const res = responseRecorder();
  await handleReviewRequest(request(validBody, { method: 'GET' }), res, env);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
});

test('rejects source classes and unverified rights before model call', async () => {
  for (const patch of [{ classification: 'LEARNER_RECORD' }, { rights_status: 'UNKNOWN' }]) {
    const res = responseRecorder();
    await handleReviewRequest(request({ ...validBody, ...patch }), res, env, async () => { throw new Error('must not call model'); });
    assert.equal(res.statusCode, 400);
  }
});

test('rejects oversized and duplicate-anchor input', async () => {
  const big = { ...validBody, sections: [{ anchor_id: 'a', text: 'x'.repeat(12_001) }] };
  const duplicate = { ...validBody, sections: [{ anchor_id: 'x', text: 'one' }, { anchor_id: 'x', text: 'two' }] };
  for (const body of [big, duplicate]) {
    const res = responseRecorder();
    await handleReviewRequest(request(body), res, env, async () => { throw new Error('must not call model'); });
    assert.equal(res.statusCode, 400);
  }
});

test('returns anchored redlines without approval, release, or receipt', async () => {
  let sent;
  const res = responseRecorder();
  await handleReviewRequest(request(), res, env, async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => modelPayload };
  });
  assert.equal(res.statusCode, 200);
  assert.equal(sent.store, false);
  assert.equal(sent.model, 'test-model');
  const report = res.json();
  assert.equal(report.review.findings[0].anchor_id, 'intro');
  assert.equal(report.approval_status, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(report.release_state, 'NOT_RELEASED');
  assert.equal(report.can_publish, false);
  assert.equal(report.receipt, null);
});

test('rejects model findings that point outside supplied sections', async () => {
  const res = responseRecorder();
  const invalidPayload = { output: [{ content: [{ type: 'output_text', text: JSON.stringify({
    summary: 'Bad anchor', findings: [{ anchor_id: 'missing', severity: 'P1', category: 'safety', issue: 'x', suggested_redline: 'y', rationale: 'z', source_needed: false }], unresolved_questions: []
  }) }] }] };
  await handleReviewRequest(request(), res, env, async () => ({ ok: true, json: async () => invalidPayload }));
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error, 'editorial_review_failed');
});

test('returns safe error for upstream failure and missing configuration', async () => {
  const upstream = responseRecorder();
  await handleReviewRequest(request(), upstream, env, async () => ({ ok: false, status: 429 }));
  assert.equal(upstream.statusCode, 502);
  assert.deepEqual(upstream.json(), { error: 'editorial_review_failed' });
  const noKey = responseRecorder();
  await handleReviewRequest(request(), noKey, { ...env, OPENAI_API_KEY: '' });
  assert.equal(noKey.statusCode, 503);
});
