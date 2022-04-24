// import { StorageProvider } from './storage/interface';
import { ImplicitResponseType, RedirectResponseMode } from './types';

export interface IDToken {
  sub: string;
  username: string;
}

export interface AccessToken {
  scopes: string[];
}

export interface AuthingSPAInitOptions {
  domain: string; // 必须填用户池域名！
  appId: string;
  // redirectUri: string;
  scope?: string;
  redirectToOriginalUri?: boolean;
  // idpPublicKey?: string;
  redirectResponseMode?: RedirectResponseMode;
  useImplicitMode?: boolean;
  implicitResponseType?: ImplicitResponseType;
  // transactionStorageProvider?: StorageProvider<LoginTransaction>;
  // loginStateStorageProvider?: StorageProvider<LoginState>;
  popupWidth?: number;
  popupHeight?: number;
}

export interface LoginState {
  accessToken?: string;
  idToken?: string;
  parsedIdToken?: IDToken;
  parsedAccessToken?: AccessToken;
  expireAt?: number;
  timestamp: number;
}

export interface LoginStateWithCustomStateData extends LoginState {
  customState?: any;
}

export interface LoginTransaction {
  codeVerifier?: string;
  state: string;
  nonce: string;
  redirectUri: string;
  originalUri?: string;
  customState?: any;
}

export interface AuthzURLParams {
  redirect_uri: string;
  response_type: string;
  response_mode: string;
  client_id: string;
  state: string;
  nonce: string;
  scope: string;
  prompt?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256';
}

export interface LogoutURLParams {
  post_logout_redirect_uri?: string;
  id_token_hint?: string;
  state?: string;
}

export interface PKCETokenParams {
  grant_type: 'authorization_code';
  client_id: string;
  code: string;
  code_verifier: string;
  redirect_uri: string;
}

export interface OIDCTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
}

export interface OIDCWebMessageResponse {
  code?: string;
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  error?: string;
  errorDesc?: string;
  state?: string;
}

export interface UserInfo extends Record<string, any> {
  sub: string;
  name: string;
  nickname: string;
  given_name: string;
  family_name: string;
  birthdate: string;
  gender: 'M' | 'F' | 'U';
  picture: string;
  updated_at: string;
  zoneinfo: string;
  preferred_username: string;
  locale: string;
}

export interface IDToken extends UserInfo {
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  iss: string;
  nonce: string;
  at_hash: string;
  s_hash: string;
}

export interface AccessToken {
  jti: string;
  sub: string;
  iat: number;
  exp: number;
  scope: string;
  iss: string;
  aud: string;
}
