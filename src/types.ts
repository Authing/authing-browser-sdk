export type StrDict = Record<string, string>;

export type NullableStrDict = Record<string, string | undefined>;

export type RedirectResponseMode = 'fragment' | 'query';

export type ImplicitResponseType = 'token id_token' | 'token' | 'id_token';

export type MayBePromise<T> = T | Promise<T>;

export type MsgListener = (e: MessageEvent<any>) => void;
