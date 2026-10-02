import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateEditorialCandidate } from "../src/editorial.mjs";

const policy = JSON.parse(await readFile(new URL("../agents/ank-editorial-v1.json", import.meta.url), "utf8"));
assert.equal(policy.policy_id, "ANK_EDITORIAL_AGENT_V1");
assert.equal(policy.agent.autonomy_ceiling, "DRAFT");
assert.ok(policy.agent.forbidden_actions.includes("publish_or_release_content"));
assert.ok(policy.agent.human_gates.includes("version_specific_publication_approval"));

const candidate = {
  id: "candidate-1",
  version: "v3",
  content_hash: "sha256:abc123",
  author_id: "author-1",
  rights: { status: "VERIFIED" },
  review_profile: {
    required_checks: ["source", "accuracy", "render"],
    required_approvals: [
      { approval_type: "editorial", role: "EDITOR" },
      { approval_type: "domain", role: "DOMAIN_REVIEWER" }
    ]
  }
};

const checks = ["source", "accuracy", "render"].map(check_id => ({
  check_id, status: "PASS", version: candidate.version,
  content_hash: candidate.content_hash, verifier: { type: "HUMAN", id: "verifier-1" }
}));
const approvals = [
  { approval_type: "editorial", role: "EDITOR", approved: true, version: candidate.version,
    content_hash: candidate.content_hash, actor: { type: "HUMAN", id: "editor-1" } },
  { approval_type: "domain", role: "DOMAIN_REVIEWER", approved: true, version: candidate.version,
    content_hash: candidate.content_hash, actor: { type: "HUMAN", id: "reviewer-1" } }
];

assert.equal(evaluateEditorialCandidate({ candidate, checks, approvals }).status, "APPROVED");
assert.equal(evaluateEditorialCandidate({ candidate, checks, approvals }).can_publish, false);
assert.equal(evaluateEditorialCandidate({ candidate, checks }).status, "READY_FOR_HUMAN_APPROVAL");

assert.equal(
  evaluateEditorialCandidate({ candidate: { ...candidate, rights: { status: "UNKNOWN" } }, checks, approvals }).status,
  "BLOCKED",
  "Unknown rights must block."
);

assert.equal(
  evaluateEditorialCandidate({
    candidate,
    checks,
    approvals,
    findings: [{ id: "p0", severity: "P0", status: "RESOLVED", proposed_by: "agent-1",
      resolution: { actor: { type: "HUMAN", id: "human-1" }, role: "EDITOR", reason: "Fixed and independently checked." },
      authorized_decision_roles: ["EDITOR"] }]
  }).status,
  "APPROVED"
);

assert.equal(
  evaluateEditorialCandidate({
    candidate: { ...candidate, review_profile: { ...candidate.review_profile, required_approvals: [] } },
    checks,
    approvals
  }).status,
  "BLOCKED",
  "A profile with no human approver must fail closed."
);

assert.equal(
  evaluateEditorialCandidate({
    candidate,
    checks,
    approvals,
    findings: [{ id: "p1", severity: "P1", status: "ACCEPTED_WITH_REASON", proposed_by: "editor-1",
      decision: { actor: { type: "HUMAN", id: "editor-1" }, role: "EDITOR", reason: "same person" } }]
  }).status,
  "BLOCKED",
  "The person proposing a material finding cannot approve its acceptance."
);

assert.equal(
  evaluateEditorialCandidate({
    candidate,
    checks: checks.slice(1),
    approvals
  }).status,
  "BLOCKED",
  "A required check missing from the exact version must block."
);

assert.equal(
  evaluateEditorialCandidate({
    candidate,
    checks,
    approvals: approvals.map(a => ({ ...a, version: "v2" }))
  }).status,
  "READY_FOR_HUMAN_APPROVAL",
  "Approvals for an older version must not count."
);

const acceptedP1 = evaluateEditorialCandidate({
  candidate,
  checks,
  approvals,
  findings: [{ id: "p1-ok", severity: "P1", status: "ACCEPTED_WITH_REASON", proposed_by: "agent-1",
    decision: { actor: { type: "HUMAN", id: "independent-editor" }, role: "EDITOR", reason: "Retained with documented rationale." },
    authorized_decision_roles: ["EDITOR"],
    required_decision_role: "EDITOR" }]
});
assert.equal(acceptedP1.status, "APPROVED");

assert.equal(
  evaluateEditorialCandidate({
    candidate,
    checks,
    approvals,
    findings: [{ id: "p1-unauthorized", severity: "P1", status: "ACCEPTED_WITH_REASON", proposed_by: "agent-1",
      decision: { actor: { type: "HUMAN", id: "viewer" }, role: "VIEWER", reason: "I accept it." } }]
  }).status,
  "BLOCKED",
  "An acceptance must come from a role authorized by the finding's review profile."
);

assert.equal(
  evaluateEditorialCandidate({
    candidate,
    approvals,
    checks: checks.map(check => ({ ...check, verifier: { type: "SYSTEM", id: "render-checker", policy_id: "RENDER_CHECK_V1" } }))
  }).status,
  "APPROVED",
  "Allowlisted mechanical checks can provide version-bound system evidence."
);

console.log("editorial gate: all assertions passed");
