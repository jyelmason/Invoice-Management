import { APPROVERS } from "./approvers";

// ─── Preset approval chains ──────────────────────────────────────────────────
// Configure the standard, ordered approver chain for each company + document
// type combination. Emails must exactly match entries in approvers.js.
//
// If a company has no chain configured for a given document type, DEFAULT_CHAINS
// below is used as a fallback so every combination still resolves to something.

export const APPROVAL_CHAINS = {
  MLP: {
    proposal: [
      "lmdc@nls.solutions",   // Head of Procurement
      "WBuckley@DLBASSOCIATES.com", // VP of Operations
      "mrann@beowulfed.com",      // CFO
    ],
    invoice: [
      "WBuckley@DLBASSOCIATES.com",  // Director of Finance
      "mrann@beowulfed.com",      // CFO
    ],
  },

  "DLB Associates": {
    proposal: [
      "lmdc@nls.solutions",
      "CTilghman@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
    ],
    invoice: [
      "jyel.mason@gmail.com",
      "jmason@dlbassociates.com",
    ],
  },

  Ramboll: {
    proposal: [
      "lmdc@nls.solutions",
      "CTilghman@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
    ],
    invoice: [
      "CTilghman@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
    ],
  },

  "O\'Connell Electric": {
    proposal: [
      "lmdc@nls.solutions",
      "CMcCormack@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
    ],
    invoice: [
      "CMcCormack@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
    ],
  },

  Danforth: {
    proposal: [
      "lmdc@nls.solutions",
      "WBuckley@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
    ],
    invoice: [
      "amanda.torres@yourcompany.com",
      "mrann@beowulfed.com",
    ],
  },

  "Mader Construction": {
    proposal: [
      "lmdc@nls.solutions",
      "SDoherty@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
    ],
    invoice: [
      "SDoherty@DLBASSOCIATES.com",
      "mrann@beowulfed.com",
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
