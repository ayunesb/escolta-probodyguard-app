/* global __dirname */
// Configuracion estandar de Expo. Antes envolvia el config con withRorkMetro
// de @rork-ai/toolkit-sdk; se retiro para que el proyecto no dependa de Rork.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const fs = require('fs');
const path = require('path');
// Support dependencies shared by an isolated Git worktree.
const modules = fs.realpathSync(path.join(__dirname, 'node_modules'));
if (modules !== path.join(__dirname, 'node_modules')) config.watchFolders = [...(config.watchFolders || []), modules];
const firebaseModules = new Set(['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database', 'firebase/storage', 'firebase/functions']);
if (process.env.EXPO_PUBLIC_DEMO_MODE === '1') {
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && moduleName.startsWith('firebase/')) {
      if (!firebaseModules.has(moduleName)) throw new Error(`Unsupported Firebase module in public demo: ${moduleName}`);
      return { type: 'sourceFile', filePath: path.join(__dirname, 'demo/firebase.js') };
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}
module.exports = config;
