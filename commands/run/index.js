/**
 * Register command to CLI.
 *
 * @param {Command} program Command.
 * @returns {void}
 */
module.exports = (program) => {
    program
        .command('run')
        .description('Trigger project script.')
        .option('<script>', 'The script to trigger.')
        .action(async () => {
            const Project = require('../../lib/Project');

            const cwd = process.cwd();
            const project = new Project(cwd);

            return await project.packageManager.run(process.argv[3], process.argv.slice(4));
        });
};
