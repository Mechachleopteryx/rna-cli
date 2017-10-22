const manager = require('../../lib/package-manager.js');
const paths = require('../../lib/paths.js');

module.exports = (program) => {
    program
        .command('bootstrap')
        .description('Sync project dependencies after a project update or a git pull.')
        .help('A simple alias to `yarn install` command.')
        .action((app) => {
            if (!paths.cwd) {
                app.log('no project found.'.red);
                return global.Promise.reject();
            }
            let task = app.log('syncing dependencies...', true);
            return manager.update()
                .then((res) => {
                    task();
                    app.log('dependencies successfully updated.'.green);
                    return global.Promise.resolve(res);
                })
                .catch((err) => {
                    task();
                    app.log('failed to update dependencies.'.red);
                    return global.Promise.reject(err);
                });
        });
};