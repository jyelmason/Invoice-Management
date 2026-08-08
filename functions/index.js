/**
 * Email notifications for the document-approval app.
 *
 * Two triggers do all the work:
 *  1. notifyFirstApprover  — fires when a new "approvals" doc is created,
 *     emails the first approver in the chain.
 *  2. notifyOnApprovalChange — fires whenever approvedCount goes up, and
 *     either emails the *next* approver, or (if the chain just finished)
 *     emails the submitter that everything is approved.
 *
 * Setup (one-time):
 *   cd functions
 *   npm install
 *
 *   # Gmail needs an App Password, not your normal password:
 *   #   Google Account -> Security -> 2-Step Verification -> App passwords
 *   #   (2FA must already be on for this option to appear)
 *   firebase functions:secrets:set GMAIL_USER
 *   firebase functions:secrets:set GMAIL_APP_PASSWORD
 *
 *   # Where "Review and approve" links point (your deployed ApproverView URL):
 *   echo 'APPROVER_PORTAL_URL="https://your-app-domain.com/approve"' > .env
 *
 *   firebase deploy --only functions
 */

const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const logger = require("firebase-functions/logger");
const nodemailer = require("nodemailer");

initializeApp();

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const APPROVER_PORTAL_URL = defineString("APPROVER_PORTAL_URL", {
  default: "https://your-app-domain.com/approve",
});

const SECRETS = [GMAIL_USER, GMAIL_APP_PASSWORD];

// ─── Mail plumbing ────────────────────────────────────────────────────────────
let transporter;
function getTransporter() {
  // Built lazily (not at module load) because secret values aren't resolved
  // until the function actually runs.
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: GMAIL_USER.value(),
        pass: GMAIL_APP_PASSWORD.value(),
      },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html }) {
  if (!to) {
    logger.warn(`sendMail skipped (no recipient) — subject: "${subject}"`);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: `"Document Approvals" <${GMAIL_USER.value()}>`,
      to,
      subject,
      html,
    });
    logger.info(`Sent "${subject}" to ${to}`);
  } catch (err) {
    // Don't rethrow — a failed email shouldn't retry-loop the Firestore trigger.
    logger.error(`Failed to send "${subject}" to ${to}:`, err);
  }
}

// ─── Templating helpers ───────────────────────────────────────────────────────
// Mirrors the requiredBy shape written by SubmitterView.jsx: { date, time, datetime }.
function formatDeadlineBlock(requiredBy) {
  if (!requiredBy?.date) return "";
  const d = new Date(`${requiredBy.date}T${requiredBy.time || "00:00"}`);
  const dateStr = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = requiredBy.time
    ? ` at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : "";
  return `<p style="margin:0 0 16px;font-size:14px;color:#B3261E;"><strong>Required approval by:</strong> ${dateStr}${timeStr}</p>`;
}

function baseEmailHtml({ heading, bodyHtml, ctaUrl, ctaLabel }) {
  return `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 16px;font-size:20px;color:#111;">${heading}</h2>
      ${bodyHtml}
      ${
        ctaUrl
          ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#378ADD;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;">${ctaLabel}</a>`
          : ""
      }
    </div>
  `;
}

function fullName(person) {
  return `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim();
}

// ─── Trigger 1: doc created → email the first approver ─────────────────────
exports.notifyFirstApprover = onDocumentCreated(
  { document: "approvals/{docId}", secrets: SECRETS },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const firstApprover = data.approvers?.[0];
    if (!firstApprover?.email) {
      logger.warn(`New approval ${event.params.docId} has no approvers[0].email — nothing to send.`);
      return;
    }

    await sendMail({
      to: firstApprover.email,
      subject: `Approval needed: ${data.fileName ?? "New document"} (${data.submitter?.company ?? ""})`,
      html: baseEmailHtml({
        heading: "A document needs your approval",
        bodyHtml: `
          <p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.5;">
            <strong>${fullName(data.submitter)}</strong> at <strong>${data.submitter?.company ?? ""}</strong>
            submitted <strong>${data.fileName ?? "a document"}</strong> for approval, and you're first in the chain.
          </p>
          ${formatDeadlineBlock(data.requiredBy)}
          <p style="margin:0;font-size:13px;color:#666;">Sign in with <strong>${firstApprover.email}</strong> to review it.</p>
        `,
        ctaUrl: APPROVER_PORTAL_URL.value(),
        ctaLabel: "Review and approve",
      }),
    });
  }
);

// ─── Trigger 2: approvedCount advances → next approver, or submitter on completion ─
exports.notifyOnApprovalChange = onDocumentUpdated(
  { document: "approvals/{docId}", secrets: SECRETS },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    const prevCount = before.approvedCount ?? 0;
    const newCount = after.approvedCount ?? 0;

    // Only react to an actual new approval (ignore unrelated field updates,
    // and ignore the (impossible in normal flow) case of the count going down).
    if (newCount <= prevCount) return;

    const total = after.approverCount ?? after.approvers?.length ?? 0;

    if (newCount >= total) {
      // Chain finished — let the submitter know.
      await sendMail({
        to: after.submitter?.email,
        subject: `Approved: ${after.fileName ?? "Your document"}`,
        html: baseEmailHtml({
          heading: "Your document is fully approved",
          bodyHtml: `
            <p style="margin:0;font-size:14px;color:#333;line-height:1.5;">
              <strong>${after.fileName ?? "Your document"}</strong> has been approved by everyone in the
              chain at <strong>${after.submitter?.company ?? ""}</strong>.
            </p>
          `,
        }),
      });
      return;
    }

    // Otherwise, the next approver in line is up.
    const nextApprover = after.approvers?.[newCount];
    if (!nextApprover?.email) {
      logger.warn(`Approval ${event.params.docId} has no approvers[${newCount}].email — nothing to send.`);
      return;
    }

    await sendMail({
      to: nextApprover.email,
      subject: `Approval needed: ${after.fileName ?? "A document"} (${after.submitter?.company ?? ""})`,
      html: baseEmailHtml({
        heading: "A document needs your approval",
        bodyHtml: `
          <p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.5;">
            <strong>${fullName(after.submitter)}</strong> at <strong>${after.submitter?.company ?? ""}</strong>
            submitted <strong>${after.fileName ?? "a document"}</strong>. It's now been approved by
            ${newCount} of ${total} approver${total === 1 ? "" : "s"}, and you're next.
          </p>
          ${formatDeadlineBlock(after.requiredBy)}
          <p style="margin:0;font-size:13px;color:#666;">Sign in with <strong>${nextApprover.email}</strong> to review it.</p>
        `,
        ctaUrl: APPROVER_PORTAL_URL.value(),
        ctaLabel: "Review and approve",
      }),
    });
  }
);
