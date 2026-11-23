#!/usr/bin/env node
// Reports "override drift": how far each pnpm override in pnpm-workspace.yaml
// pushes a dependency away from what its parents actually declared.
//
// Used by Claude's dependency-remediation SKILL and not normally run by humans.
//
// pnpm applies an override `name@selector: target` to a parent's dependency
// when the parent's declared range *intersects* the selector (see pnpm's
// createVersionsOverrider). When several selectors for the same package
// intersect a parent's range, pnpm picks one and the rest are shadowed. This
// script re-derives that matching from the lockfile plus the installed
// package.json files, then classifies every override so a human can decide
// whether it is still needed, is doing nothing, or is forcing an untested
// combination (a parent running a version it never declared support for).
//
// Usage: node scripts/override-drift.js [--json] [--offline] [--dir <repo>]
//   --json     print machine-readable JSON instead of markdown
//   --offline  skip the registry lookups used to detect redundant overrides
//   NPM_BIN    absolute path to npm, if it is not next to node or in a system dir
//
// Requires a fresh `pnpm install` so node_modules/.pnpm matches the lockfile.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const offline = args.includes('--offline');
const dirFlag = args.indexOf('--dir');
const root = path.resolve(dirFlag >= 0 ? args[dirFlag + 1] : process.cwd());

// Both libraries are already in the pnpm store (transitive deps of the repo),
// so load them from there instead of adding a dependency for a dev script.
function requireFromStore(name, majorPrefix) {
    const storeDir = path.join(root, 'node_modules', '.pnpm');
    const dirs = fs
        .readdirSync(storeDir)
        .filter((d) => d.startsWith(`${name}@${majorPrefix}`))
        .sort()
        .reverse();
    if (!dirs.length) {
        throw new Error(`Could not find ${name}@${majorPrefix}* in ${storeDir}; run pnpm install first.`);
    }
    return require(path.join(storeDir, dirs[0], 'node_modules', name));
}
const semver = requireFromStore('semver', '7');
const yaml = requireFromStore('js-yaml', '4');

