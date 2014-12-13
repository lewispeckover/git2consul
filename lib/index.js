var logging = require('./logging.js');
var config_reader = require('./config_reader.js');

var fs = require('fs');
var os = require('os');

/**
 * Read config from a specially named Consul resource.  If the config was not seeded
 * (and this should be done using utils/config_seeder.js), git2consul will not boot.
 */
config_reader.read(function(err, config) {

  if (err) return console.error(err);

  // Logging configuration is specified in the config object, so initialize our logger
  // around that config.
  logging.init(config);

  if (process.env.TOKEN) {
    // If a token was configured, register it with the consul broker
    require('./consul').setToken(process.env.TOKEN);
  }

  var logger = require('./logging.js');

  var git = require('./git');

  if (!config.repos || !config.repos.length > 0) {
    // Fail startup.
    logger.error("No repos found in configuration.  Halting.")
    process.exit(1);
  }

  // Process command line switches, if any.  Command-line switches override the settings
  // loaded from Consul.
  for (var i=2; i<process.argv.length; ++i) {
    if (process.argv[i] === '-n' || process.argv[i] === '--no_daemon') config['no_daemon'] = true;
    if (process.argv[i] === '-h' || process.argv[i] === '--halt_on_change') config['halt_on_change'] = true;
    else if (process.argv[i] === '-d' || process.argv[i] === '--local_store') {
      if (i+1 >= process.argv[length]) {
        logger.error("No dir provided with --local_store option");
        process.exit(3);
      }
      config['local_store'] = process.argv[i+1];
    }
  }

  if (config.no_daemon === true) {
    // If we are running in no daemon mode, set git to disable any listeners that would keep
    // the process running after the initial sync.
    git.setDaemon(false);
  } else if (config.halt_on_change === true) {
    // If we aren't running in no daemon mode and the configuration calls for halt on change, enable it.
    // We don't do this if config.no_daemon is enabled as the halt on change listener would keep the process
    // running.
    git.enableHaltOnChange();
  }

  if (!config.local_store) {
    config.local_store = os.tmpdir();
  }

  logger.info('git2consul is running');

  process.on('uncaughtException', function(err) {
    logger.error("Uncaught exception " + err);
  });

  // Set up git for each repo
  git.createRepos(config, function(err) {
    if (err) {
      logger.error('Failed to create repos due to %s', err);
      setTimeout(function() {
        // If any git manager failed to start, consider this a fatal error.
        process.exit(2);
      }, 2000);
    }
  });

});
