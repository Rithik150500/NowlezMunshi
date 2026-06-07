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

/** The login gate (ADR-0019): the three sign-in methods + session lifecycle the RN shell renders. */
export interface AuthApi {
  register: NowlezClient["register"];
  loginWithPassword: NowlezClient["loginWithPassword"];
  requestOtp: NowlezClient["requestOtp"];
  verifyOtp: NowlezClient["verifyOtp"];
  loginWithGoogle: NowlezClient["loginWithGoogle"];
  me: NowlezClient["me"];
  logout: NowlezClient["logout"];
  /** The current session token, if signed in (persist it across launches). */
  token: () => string | undefined;
}

export interface MobileApp {
  readonly auth: AuthApi;
  readonly cases: CasesTab;
  readonly munshi: MunshiTab;
}

/** Build the mobile app (login gate + two tabs) over the HTTP API. The RN shell renders these. */
export function createMobileApp(options: NowlezClientOptions = {}): MobileApp {
  const client = new NowlezClient(options);
  return {
    auth: {
      register: (input) => client.register(input),
      loginWithPassword: (email, password) => client.loginWithPassword(email, password),
      requestOtp: (phone) => client.requestOtp(phone),
      verifyOtp: (phone, code) => client.verifyOtp(phone, code),
      loginWithGoogle: (idToken) => client.loginWithGoogle(idToken),
      me: () => client.me(),
      logout: () => client.logout(),
      token: () => client.getToken(),
    },
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
