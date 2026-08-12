
const { onDocumentUpdated, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineString } = require("firebase-functions/params");
const nodemailer = require("nodemailer");
const REGION = "us-central1";

// ─── Set these as runtime env vars / secrets in the GCP Console ─────────────
const SENDGRID_API_KEY    = defineString("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = defineString("SENDGRID_FROM_EMAIL");

// Optional: your own personal inbox, BCC'd on every notification email sent
// by this app (approver requests + submitter completion notices). Leave
// unset and nothing extra happens — this is purely additive oversight.
const MASTER_NOTIFY_EMAIL = defineString("MASTER_NOTIFY_EMAIL", { default: "" });

// ─── Your Vercel app URL ─────────────────────────────────────────────────────
const APP_BASE_URL = "https://app.dlb-approvals.com/"; // ← replace with your Vercel URL

// ─── Email transporter ───────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    auth: {
      user: "apikey",
      pass: SENDGRID_API_KEY.value(),
    },
  });
}

// Adds a bcc field only if MASTER_NOTIFY_EMAIL is actually set — keeps this
// fully optional and a no-op if you never configure it.
function withMasterBcc(mailOptions) {
  const notify = MASTER_NOTIFY_EMAIL.value();
  return notify ? { ...mailOptions, bcc: notify } : mailOptions;
}

// ─── Email templates ─────────────────────────────────────────────────────────
function approverEmailHtml({ approverName, submitterName, company, fileName, approveUrl }) {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #2c2c2a;">
      <h2 style="font-size: 20px; font-weight: 500; margin: 0 0 8px;">
        Document awaiting your approval
      </h2>
      <p style="font-size: 14px; color: #5f5e5a; margin: 0 0 24px;">
        Hi ${approverName}, you have been requested to review and approve a document.
      </p>

      <div style="background: #f1efe8; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
        <table style="width: 100%; font-size: 13px;">
          <tr>
            <td style="color: #888780; padding: 4px 0;">Submitted by</td>
            <td style="font-weight: 500; text-align: right;">${submitterName}</td>
          </tr>
          <tr>
            <td style="color: #888780; padding: 4px 0;">Company</td>
            <td style="font-weight: 500; text-align: right;">${company}</td>
          </tr>
          <tr>
            <td style="color: #888780; padding: 4px 0;">Document</td>
            <td style="font-weight: 500; text-align: right;">${fileName}</td>
          </tr>
        </table>
      </div>

      <a href="${approveUrl}"
        style="display: inline-block; background: #639922; color: #fff;
               text-decoration: none; padding: 11px 28px; border-radius: 8px;
               font-size: 14px; font-weight: 500;">
        Review &amp; approve →
      </a>

      <p style="font-size: 12px; color: #888780; margin: 24px 0 0;">
        Or copy this link into your browser:<br/>
        <span style="color: #378add;">${approveUrl}</span>
      </p>
    </div>
  `;
}

function completionEmailHtml({ submitterName, company, fileName, approvers, total }) {
  const approverRows = approvers
    .map((a, i) => `
      <tr>
        <td style="color: #888780; padding: 4px 0;">Approver ${i + 1}</td>
        <td style="font-weight: 500; text-align: right;">${a.name}</td>
      </tr>`)
    .join("");

  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #2c2c2a;">
      <h2 style="font-size: 20px; font-weight: 500; margin: 0 0 8px;">
        Your document has been fully approved
      </h2>
      <p style="font-size: 14px; color: #5f5e5a; margin: 0 0 24px;">
        Hi ${submitterName}, all ${total} approver${total === 1 ? "" : "s"} have reviewed and approved
        your document from ${company}.
      </p>

      <div style="background: #f1efe8; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
        <table style="width: 100%; font-size: 13px;">
          <tr>
            <td style="color: #888780; padding: 4px 0;">Document</td>
            <td style="font-weight: 500; text-align: right;">${fileName}</td>
          </tr>
          ${approverRows}
        </table>
      </div>

      <p style="font-size: 12px; color: #888780; margin: 0;">
        This is an automated confirmation. No further action is needed.
      </p>
    </div>
  `;
}

// ─── Trigger 1: New approval created → email Approver 1 ──────────────────────
exports.onApprovalCreated = onDocumentCreated({document: "approvals/{docId}", region: REGION} ,async event => {
  const data  = event.data.data();
  const docId = event.params.docId;

  if (!data.approvers?.length) return;

  const firstApprover = data.approvers[0];
  const submitterName = `${data.submitter.firstName} ${data.submitter.lastName}`;

  try {
    await createTransporter().sendMail(withMasterBcc({
      from:    `"Document Approval" <${SENDGRID_FROM_EMAIL.value()}>`,
      to:      firstApprover.email,
      subject: `Action required: approve "${data.fileName}"`,
      html:    approverEmailHtml({
        approverName:  firstApprover.name,
        submitterName,
        company:       data.submitter.company,
        fileName:      data.fileName,
        approveUrl:    `${APP_BASE_URL}/approve`,
      }),
    }));
    console.log(`Emailed approver 1 (${firstApprover.email}) for doc ${docId}`);
  } catch (err) {
    console.error("Failed to send email:", err);
  }
});

// ─── Trigger 2: approvedCount changed → email next approver or submitter ─────
exports.onApprovalUpdated = onDocumentUpdated({document: "approvals/{docId}", region: REGION}, async event => {
  const before = event.data.before.data();
  const after  = event.data.after.data();
  const docId  = event.params.docId;

  const prevCount = before.approvedCount ?? 0;
  const newCount  = after.approvedCount  ?? 0;

  if (newCount <= prevCount) return;

  const total = after.approverCount ?? after.approvers?.length ?? 0;

  const submitterName = `${after.submitter.firstName} ${after.submitter.lastName}`;

  try {
    if (newCount < total) {
      const nextApprover = after.approvers[newCount];
      if (!nextApprover?.email) {
        console.error(`Doc ${docId}: no approver at index ${newCount} (total=${total}) — skipping.`);
        return;
      }
      await createTransporter().sendMail(withMasterBcc({
        from:    `"Document Approval" <${SENDGRID_FROM_EMAIL.value()}>`,
        to:      nextApprover.email,
        subject: `Action required: approve "${after.fileName}"`,
        html:    approverEmailHtml({
          approverName:  nextApprover.name,
          submitterName,
          company:       after.submitter.company,
          fileName:      after.fileName,
          approveUrl:    `${APP_BASE_URL}/approve`,
        }),
      }));
      console.log(`Emailed approver ${newCount + 1} (${nextApprover.email}) for doc ${docId}`);
    } else {
      await createTransporter().sendMail(withMasterBcc({
        from:    `"Document Approval" <${SENDGRID_FROM_EMAIL.value()}>`,
        to:      after.submitter.email,
        subject: `"${after.fileName}" has been fully approved`,
        html:    completionEmailHtml({
          submitterName,
          company:   after.submitter.company,
          fileName:  after.fileName,
          approvers: after.approvers,
          total,
        }),
      }));
      console.log(`Emailed submitter (${after.submitter.email}) — all done for doc ${docId}`);
    }
  } catch (err) {
    console.error("Failed to send email:", err);
  }
});
