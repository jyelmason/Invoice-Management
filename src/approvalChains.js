import { APPROVERS } from "./approvers";

// ─── Preset approval chains ──────────────────────────────────────────────────
// Configure the standard, ordered approver chain for each company + document
// type combination. Emails must exactly match entries in approvers.js.
//
// If a company has no chain configured for a given document type, DEFAULT_CHAINS
// below is used as a fallback so every combination still resolves to something.

export const APPROVAL_CHAINS = {
  FluidStack: {
    proposal: [
      "marcus.chen@yourcompany.com",   // Head of Procurement
      "sarah.mitchell@yourcompany.com", // VP of Operations
      "derek.lau@yourcompany.com",      // CFO
    ],
    invoice: [
      "amanda.torres@yourcompany.com",  // Director of Finance
      "derek.lau@yourcompany.com",      // CFO
    ],
  },

  Terawulf: {
    proposal: [
      "sarah.mitchell@yourcompany.com",
      "james.okafor@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
    invoice: [
      "amanda.torres@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
  },

  "DLB Associates": {
    proposal: [
      "marcus.chen@yourcompany.com",
      "priya.sharma@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
    invoice: [
      "amanda.torres@yourcompany.com",
      "marcus.chen@yourcompany.com",
    ],
  },

  Ramboll: {
    proposal: [
      "james.okafor@yourcompany.com",
      "sarah.mitchell@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
    invoice: [
      "priya.sharma@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
  },

  "Turner Construction": {
    proposal: [
      "marcus.chen@yourcompany.com",
      "sarah.mitchell@yourcompany.com",
      "james.okafor@yourcompany.com",
    ],
    invoice: [
      "amanda.torres@yourcompany.com",
      "marcus.chen@yourcompany.com",
    ],
  },

  Mortenson: {
    proposal: [
      "sarah.mitchell@yourcompany.com",
      "priya.sharma@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
    invoice: [
      "amanda.torres@yourcompany.com",
      "priya.sharma@yourcompany.com",
    ],
  },

  Vertiv: {
    proposal: [
      "marcus.chen@yourcompany.com",
      "james.okafor@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
    invoice: [
      "amanda.torres@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
  },

  "Schneider Electric": {
    proposal: [
      "james.okafor@yourcompany.com",
      "marcus.chen@yourcompany.com",
      "derek.lau@yourcompany.com",
    ],
    invoice: [
      "priya.sharma@yourcompany.com",
      "amanda.torres@yourcompany.com",
    ],
  },
};

// Fallback chain for any company/doc-type combo without a configured chain above.
export const DEFAULT_CHAINS = {
  proposal: [
    "sarah.mitchell@yourcompany.com",
    "james.okafor@yourcompany.com",
    "derek.lau@yourcompany.com",
  ],
  invoice: [
    "amanda.torres@yourcompany.com",
    "derek.lau@yourcompany.com",
  ],
};

// Resolves a preset chain (array of full approver objects, in order) for a
// given company + document type. Falls back to DEFAULT_CHAINS, then to an
// empty array if even that isn't configured for the doc type.
export function getPresetChain(company, docType) {
  const emails =
    APPROVAL_CHAINS[company]?.[docType] ?? DEFAULT_CHAINS[docType] ?? [];

  return emails
    .map((email) =>
      APPROVERS.find((a) => a.email.toLowerCase() === email.toLowerCase())
    )
    .filter(Boolean);
}
