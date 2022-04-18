import axios from 'axios';
import {
  DEFAULT_IFRAME_HEIGHT,
  DEFAULT_IFRAME_LOGINSTATE_TIMEOUT,
  DEFAULT_IFRAME_WIDTH,
  DEFAULT_POPUP_HEIGHT,
  DEFAULT_POPUP_WIDTH,
  DEFAULT_SCOPE,
  MSG_CROSS_ORIGIN_ISOLATED,
  MSG_PENDING_AUTHZ,
} from './constants';
import {
  AuthingSPAInitOptions,
  LoginState,
  IDToken,
  AccessToken,
  LoginTransaction,
  AuthzURLParams,
  OIDCResponse,
  PKCETokenParams,
  OIDCTokenResponse,
  LoginStateWithCustomStateData,
} from './global';
import { InMemoryStorageProvider } from './storage/InMemoryStorgeProvider';
import { StorageProvider } from './storage/interface';
import { LocalStorageProvider } from './storage/LocalStorageProvider';
import { NullStorageProvider } from './storage/NullStorageProvider';
import { SessionStorageProvider } from './storage/SessionStorageProvider';
import { MsgListener, NullableStrDict } from './types';
import {
  createQueryParams,
  createRandomString,
  domainC14n,
  genPKCEPair,
  getCrypto,
  getCryptoSubtle,
  isIE,
  loginStateKey,
  transactionKey,
} from './utils';

export class AuthingSPA {
  private globalMsgListener: MsgListener | null | undefined;

  private readonly options: Required<AuthingSPAInitOptions>;
  private readonly loginStateProvider: StorageProvider<LoginState>;
  private readonly transactionProvider: StorageProvider<LoginTransaction>;
  private readonly domain: string;

  constructor(options: AuthingSPAInitOptions) {
    this.options = options as any;
    this.domain = domainC14n(this.options.domain);

    if (!options.useImplicitMode && (!getCrypto() || !getCryptoSubtle())) {
      throw new Error(
        'PKCE 模式需要浏览器 crypto 能力, 请确保浏览器处于 https 域名下，或设置 useImplicitMode 为 true',
      );
    }

    // if (options.loginStateStorageProvider) {
    //   this.loginStateProvider = options.loginStateStorageProvider;
    // } else
    if (typeof localStorage === 'object') {
      this.loginStateProvider = new LocalStorageProvider();
    } else {
      console.warn(
        '您的浏览器版本过低，登录态存储功能将不可用，请实现自定义 loginStateStorageProvider',
      );
      this.loginStateProvider = new InMemoryStorageProvider();
    }

    // if (options.transactionStorageProvider) {
    //   this.transactionProvider = options.transactionStorageProvider;
    // } else
    if (typeof sessionStorage === 'object') {
      this.transactionProvider = new SessionStorageProvider();
    } else {
      if (!options.useImplicitMode) {
        console.warn(
          '您的浏览器版本过低，重定向认证功能将不可用，请实现自定义 transactionStorageProvider 或设置 useImplicitMode 为 true',
        );
      }
      this.transactionProvider = new NullStorageProvider();
    }

    options.implicitResponseType =
      options.implicitResponseType ?? 'token id_token';
    options.redirectResponseMode = options.redirectResponseMode ?? 'fragment';
    options.popupWidth = options.popupWidth ?? DEFAULT_POPUP_WIDTH;
    options.popupHeight = options.popupHeight ?? DEFAULT_POPUP_HEIGHT;
    options.iframeWidth = options.iframeWidth ?? DEFAULT_IFRAME_WIDTH;
    options.iframeHeight = options.iframeHeight ?? DEFAULT_IFRAME_HEIGHT;
    options.scope = options.scope ?? DEFAULT_SCOPE;
  }

