# Change Log
## v0.7.0
- Use prisma as databse ORM, now support PostgreSQL, SQLite, etc.
- Change License to Apache 2.0

## v0.6.0
- Backend switched to the better-sqlite library
- Fixed bugs

## v0.5.0
- New feature: Automatically lookup for invoiced/uninvoiced details
- New feature: Batch edit record in inbound and outbound table
- New feature: One-Click DB Backup
- Fixed the messy issue with the invoice and receipt fields
- Chore: update npm packages

## v0.4.3
- Replace the UI Text "Stock" with Inventory
- Enable ESBuild minification in the backend
- Fully customizable export filenames
- Fully customizable currency unit ($, ¥, €, ..)

## v0.4.2
- Refactor the backend by removing redundancy, changing all comments in the utils function to English

## v0.4.1
- Upgrade Vite to 7.1.12, which includes several critical bug fixes.

## v0.4.0
- Refactored the backend using TypeScript ESM standards, with all import paths written as path aliases.
- Refactored build scripts, using esbuild to bundle the backend
- Example GitHub Actions script

## v0.3.0
- Refactored most of the backend code using TypeScript, ESM standard
- Feature: Dockerfile
- Feature: A complete build script that can directly generate a full package containing all required node_modules for execution.

## v0.2.0
- Refactored frontend by using typescript, React Rounter 7
- Refactored PM2 Scripts
- Refactored Docs
- Upgrade Packages

## v0.1.2
- Removed https components, now please use Nginx to enable HTTPS.
- Some UI fixes
- Open Sourced DevOps Build Script