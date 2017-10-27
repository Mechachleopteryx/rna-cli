const fs = require('fs');
const path = require('path');
const colors = require('colors/safe');
const rollup = require('rollup');
const Proteins = require('@chialab/proteins');
const paths = require('../../lib/paths.js');
const optionsUtils = require('../../lib/options.js');
const importer = require('../../lib/import.js');

const resolve = require('rollup-plugin-node-resolve');
const common = require('rollup-plugin-commonjs');
const babel = require('rollup-plugin-babel');
const sass = require('rollup-plugin-sass-modules');
const uglify = require('rollup-plugin-uglify');
const json = require('rollup-plugin-json');
const url = require('rollup-plugin-url');
const jsx = require('rollup-plugin-external-jsx');
const string = require('rollup-plugin-string');

const postcss = require('postcss');
const autoprefixer = require('autoprefixer');

function camelize(str) {
    return str.split('/').pop().replace(/(^[a-z0-9]|[-_]([a-z0-9]))/g, (g) => (g[1] || g[0]).toUpperCase());
}

function getPostCssConfig() {
    let localConf = path.join(paths.cwd, 'postcss.json');
    if (fs.existsSync(localConf)) {
        return require(localConf);
    }
    return {
        browsers: ['last 3 versions'],
    };
}

function getBabelConfig() {
    let localConf = path.join(paths.cwd, '.babelrc');
    if (fs.existsSync(localConf)) {
        return JSON.parse(fs.readFileSync(localConf), 'utf8');
    }
    return {
        include: '**/*.{js,jsx}',
        exclude: [],
        compact: false,
        presets: [
            [require('babel-preset-env'), {
                targets: {
                    browsers: ['ie >= 11', 'safari >= 8'],
                },
                modules: false,
            }],
        ],
        plugins: [
            require('babel-plugin-transform-inline-environment-variables'),
        ],
    };
}

function getConfig(app, options) {
    let localConf = path.join(paths.cwd, 'rollup.config.js');
    if (fs.existsSync(localConf)) {
        return importer(localConf)
            .then((conf) => {
                if (!conf.input) {
                    conf.input = options.input;
                }
                app.log(colors.grey(`Config file: ${localConf}`));
                return conf;
            });
    }
    if (!options.output) {
        app.log(colors.red(`Missing 'output' option for ${options.input}.`));
        return global.Promise.reject();
    }
    const babelConfig = getBabelConfig();
    babelConfig.runtimeHelpers = true;
    return global.Promise.resolve({
        name: options.name,
        input: options.input,
        file: options.output,
        sourcemap: options.map !== false ? 'inline' : false,
        format: 'umd',
        strict: false,
        // https://github.com/rollup/rollup/issues/1626
        cache: app.generated[options.input],
        plugins: [
            resolve(),
            json(),
            string({
                include: [
                    '**/*.{html,txt,svg,md}',
                ],
            }),
            url({
                limit: 10 * 1000 * 1024,
                exclude: [],
                include: [
                    '**/*.{woff,ttf,eot,gif,png,jpg}',
                ],
            }),
            sass({
                processor: (css) =>
                    postcss(
                        [
                            autoprefixer(getPostCssConfig()),
                        ]
                    ).process(css).then(result => result.css),
                exclude: [],
                include: [
                    '**/*.{css,scss,sass}',
                ],
                options: {
                    outFile: options['external-css'] && path.join(
                        path.dirname(options.output),
                        `${path.basename(options.output, path.extname(options.output))}.css`
                    ),
                    sourceMap: options.map !== false,
                    sourceMapEmbed: options.map !== false,
                    outputStyle: options.production ? 'compressed' : 'expanded',
                },
            }),
            jsx({
                // Required to be specified
                include: '**/*.jsx',
                // import header
                header: 'import { IDOM } from \'@dnajs/idom\';',
            }),
            babel({
                compact: false,
                include: '**/*.{js,jsx}',
                plugins: [
                    [require('babel-plugin-transform-react-jsx'), {
                        pragma: 'IDOM.h',
                    }],
                ],
            }),
            common(),
            babel(babelConfig),
            options.production ? uglify({
                output: {
                    comments: /@license/,
                },
            }) : {},
        ],
        onwarn(message) {
            const whitelisted = () => {
                message = message.toString();
                if (message.indexOf('The \'this\' keyword') !== -1) {
                    return false;
                }
                if (message.indexOf('It\'s strongly recommended that you use the "external-helpers" plugin') !== -1) {
                    return false;
                }
                return true;
            };
            if (message && options.verbose || whitelisted()) {
                app.log(colors.yellow(`⚠️  ${message}`));
            }
        },
    });
}

function bundle(app, options) {
    let prev = app.generatedOptions[options.input];
    if (prev) {
        options = app.generatedOptions[options.input];
    } else if (options.output) {
        options.output = path.resolve(paths.cwd, options.output);
        let final = options.output.split(path.sep).pop();
        if (!final.match(/\./)) {
            options.output = path.join(
                options.output,
                path.basename(options.input)
            );
        }
    }
    if (!options.name) {
        options.name = camelize(
            path.basename(options.input, path.extname(options.input))
        );
    }
    let task = app.log(`bundling${app.generated[options.input] ? ' [this will be fast]' : ''}... ${colors.grey(`(${options.input})`)}`, true);
    return getConfig(app, options)
        .then((config) =>
            rollup.rollup(config)
                .then((bundler) => {
                    options.output = options.output || config.output;
                    app.generated[options.input] = bundler;
                    app.generatedOptions[options.input] = options;
                    return bundler.write(config)
                        .then(() => {
                            task();
                            app.log(`${colors.bold(colors.green('bundle ready!'))} ${colors.grey(`(${options.output})`)}`);
                            return global.Promise.resolve(bundler);
                        });
                })
        )
        .catch((err) => {
            task();
            if (err) {
                app.log(err);
            }
            app.log(colors.red(`error bundling ${options.name}`));
            return global.Promise.reject();
        });
}

module.exports = (app, options = {}) => {
    app.generated = app.generated || {};
    app.generatedOptions = app.generatedOptions || {};
    options = Proteins.clone(options);
    if (!paths.cwd) {
        app.log(colors.red('no project found.'));
        return global.Promise.reject();
    }
    let filter = optionsUtils.handleArguments(options);
    let promise = global.Promise.resolve();
    Object.values(filter.packages).forEach((pkg) => {
        promise = promise.then(() => {
            let json = pkg.json;
            if (!json.main && !options.output) {
                app.log(colors.red(`Missing 'output' property for ${pkg.name} module.`));
                return global.Promise.reject();
            }
            let opts = Proteins.clone(options);
            if (json.module) {
                opts.input = path.join(pkg.path, json.module);
                opts.output = path.join(pkg.path, json.main);
            } else {
                opts.input = path.join(pkg.path, json.main);
            }
            opts.name = camelize(json.name);
            return bundle(app, opts);
        });
    });
    filter.files.forEach((file) => {
        promise = promise.then(() => {
            let opts = Proteins.clone(options);
            opts.input = file;
            if (opts.output) {
                if (filter.files.length > 1) {
                    opts.output = path.resolve(path.dirname(file), opts.output);
                }
            }
            return bundle(app, opts);
        });
    });

    return promise;
};