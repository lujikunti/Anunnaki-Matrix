const SEVERITY_RANK = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });

const CLOSED_STATUSES = new Set([
  "RESOLVED",
  "ACCEPTED_WITH_REASON",
  "REJECTED_WITH_REASON"
]);

function human(actor) {
  return actor?.type === "HUMAN" && typeof actor.id === "string" && actor.id.length > 0;
}

function trustedCheckVerifier(actor) {
  return human(actor) || (
    actor?.type === "SYSTEM" &&
    typeof actor.id === "string" && actor.id.length > 0 &&
    typeof actor.policy_id === "string" && actor.policy_id.length > 0
  );
}

function sameCandidate(record, candidate) {
  return record?.version === candidate.version &&
    record?.content_hash === candidate.content_hash;
}

function decisionHasValidHuman(finding) {
  const decision = finding?.decision;
  const authorizedRoles = finding?.authorized_decision_roles;
  return finding?.status === "ACCEPTED_WITH_REASON" &&
    human(decision?.actor) &&
    decision.actor.id !== finding.proposed_by &&
    typeof decision.reason === "string" &&
    decision.reason.trim().length > 0 &&
    Array.isArray(authorizedRoles) &&
    authorizedRoles.includes(decision.role) &&
    (!finding.required_decision_role || decision.role === finding.required_decision_role);
}

function resolutionHasValidHuman(finding) {
  const resolution = finding?.resolution;
  const authorizedRoles = finding?.authorized_decision_roles;
  return finding?.status === "RESOLVED" &&
    human(resolution?.actor) &&
    resolution.actor.id !== finding.proposed_by &&
    typeof resolution.reason === "string" &&
    resolution.reason.trim().length > 0 &&
    Array.isArray(authorizedRoles) &&
    authorizedRoles.includes(resolution.role);
}

/**
 * Evaluate a PIE editorial candidate without performing external actions.
 * This function may authorize progression to human release, never publication.
 */
export function evaluateEditorialCandidate({
  candidate,
  findings = [],
  checks = [],
  approvals = [],
  evaluated_at = new Date().toISOString()
} = {}) {
  const blockers = [];
  const warnings = [];

  if (!candidate?.id || !candidate?.version || !candidate?.content_hash) {
    blockers.push({ code: "CANDIDATE_IDENTITY_INCOMPLETE", message: "Candidate id, version and content hash are required." });
  }

  if (!candidate?.author_id) {
    blockers.push({ code: "AUTHOR_REQUIRED", message: "Candidate author identity is required." });
  }

  if (candidate?.rights?.status !== "VERIFIED") {
    blockers.push({ code: "RIGHTS_NOT_VERIFIED", message: "Rights and provenance must be verified for the intended release." });
  }

  const requiredChecks = candidate?.review_profile?.required_checks;
  if (!Array.isArray(requiredChecks) || requiredChecks.length === 0) {
    blockers.push({ code: "REVIEW_PROFILE_REQUIRED", message: "A review profile with required checks is required." });
  } else {
    for (const checkId of requiredChecks) {
      const passed = checks.some(check =>
        check?.check_id === checkId &&
        check?.status === "PASS" &&
        sameCandidate(check, candidate) &&
        trustedCheckVerifier(check?.verifier)
      );
      if (!passed) {
        blockers.push({ code: "CHECK_NOT_PROVEN", check_id: checkId, message: "Required check is missing, failed, or not verified against this candidate version." });
      }
    }
  }

  for (const finding of findings) {
    const severity = finding?.severity;
    const status = finding?.status;
    if (!(severity in SEVERITY_RANK)) {
      blockers.push({ code: "FINDING_SEVERITY_INVALID", finding_id: finding?.id || null, message: "Finding has no recognized severity." });
      continue;
    }

    if (severity === "P0") {
      if (!resolutionHasValidHuman(finding)) {
        blockers.push({ code: "P0_FINDING_OPEN", finding_id: finding.id, message: "P0 findings require independently verified human resolution; they cannot be waived." });
      }
      continue;
    }

    if (severity === "P1") {
      const resolved = resolutionHasValidHuman(finding);
      const accepted = decisionHasValidHuman(finding);
      if (!resolved && !accepted) {
        blockers.push({ code: "P1_FINDING_OPEN", finding_id: finding.id, message: "P1 findings must be resolved or accepted with a reason by an independent authorized human." });
      }
      continue;
    }

    if (!CLOSED_STATUSES.has(status)) {
      warnings.push({ code: "NON_BLOCKING_FINDING_OPEN", finding_id: finding?.id || null, severity, message: "A non-blocking finding remains open." });
    }
  }

  const requiredApprovals = candidate?.review_profile?.required_approvals;
  if (!Array.isArray(requiredApprovals) || requiredApprovals.length === 0) {
    blockers.push({ code: "REQUIRED_APPROVALS_UNDEFINED", message: "At least one human approval role must be explicitly defined by the review profile." });
  }

  const validApprovals = Array.isArray(requiredApprovals)
    ? requiredApprovals.map(required => approvals.find(approval =>
        approval?.approval_type === required.approval_type &&
        approval?.role === required.role &&
        approval?.approved === true &&
        human(approval?.actor) &&
        approval.actor.id !== candidate?.author_id &&
        sameCandidate(approval, candidate)
      )).filter(Boolean)
    : [];

  const missingApprovals = Array.isArray(requiredApprovals)
    ? requiredApprovals.filter(required => !validApprovals.some(approval =>
        approval.approval_type === required.approval_type && approval.role === required.role
      ))
    : [];

  if (blockers.length > 0) {
    return {
      candidate_id: candidate?.id || null,
      version: candidate?.version || null,
      content_hash: candidate?.content_hash || null,
      status: "BLOCKED",
      blockers,
      warnings,
      missing_approvals: missingApprovals,
      next_action: "RESOLVE_BLOCKERS",
      can_publish: false,
      evaluated_at
    };
  }

  if (missingApprovals.length > 0) {
    return {
      candidate_id: candidate.id,
      version: candidate.version,
      content_hash: candidate.content_hash,
      status: "READY_FOR_HUMAN_APPROVAL",
      blockers: [],
      warnings,
      missing_approvals: missingApprovals,
      next_action: "REQUEST_HUMAN_APPROVAL",
      can_publish: false,
      evaluated_at
    };
  }

  return {
    candidate_id: candidate.id,
    version: candidate.version,
    content_hash: candidate.content_hash,
    status: "APPROVED",
    editorial_receipt: {
      status: "APPROVED",
      content_id: candidate.id,
      version: candidate.version,
      content_hash: candidate.content_hash,
      editorial_agent_id: "ank-editorial",
      checks_status: "PASS",
      blocking_findings: 0,
      approved_at: evaluated_at,
      approvals: validApprovals.map(approval => ({
        role: approval.role,
        actor_type: "HUMAN",
        actor_id: approval.actor.id,
        approved: true,
        version: candidate.version,
        content_hash: candidate.content_hash
      }))
    },
    blockers: [],
    warnings,
    missing_approvals: [],
    next_action: "HUMAN_RELEASE_ACTION_REQUIRED",
    can_publish: false,
    evaluated_at
  };
}
