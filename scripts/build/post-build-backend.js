const fs = require("fs-extra");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const r = (...p) => path.resolve(root, ...p);

// Ensure dist exists
fs.ensureDirSync(r("dist"));

// Move the single bundled server.js to dist root
const srcServer = r("backend/dist/");
const dstServer = r("dist/backend");
if (!fs.pathExistsSync(srcServer)) {
	console.error(`ERROR: Bundled file not found: ${srcServer}`);
	process.exit(1);
}
fs.moveSync(srcServer, dstServer, { overwrite: true });

// Copy backend package.json to dist and normalize start script
const srcPkg = r("backend/scripts/package.json");
const dstPkg = r("dist/package.json");
fs.copySync(srcPkg, dstPkg);

// Copy prisma directory
const srcPrisma = r("backend/prisma");
const dstPrisma = r("dist/prisma");
if (fs.pathExistsSync(srcPrisma)) {
    fs.copySync(srcPrisma, dstPrisma);
}