  /**
   * 按顺序用以下方式获取用户登录态：
   *
   * 1. 本地缓存获取
   * 2. 隐藏 iframe 获取
   *
   * @param options.ignoreCache 忽略本地缓存，强制用 iframe 获取
   */
  async getLoginState(
    options: {
      ignoreCache?: boolean;
    } = {},
  ): Promise<null | LoginState> {
    // 1. 从 loginStateProvider 中（默认为 localStorage）获取
    if (!options.ignoreCache) {
      const state = this.loginStateProvider.get(
        loginStateKey(this.options.appId),
      );
      if (state) {
        return state;
      }
    }

    // 2. 用隐藏 iframe 获取
    if (this.globalMsgListener !== undefined) {
      throw new Error(MSG_PENDING_AUTHZ);
    }
    this.globalMsgListener = null;

    if (window.crossOriginIsolated) {
      // 如果是 crossOriginIsolated 就发不了 postMessage 了
      console.warn('当前页面运行在隔离模式下，无法获取登录态');
      return null;
    }

    const state = createRandomString(16);
    const nonce = createRandomString(16);
    let codeVerifier: string | undefined;

    const params: AuthzURLParams = {
      redirect_uri: window.location.href,
      response_mode: 'web_message',
      response_type: this.options.useImplicitMode
        ? this.options.implicitResponseType
        : 'code',
      client_id: this.options.appId,
      state,
      nonce,
      prompt: 'none',
      scope: this.options.scope,
    };

    if (!this.options.useImplicitMode) {
      const { codeChallenge, codeVerifier: v } = await genPKCEPair();
      codeVerifier = v;
      params.code_challenge = codeChallenge;
      params.code_challenge_method = 'S256';
    }

    const iframe = document.createElement('iframe');
    // iframe.title = 'postMessage() Initiator';
    iframe.hidden = true;
    iframe.width = iframe.height = '0';

    iframe.src = `${this.domain}/oidc/auth?${createQueryParams(params)}`;
    if (isIE()) {
      document.body.appendChild(iframe);
    } else {
      document.body.append(iframe);
    }

    const res = await Promise.race([
      this.listenToPostMessage(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), DEFAULT_IFRAME_LOGINSTATE_TIMEOUT),
      ),
    ]);
    this.clearMessageListener();
    iframe.remove();

    if (res === null) {
      console.warn(`登录态获取超时`);
      return null;
    }

    if (res.error) {
      if (res.error !== 'login_required') {
        console.warn(
          `登录态获取失败，认证服务器返回错误: error=${res.error}, error_description=${res.errorDesc}`,
        );
      } else {
        console.info('用户未登录');
      }
      return null;
    }

    if (res.state !== state) {
      throw new Error('state 验证失败');
    }

    return this.handleSuccessfulOIDCResponse(
      res,
      window.location.href,
      codeVerifier,
    );
  }

  /**
   * 将用户重定向到认证端点进行登录，需要配合 handleRedirectCallback 使用
   *
   * @param options.originalUri 发起登录的 URL，会在登录结束后重定向回到此页面，默认为当前 URL
   * @param options.forced 即使在用户已登录时也提示用户再次登录
   * @param options.customState 自定义的中间状态，会被传递到回调端点
   */
  async loginWithRedirect(
    options: {
      originalUri?: string;
      forced?: boolean;
      customState?: any;
    } = {},
  ): Promise<void> {
    const state = createRandomString(16);
    const nonce = createRandomString(16);

    const params: AuthzURLParams = {
      redirect_uri: this.options.redirectUri,
      response_mode: this.options.redirectResponseMode,
      response_type: this.options.useImplicitMode
        ? this.options.implicitResponseType
        : 'code',
      client_id: this.options.appId,
      ...(options.forced && { prompt: 'login' }),
      state,
      nonce,
      scope: this.options.scope,
    };

    let codeVerifier: string | undefined;
    if (!this.options.useImplicitMode) {
      const { codeChallenge, codeVerifier: v } = await genPKCEPair();
      params.code_challenge = codeChallenge;
      params.code_challenge_method = 'S256';
      codeVerifier = v;
    }

    await this.transactionProvider.put(
      transactionKey(this.options.appId, state),
      {
        codeVerifier,
        state,
        ...(this.options.redirectToOriginalUri && {
          originalUri: options.originalUri ?? window.location.href,
        }),
        ...(options.customState && { customState: options.customState }),
      },
    );

    window.location.replace(
      `${this.domain}/oidc/auth?${createQueryParams(params)}`,
    );
  }

  /**
   * 判断当前 URL 是否为 OIDC 回调 URL
   */
  isRedirectCallback(): boolean {
    const params = this.resolveCallbackParams();

    if (!params) {
      return false;
    }

    if (params['error']) {
      return true;
    }

    if (this.options.useImplicitMode) {
      return !!(params['access_token'] || params['id_token']);
    } else {
      return !!params['code'];
    }
  }

  /**
   * 在回调端点处理 Authing 发送的授权码或 token，获取用户登录态
   */
  async handleRedirectCallback(): Promise<LoginStateWithCustomStateData> {
    const paramDict = this.resolveCallbackParams();
    if (!paramDict) {
      throw new Error('非法的回调 URL');
    }

    if (paramDict.error) {
      throw new Error(
        `认证失败, error=${paramDict.error}, error_description=${paramDict.error_description}`,
      );
    }

    let originalUri: string | undefined;
    let customState: any;

    const { state } = paramDict;
    if (!state) {
      throw new Error('非法的回调 URL: 缺少 state');
    }
    const tx = await this.transactionProvider.get(
      transactionKey(this.options.appId, state),
    );
    if (tx) {
      await this.transactionProvider.delete(
        transactionKey(this.options.appId, state),
      );

      if (tx.state !== state) {
        throw new Error('state 验证失败');
      }

      originalUri = tx.originalUri;
      customState = tx.customState;
      if (!this.options.useImplicitMode) {
        // PKCE code flow
        const { code } = paramDict;
        if (!code) {
          throw new Error('非法的回调 URL: 缺少 code');
        }
        const res = await this.exchangeToken(
          code,
          this.options.redirectUri,
          tx.codeVerifier as string,
        );

        if (this.options.redirectToOriginalUri && originalUri) {
          window.location.replace(originalUri);
        }

        return res;
      }
    } else if (!this.options.useImplicitMode) {
      throw new Error(
        '获取登录流程会话失败, 请确认浏览器是否支持 sessionStorage, 或检查自定义 transactionProvider 实现',
      );
    }

    // implicit flow
    const idToken = paramDict.id_token;
    const accessToken = paramDict.access_token;

    if (
      (this.options.implicitResponseType.includes('token') && !accessToken) ||
      (this.options.implicitResponseType.includes('id_token') && !idToken)
    ) {
      throw new Error('非法的回调 URL: 缺少 token');
    }

    const result = await this.saveLoginState({
      idToken,
      accessToken,
      timestamp: Date.now(),
    });

    if (this.options.redirectToOriginalUri && originalUri) {
      window.location.replace(originalUri);
    }

    return { ...result, customState };
  }

  /**
   * 弹出一个新的登录页面窗口，在其中完成登录
   *
   * @param options.forced 即使在用户已登录时也提示用户再次登录
   */
  async loginWithPopup(
    options: { forced?: boolean } = {},
  ): Promise<LoginState | null> {
    if (this.globalMsgListener !== undefined) {
      throw new Error(MSG_PENDING_AUTHZ);
    }
    this.globalMsgListener = null;

    if (window.crossOriginIsolated) {
      // 如果是 crossOriginIsolated 就发不了 postMessage 了
      throw new Error(MSG_CROSS_ORIGIN_ISOLATED);
    }

    const state = createRandomString(16);
    const nonce = createRandomString(16);

    const params: AuthzURLParams = {
      redirect_uri: window.location.href,
      response_mode: 'web_message',
      response_type: this.options.useImplicitMode
        ? this.options.implicitResponseType
        : 'code',
      client_id: this.options.appId,
      state,
      nonce,
      ...(options.forced && { prompt: 'login' }),
      scope: this.options.scope,
    };

    let codeVerifier: string | undefined;
    if (!this.options.useImplicitMode) {
      const { codeChallenge, codeVerifier: v } = await genPKCEPair();
      codeVerifier = v;
      params.code_challenge = codeChallenge;
      params.code_challenge_method = 'S256';
    }

    const url = `${this.domain}/oidc/auth?${createQueryParams(params)}`;
    const win = window.open(
      url,
      'authing-spa-login-window',
      `popup,width=${this.options.popupWidth},height=${this.options.popupHeight}`,
    );
    if (!win) {
      throw new Error('弹出窗口失败');
    }

    const res = await Promise.race([
      this.listenToPostMessage(),
      new Promise<null>((resolve) => {
        const handle = setInterval(() => {
          if (win.closed) {
            clearInterval(handle);
            // 防止 post message 事件和 close 事件同时到达
            setTimeout(() => resolve(null), 500);
          }
        }, 500);
      }),
    ]);
    this.clearMessageListener();

    if (!res) {
      // 窗口被用户关闭了
      return null;
    }

    if (res.error) {
      throw new Error(
        `登录失败，认证服务器返回错误: error=${res.error}, error_description=${res.errorDesc}`,
      );
    }

    if (res.state !== state) {
      throw new Error('state 验证失败');
    }

    return this.handleSuccessfulOIDCResponse(
      res,
      window.location.href,
      codeVerifier,
    );
  }

  /**
   * 在指定的元素中增加一个 iframe 登录页面，在其中完成登录
   *
   * 注意: 当手动移除 iframe 时，必须同时调用 clearMessageListener 方法！
   *
   * @param options.forced 即使在用户已登录时也提示用户再次登录
   */
  async loginWithIframe(
    rootElem: HTMLElement,
    options: { forced?: boolean } = {},
  ): Promise<LoginState> {
    if (this.globalMsgListener !== undefined) {
      throw new Error(MSG_PENDING_AUTHZ);
    }
    this.globalMsgListener = null;

    if (window.crossOriginIsolated) {
      // 如果是 crossOriginIsolated 就发不了 postMessage 了
      throw new Error(MSG_CROSS_ORIGIN_ISOLATED);
    }

    const state = createRandomString(16);
    const nonce = createRandomString(16);
    let codeVerifier: string | undefined;

    const params: AuthzURLParams = {
      redirect_uri: window.location.href,
      response_mode: 'web_message',
      response_type: this.options.useImplicitMode
        ? this.options.implicitResponseType
        : 'code',
      client_id: this.options.appId,
      state,
      nonce,
      ...(options.forced && { prompt: 'login' }),
      scope: this.options.scope,
    };

    if (!this.options.useImplicitMode) {
      const { codeChallenge, codeVerifier: v } = await genPKCEPair();
      codeVerifier = v;
      params.code_challenge = codeChallenge;
      params.code_challenge_method = 'S256';
    }

    const iframe = document.createElement('iframe');
    // iframe.title = 'postMessage() Initiator';
    iframe.width = this.options.iframeWidth.toString();
    iframe.height = this.options.iframeHeight.toString();

    iframe.src = `${this.domain}/oidc/auth?${createQueryParams(params)}`;
    if (isIE()) {
      rootElem.appendChild(iframe);
    } else {
      rootElem.append(iframe);
    }

    const res = (await this.listenToPostMessage()) as OIDCResponse;
    this.clearMessageListener();
    iframe.remove();

    if (res.error) {
      throw new Error(
        `登录失败，认证服务器返回错误: error=${res.error}, error_description=${res.errorDesc}`,
      );
    }

    if (res.state !== state) {
      throw new Error('state 验证失败');
    }

    return this.handleSuccessfulOIDCResponse(
      res,
      window.location.href,
      codeVerifier,
    );
  }

  /**
   * 移除 SDK 注册的 Post Message 监听器
   */
  async clearMessageListener() {
    if (this.globalMsgListener) {
      window.removeEventListener('message', this.globalMsgListener);
    }
    this.globalMsgListener = undefined;
  }

  // async logoutWithAjax() { }

  // async logoutWithHiddenIframe(options: {
  //   timeout?: number;
  // }) { }

  // async logoutWithRedirect(options: { redirectUri?: string }) {}

  /**
   * 解析 ID Token 中的用户信息
   * @param idToken
   */
  async parseIdToken(_idToken: string): Promise<IDToken> {
    throw new Error('not impled');
  }

  /**
   * 解析 ID Token 中的用户信息
   * @param accessToken
   */
  async parseAccessToken(_accessToken: string): Promise<AccessToken> {
    throw new Error('not impled');
  }

  // TODO: Access Token, ID Token 验证

  private async listenToPostMessage() {
    return new Promise<OIDCResponse>((resolve, reject) => {
      const msgEventListener = (msgEvent: MessageEvent) => {
        if (
          msgEvent.origin !== this.domain ||
          msgEvent.data?.type !== 'authorization_response'
        ) {
          return;
        }

        window.removeEventListener('message', msgEventListener);
        this.globalMsgListener = undefined;

        const { response } = msgEvent.data;

        if (!response) {
          reject(new Error('认证服务器无返回结果'));
        }

        if (response.error) {
          return resolve({
            error: response.error,
            errorDesc: response.error_description,
          });
        }

        return resolve({
          accessToken: response.access_token,
          idToken: response.id_token,
          refreshToken: response.refresh_token,
          code: response.code,
          state: response.state,
        });
      };

      this.globalMsgListener = msgEventListener;
      window.addEventListener('message', msgEventListener);
    });
  }

  private async saveLoginState(data: LoginState) {
    await this.loginStateProvider.put(loginStateKey(this.options.appId), data);
    return data;
  }

  private async exchangeToken(
    code: string,
    redirectUri: string,
    codeVerifier: string,
  ) {
    const tokenParam: PKCETokenParams = {
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier as string,
      client_id: this.options.appId,
      redirect_uri: redirectUri,
    };

    const { data: tokenRes } = (await axios.post(
      `${this.domain}/oidc/token`,
      createQueryParams(tokenParam),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    )) as { data: OIDCTokenResponse };

    return this.saveLoginState({
      accessToken: tokenRes.access_token,
      idToken: tokenRes.id_token,
      timestamp: Date.now(),
    });
  }

  private async handleSuccessfulOIDCResponse(
    res: OIDCResponse,
    // 只有 PKCE 会用下面两个参数
    redirectUri?: string,
    codeVerifier?: string,
  ) {
    if (this.options.useImplicitMode) {
      // implicit flow
      if (
        (this.options.implicitResponseType.includes('token') &&
          typeof res.accessToken !== 'string') ||
        (this.options.implicitResponseType.includes('id_token') &&
          typeof res.idToken !== 'string')
      ) {
        throw new Error('无效的 Token 返回值');
      }

      return this.saveLoginState({
        accessToken: res.accessToken,
        idToken: res.idToken,
        timestamp: Date.now(),
      });
    }

    // PKCE code flow
    if (typeof res.code !== 'string') {
      throw new Error('无效的 Code 返回值');
    }

    if (!redirectUri || !codeVerifier) {
      // should never happen
      throw new Error();
    }

    return this.exchangeToken(res.code, redirectUri, codeVerifier);
  }

  private resolveCallbackParams() {
    const paramSource: string =
      this.options.redirectResponseMode === 'fragment'
        ? window.location.hash
        : window.location.search;
    if (!paramSource) {
      return null;
    }

    const paramDict: NullableStrDict = Object.create(null);
    paramSource
      .substring(1)
      .split('&')
      .forEach((item) => {
        const [key, val] = item.split('=');
        paramDict[key] = val;
      });

    return paramDict;
  }
}
