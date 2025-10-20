#!/usr/bin/env node
/**
 * Version synchronization script for TeknoLogger
 * Keeps package.json and frontend JavaScript versions in sync
 */

const fs = require('fs');
const path = require('path');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

// Update frontend JavaScript version
const appJsPath = path.join('public', 'js', 'app.js');
let appJsContent = fs.readFileSync(appJsPath, 'utf8');

// Replace the version constant
const versionRegex = /const TEKNO_LOGGER_VERSION = '[^']+'/;
const newVersionLine = `const TEKNO_LOGGER_VERSION = '${version}'`;

if (versionRegex.test(appJsContent)) {
    appJsContent = appJsContent.replace(versionRegex, newVersionLine);
    fs.writeFileSync(appJsPath, appJsContent);
    console.log(`✅ Updated frontend version to ${version}`);
} else {
    console.error('❌ Could not find version constant in app.js');
    process.exit(1);
}

console.log(`🚀 All versions synchronized to ${version}`);