// Run `npm view` by absolute path rather than letting execFileSync search a
// user-writable PATH (Sonar S4036). Candidates, in order: an explicit NPM_BIN,
// the npm next to the node running this script (nvm, fnm, volta, Homebrew and
// the official installers all lay it out that way), then fixed system dirs.
function findNpm() {
    const candidates = [
        process.env.NPM_BIN,
        path.join(path.dirname(process.execPath), 'npm'),
        ...['/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin'].map((d) => path.join(d, 'npm')),
    ];
    return candidates.find((c) => c && fs.existsSync(c)) || null;
}
const npmBin = offline ? null : findNpm();
if (!offline && !npmBin) {
    console.error('override-drift: npm not found; set NPM_BIN="$(command -v npm)" or pass --offline.');
    process.exit(1);
}
function npmView(...fields) {
    return execFileSync(npmBin, ['view', ...fields, '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
}

// --- Parse the lockfile -------------------------------------------------------

const lock = yaml.load(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'));
const workspace = yaml.load(fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'));
const overridesRaw = workspace.overrides || {};

// 'name@1.2.3(peer@1)' -> { name, version }
function splitKey(key) {
    const at = key.startsWith('@') ? key.indexOf('@', 1) : key.indexOf('@');
    const name = key.slice(0, at);
    const rest = key.slice(at + 1);
    const paren = rest.indexOf('(');
    return { name, version: paren >= 0 ? rest.slice(0, paren) : rest };
}

// Map "name" -> Set of resolved versions present in the lockfile.
const resolvedVersions = new Map();
for (const key of Object.keys(lock.packages || {})) {
    const { name, version } = splitKey(key);
    if (!resolvedVersions.has(name)) resolvedVersions.set(name, new Set());
    resolvedVersions.get(name).add(version);
}

// Map child name -> list of { parentName, parentVersion, resolved, declared }
// declared is filled in later from package.json files.
const edges = new Map();
function addEdge(child, parentName, parentVersion, resolvedSpec, declared) {
    const paren = resolvedSpec.indexOf('(');
    const resolved = paren >= 0 ? resolvedSpec.slice(0, paren) : resolvedSpec;
    if (!semver.valid(resolved)) return; // link:, file:, etc.
    if (!edges.has(child)) edges.set(child, []);
    edges.get(child).push({ parentName, parentVersion, resolved, declared });
}

// Workspace packages. The lockfile's importer specifiers are recorded *after*
// overrides were applied, so read the real declared range from package.json.
for (const [importer, sections] of Object.entries(lock.importers || {})) {
    const manifestPath = path.join(root, importer, 'package.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
    for (const sec of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        for (const [child, info] of Object.entries(sections[sec] || {})) {
            const declared = manifest[sec]?.[child] || info.specifier;
            addEdge(child, `workspace:${importer}`, null, info.version, declared);
        }
    }
}

// Store packages: the lockfile only stores the resolved version, so the
// declared range must come from the installed package.json.
for (const [key, snap] of Object.entries(lock.snapshots || {})) {
    const { name, version } = splitKey(key);
    for (const sec of ['dependencies', 'optionalDependencies']) {
        for (const [child, resolvedSpec] of Object.entries(snap[sec] || {})) {
            addEdge(child, name, version, resolvedSpec, null);
        }
    }
}

// --- Declared ranges from node_modules/.pnpm ----------------------------------

const storeDir = path.join(root, 'node_modules', '.pnpm');
const storeIndex = new Map(); // "name@version" -> package dir
if (fs.existsSync(storeDir)) {
    for (const d of fs.readdirSync(storeDir)) {
        // Dir names look like "@scope+name@1.2.3_peer@1.0.0" or "name@1.2.3".
        const at = d.startsWith('@') ? d.indexOf('@', 1) : d.indexOf('@');
        if (at <= 0) continue;
        const name = d.slice(0, at).replace('+', '/');
        const version = d.slice(at + 1).split('_')[0];
        const pkgDir = path.join(storeDir, d, 'node_modules', name);
        if (!storeIndex.has(`${name}@${version}`) && fs.existsSync(path.join(pkgDir, 'package.json'))) {
            storeIndex.set(`${name}@${version}`, pkgDir);
        }
    }
}

const manifestCache = new Map();
function declaredRange(parentName, parentVersion, child) {
    const id = `${parentName}@${parentVersion}`;
    if (!manifestCache.has(id)) {
        let manifest = null;
        const dir = storeIndex.get(id);
        if (dir) {
            manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        } else if (!offline) {
            try {
                manifest = JSON.parse(npmView(id, 'dependencies', 'optionalDependencies') || '{}');
            } catch {
                manifest = null;
            }
        }
        manifestCache.set(id, manifest);
    }
    const m = manifestCache.get(id);
    if (!m) return null;
    // pnpm applies overrides to peer ranges too (optional peers show up in the
    // lockfile as optionalDependencies), so fall back to peerDependencies.
    return m.dependencies?.[child] || m.optionalDependencies?.[child] || m.peerDependencies?.[child] || null;
}

// Only the packages named by an override matter; resolving declared ranges for
// every edge in the lockfile would mean thousands of registry lookups.
const overriddenNames = new Set(
    Object.keys(overridesRaw).map((selector) => parseSelector(selector).target.name),
);
for (const [child, list] of edges) {
    if (!overriddenNames.has(child)) continue;
    for (const e of list) {
        if (e.declared == null && e.parentVersion) {
            e.declared = declaredRange(e.parentName, e.parentVersion, child);
        }
    }
}

// --- Registry versions (to detect redundant overrides) ------------------------

const versionsCache = new Map();
function publishedVersions(name) {
    if (offline) return null;
    if (!versionsCache.has(name)) {
        try {
            const parsed = JSON.parse(npmView(name, 'versions'));
            versionsCache.set(name, (Array.isArray(parsed) ? parsed : [parsed]).filter((v) => semver.valid(v) && !semver.prerelease(v)));
        } catch {
            versionsCache.set(name, null);
        }
    }
    return versionsCache.get(name);
}

// --- Parse override selectors -------------------------------------------------

// Selector forms: "name", "name@range", "parent>name", "parent@range>name@range".
// A ">" starts a child segment only when followed by a package name; the ">"
// in ">=1.0.0" or ">1.0.0" inside a range must not be split on.
function parseSelector(selector) {
    const segments = selector.split(/>(?=[a-zA-Z@_])/);
    const target = segments.pop();
    const parent = segments.length ? segments.join('>') : null;
    const parse = (s) => {
        const at = s.startsWith('@') ? s.indexOf('@', 1) : s.indexOf('@');
        return at > 0 ? { name: s.slice(0, at), range: s.slice(at + 1) } : { name: s, range: null };
    };
    return { target: parse(target), parent: parent ? parse(parent) : null };
}

function intersects(selectorRange, declared) {
    if (!selectorRange) return true;
    if (declared === selectorRange) return true;
    if (semver.validRange(declared) == null || semver.validRange(selectorRange) == null) return false;
    return semver.intersects(declared, selectorRange);
}

// How far `resolved` sits from the versions `declared` allows.
function jumpClass(declared, resolved) {
    if (semver.validRange(declared) == null) return 'unknown';
    if (semver.satisfies(resolved, declared)) return 'in-range';
    const base = semver.minVersion(declared);
    if (!base) return 'unknown';
    if (semver.lt(resolved, base)) return 'downgrade';
    const majors = semver.major(resolved) - semver.major(base);
    if (majors >= 2) return 'multi-major';
    if (majors === 1) return 'major';
    // 0.x packages: a minor bump is a breaking change by convention.
    if (semver.major(base) === 0 && semver.minor(resolved) !== semver.minor(base)) return 'major';
    return semver.diff(base, resolved) || 'patch';
}

const JUMP_ORDER = ['in-range', 'patch', 'minor', 'major', 'multi-major', 'downgrade', 'unknown'];

// --- Evaluate every override --------------------------------------------------

const report = [];
for (const [selector, target] of Object.entries(overridesRaw)) {
    const sel = parseSelector(selector);
    const child = sel.target.name;
    const rows = [];
    for (const e of edges.get(child) || []) {
        if (sel.parent && e.parentName !== sel.parent.name) continue;
        if (sel.parent?.range && e.parentVersion && !semver.satisfies(e.parentVersion, sel.parent.range)) continue;
        if (e.declared == null) {
            // Parent manifest not available (or child is a peer we can't see);
            // report it, but it cannot count for or against the override.
            rows.push({
                parent: e.parentVersion ? `${e.parentName}@${e.parentVersion}` : e.parentName,
                declared: '?',
                resolved: e.resolved,
                applies: null,
                jump: 'unknown',
                meetsTarget: null,
                competing: [],
            });
            continue;
        }
        const applies = intersects(sel.target.range, e.declared);
        if (!applies) continue;
        // Other selectors for the same package that also match this parent.
        const competing = Object.keys(overridesRaw).filter((other) => {
            if (other === selector) return false;
            const o = parseSelector(other);
            return o.target.name === child && !o.parent && intersects(o.target.range, e.declared);
        });
        rows.push({
            parent: e.parentVersion ? `${e.parentName}@${e.parentVersion}` : e.parentName,
            declared: e.declared,
            resolved: e.resolved,
            applies,
            jump: jumpClass(e.declared, e.resolved),
            meetsTarget: semver.validRange(target) ? semver.satisfies(e.resolved, target) : null,
            competing,
        });
    }

    // Classify the override as a whole.
    const known = rows.filter((r) => r.jump !== 'unknown');
    const worst = known.reduce(
        (acc, r) => (JUMP_ORDER.indexOf(r.jump) > JUMP_ORDER.indexOf(acc) ? r.jump : acc),
        'in-range',
    );
    let status;
    if (!known.length) {
        status = rows.length ? 'unknown' : 'dead'; // dead = matches no parent in the lockfile
    } else if (known.some((r) => r.meetsTarget === false)) {
        status = 'ineffective'; // a parent it applies to still resolves outside the target
    } else if (worst !== 'in-range') {
        status = 'forcing'; // parents run a version they never declared
    } else {
        // Every parent is still inside its own range. Would it have resolved
        // high enough without the override? Check against published versions.
        const versions = publishedVersions(child);
        if (versions) {
            const redundant = rows.every((r) => {
                const natural = semver.maxSatisfying(versions, r.declared);
                return natural && semver.validRange(target) && semver.satisfies(natural, target);
            });
            status = redundant ? 'redundant' : 'needed';
        } else {
            status = 'in-range';
        }
    }
    const shadowed = rows.some((r) => r.competing?.length);
    report.push({ selector, target, status, worstJump: worst, shadowed, rows });
}

// --- Output -------------------------------------------------------------------

const summary = {};
for (const r of report) summary[r.status] = (summary[r.status] || 0) + 1;
summary.total = report.length;
summary.forcingByJump = {};
for (const r of report.filter((r) => r.status === 'forcing')) {
    summary.forcingByJump[r.worstJump] = (summary.forcingByJump[r.worstJump] || 0) + 1;
}
summary.shadowed = report.filter((r) => r.shadowed).length;
summary.parentsBeyondDeclaredRange = report.reduce(
    (n, r) => n + r.rows.filter((row) => row.jump !== 'in-range' && row.jump !== 'unknown').length,
    0,
);

if (asJson) {
    console.log(JSON.stringify({ summary, overrides: report }, null, 2));
} else {
    console.log('# Override drift report\n');
    console.log('| Override | Target | Status | Parent | Declared | Resolved | Jump |');
    console.log('|---|---|---|---|---|---|---|');
    for (const r of report) {
        const flag = r.shadowed ? ' (shadowed)' : '';
        if (!r.rows.length) {
            console.log(`| \`${r.selector}\` | \`${r.target}\` | ${r.status}${flag} | - | - | - | - |`);
            continue;
        }
        for (const row of r.rows) {
            console.log(
                `| \`${r.selector}\` | \`${r.target}\` | ${r.status}${flag} | ${row.parent} | \`${row.declared}\` | ${row.resolved} | ${row.jump} |`,
            );
        }
    }
    console.log('\n## Summary\n');
    // Split the one nested object off first so only numbers are ever interpolated.
    const { forcingByJump, ...counts } = summary;
    for (const [k, n] of Object.entries(counts)) console.log(`- ${k}: ${n}`);
    console.log('- forcingByJump:');
    for (const [jump, n] of Object.entries(forcingByJump)) console.log(`  - ${jump}: ${n}`);
    console.log(
        '\nStatus key: dead = matches no parent; ineffective = a matched parent still resolves outside the target;',
    );
    console.log(
        'forcing = a parent runs a version outside its declared range; redundant = parents would resolve to a fixed',
    );
    console.log('version without the override; needed = override is what keeps the fixed version in place.');
}
