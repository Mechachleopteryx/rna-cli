const fs = require('fs');
const path = require('path');
const url = require('url');
const colors = require('colors/safe');
const watcher = require('../../lib/watcher.js');
const commondir = require('commondir');
const cwd = require('../../lib/paths.js').cwd;
const optionsUtils = require('../../lib/options.js');

/**
 * Command action to run a local development server.
 *
 * @param {CLI} app CLI instance.
 * @param {Object} options Options.
 * @returns {Promise}
 */
module.exports = (app, options = {}) => new global.Promise((resolve, reject) => {
    // Load directory to be served.
    let filter = optionsUtils.handleArguments(options);
    let base = filter.files.length ? commondir(filter.files) : './public';
    base = path.resolve(cwd, base);
    if (filter.files.length > 1) {
        // serving multi path, force directory option
        options.directory = true;
    }

    // Load configuration.
    let config = {
        server: {
            baseDir: base,
            directory: options.directory === true,
        },
        ghostMode: false,
        tunnel: options.tunnel,
        logFileChanges: false,
        open: false,
        xip: true,
        notify: !!options.watch,
        injectChanges: !!options.watch,
        middleware: !options.directory && [
            (req, res, next) => {
                const headers = req.headers;
                if (req.method === 'GET' && ~headers.accept.indexOf('text/html') && !headers.origin) {
                    let parsed = url.parse(req.url);
                    let file = path.join(base, parsed.pathname);
                    if (!path.extname(file)) {
                        file += '.html';
                        req.url = `${parsed.pathname}.html`;
                    }
                    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
                        req.url = '/index.html';
                    }
                }
                return next();
            },
        ],
        serveStatic: [
            {
                route: '/node_modules',
                dir: 'node_modules',
            },
            base,
        ],
    };
    if (!options.watch) {
        // Disable BrowserSync sockets and tunnels.
        require('browser-sync/dist/async.js').startSockets = (bs, done) => { done(); };
        config.ui = false;
        config.snippetOptions = {
            rule: {
                match: /\${50}/i,
            },
        };
    }
    if (options.https) {
        config.https = {
            key: options.https,
            cert: options.cert || path.join(path.dirname(options.https), 'cert.pem'),
        };
    }
    if (options.port) {
        // Use custom port.
        config.port = options.port;
    }

    const browserSync = require('browser-sync').create();

    // Start BrowserSync server.
    browserSync.init(config, (nil, server) => {
        if (nil) {
            return reject(nil);
        }
        resolve({
            config,
            bs: browserSync,
            server,
        });

        if (options.watch) {
            // Watch only requested paths, not the commondir
            let paths = filter.files.map((p) => path.join(p, '**/*'));
            // Configure watch.
            watcher(app, paths, (event, p) => {
                if (event !== 'unlink') {
                    let toReload = p.replace(base, '').replace(/^\/*/, '');
                    // File updated: notify BrowserSync so that it can be reloaded.
                    browserSync.reload(toReload);
                    app.log(colors.cyan(`${toReload} injected.`));
                }
                return global.Promise.resolve();
            }, {
                debounce: 200,
                log: false,
            });
        }
    });
});
