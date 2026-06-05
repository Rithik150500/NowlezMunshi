import { asCnr, asOrderId, type FetchedCase } from "@nowlez/contracts";

/** A single deterministic sample case used to seed the mock source. */
export const SAMPLE_CNR = asCnr("KLER010012342026");

export const sampleFetchedCase: FetchedCase = {
  cnr: SAMPLE_CNR,
  court: {
    stateOrHighCourt: "Kerala",
    districtOrBench: "Ernakulam",
    court: "Principal District & Sessions Court",
  },
  details: {
    parties: "Sample Petitioner vs Sample Respondent",
    caseType: "OS",
    caseNumber: "1234",
    year: 2026,
    status: "Pending",
    nextHearingDate: "2026-06-20",
  },
  orders: [
    {
      id: asOrderId("KLER010012342026-O1"),
      pdf: { uri: "mock://orders/KLER010012342026-O1.pdf", contentType: "application/pdf" },
      date: "2026-05-30",
    },
  ],
};
