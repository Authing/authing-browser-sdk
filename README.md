# Official SDK of Authing for Browser

<div align=center>
  <img width="250" src="https://files.authing.co/authing-console/authing-logo-new-20210924.svg" />
</div>

<a href="https://badge.fury.io/js/@authing%2Fbrowser" target="_blank"><img src="https://badge.fury.io/js/@authing%2Fbrowser.svg" alt="npm version"></a>
<a href="https://npmcharts.com/compare/@authing/browser" target="_blank"><img src="https://img.shields.io/npm/dm/@authing/browser" alt="download"></a>
<a href="https://forum.authing.cn/" target="_blank"><img src="https://img.shields.io/badge/chat-forum-blue" /></a>
<a href="https://opensource.org/licenses/MIT" target="_blank"><img src="https://img.shields.io/badge/License-MIT-success" alt="License"></a>

**English** | [简体中文](./README.zh-CN.md)

## Introduction

You can use the Authing Browser SDK to quickly integrate authentication capabilities for new or existing web applications

## Documentation

- [React quickly integrates Authing](https://docs.authing.cn/v2/en/quickstarts/spa/react.html)
- [Vue quickly integrates Authing](https://docs.authing.cn/v2/en/quickstarts/spa/vue.html)
- [Angular quickly integrates Authing](https://docs.authing.cn/v2/en/quickstarts/spa/angular.html)
- [Single Sign-On (SSO)](https://docs.authing.cn/v2/en/reference/sdk-for-sso-spa.html)


## Install

### NPM

```bash
$ npm install @authing/browser
```

### Yarn

```bash
$ yarn add @authing/browser
```

### Use script tag

```html
<script src="https://cdn.jsdelivr.net/npm/@authing/browser"></script>
<script>
  const sdk = new Authing({
    // Very important, please fill in carefully!
    // If the application enables SSO, you must write the "App Panel Address" for SSO here;
    // otherwise, fill in the application's "Subdomain".
    domain: "SSO App Panel Address",
    appId: "App ID",
    // The login callback address needs to be specified in the console
    // "Configuration - Authentication Configuration - Login Callback URL"
    redirectUri: "Login Callback URL",
  });
</script>
```


## Demo

- [React Quick Integration Authing Demo](https://github.com/Authing/spa-demo-react)
- [Vue Quick Integration Authing Demo](https://github.com/Authing/spa-demo-vue)
- [Angular Quick Integration Authing Demo](https://github.com/Authing/spa-demo-angular)
- [authing-sso-demo-react](https://github.com/Authing/authing-sso-demo/tree/feat-sso-v3-demo)
- [authing-sso-demo-vue2](https://github.com/Authing/authing-sso-demo/tree/feat-sso-v3-demo-vue2)
- [authing-sso-demo-vue3](https://github.com/Authing/authing-sso-demo/tree/feat-sso-v3-demo-vue3)
- [authing-sso-demo-angular](https://github.com/Authing/authing-sso-demo/tree/feat-sso-v3-demo-angular)


## Contribution

- Fork it
- Create your feature branch (git checkout -b my-new-feature)
- Commit your changes (git commit -am 'Add some feature')
- Push to the branch (git push -u origin my-new-feature)
- Create new Pull Request

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2019-present, Authing
