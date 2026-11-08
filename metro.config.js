const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// 1. Dukungan file WebAssembly (.wasm) untuk expo-sqlite di web
config.resolver.assetExts.push('wasm');

// 2. Header Cross-Origin untuk mengaktifkan SharedArrayBuffer di browser (Web)
const prevEnhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const customMiddleware = (req, res, next) => {
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      return middleware(req, res, next);
    };
    return prevEnhanceMiddleware
      ? prevEnhanceMiddleware(customMiddleware, server)
      : customMiddleware;
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
