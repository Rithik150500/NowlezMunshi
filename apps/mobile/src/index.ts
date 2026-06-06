/**
 * @nowlez/mobile — the mobile app's data layer (interfaces.md#mobile-application). The two tabs
 * the spec names, **CASES** and **MUNSHI**, are modelled here as a framework-agnostic view-model
 * over the HTTP API ([NowlezClient]); a thin React Native shell renders it (see README). Keeping
 * the data layer free of the RN runtime lets it be typechecked and tested in CI.
 */
import { NowlezClient, type NowlezClientOptions } from "./client";

export { type MunshiReply, NowlezClient, type NowlezClientOptions } from "./client";

/** The CASES tab: the caseload, alerts, the daily cause list, and case discovery. */
export interface CasesTab {
  list: NowlezClient["listCases"];
  add: NowlezClient["addCase"];
  open: NowlezClient["getCase"];
  setTracking: NowlezClient["setTracking"];
  alerts: NowlezClient["listAlerts"];
  markAlertRead: NowlezClient["markAlertRead"];
  causeList: NowlezClient["causeList"];
  searchByParty: NowlezClient["searchByParty"];
  searchByCaseNumber: NowlezClient["searchByCaseNumber"];
  fileDownloadUrl: NowlezClient["fileDownloadUrl"];
}

/** The MUNSHI tab: the assistant chat. */
export interface MunshiTab {
  ask: NowlezClient["askMunshi"];
}

export interface MobileApp {
  readonly cases: CasesTab;
  readonly munshi: MunshiTab;
}

/** Build the two-tab mobile app over the HTTP API. The RN shell renders these. */
export function createMobileApp(options: NowlezClientOptions = {}): MobileApp {
  const client = new NowlezClient(options);
  return {
    cases: {
      list: () => client.listCases(),
      add: (cnr) => client.addCase(cnr),
      open: (cnr) => client.getCase(cnr),
      setTracking: (cnr, tracking) => client.setTracking(cnr, tracking),
      alerts: () => client.listAlerts(),
      markAlertRead: (id) => client.markAlertRead(id),
      causeList: (date) => client.causeList(date),
      searchByParty: (query) => client.searchByParty(query),
      searchByCaseNumber: (query) => client.searchByCaseNumber(query),
      fileDownloadUrl: (id) => client.fileDownloadUrl(id),
    },
    munshi: {
      ask: (message) => client.askMunshi(message),
    },
  };
}
