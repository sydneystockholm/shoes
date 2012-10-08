var util = require('util')
  , fs = require('fs')
  , utils = require('./utils')
  , environment = exports;

/**
 * Create a new environment.
 *
 * @param {String} env (optional) - the environment name, defaults to NODE_ENV
 */

var Environment = exports.Environment = function (env) {
    this.env = env || process.env.NODE_ENV || 'default';
};

/**
 * Load environment configuration.
 *
 * @param {String} file
 * @param {String} env (optional)
 * @return {Object} config
 */

Environment.prototype.loadConfig = function (file, strict) {
    var config = fs.readFileSync(file, 'utf8');
    try {
        if (/\.json$/.test(file)) {
            config = JSON.parse(config);
        } else {
            throw new Error('Unsupported config format');
        }
    } catch (e) {
        throw new Error('Error parsing config: ' + e.message);
    }
    if (!config[this.env] && strict) {
        throw new Error('Unknown config environment: ' + env);
    }
    return utils.merge(config[current_env] || {}, config.default || {});
};

/**
 * Load all .js modules in a directory.
 *
 * @param {String} directory
 * @return {Object} modules
 */

Environment.prototype.loadModules = function (dir) {
    var modules = {}, js_ext = /\.js$/;
    dir = dir.replace(/\/$/, '');
    fs.readdirSync(dir).filter(function (file) {
        return js_ext.test(file);
    }).forEach(function (file) {
        modules[file.replace(js_ext, '')] = require(dir + '/' + file);
    });
    return modules;
};

/**
 * Load and call modules with the specified args.
 *
 * @param {String} dir
 * @param {Mixed} args1..N
 * @return {Object}
 */

Environment.prototype.callModules = function (dir, args) {
    var modules = this.loadModules(dir)
      , result = {};
    args = Array.prototype.slice.call(arguments, 1);
    for (var name in modules) {
        result[name] = modules[name].apply(this, args);
    }
    return result;
};

/**
 * Catch uncaught exceptions.
 *
 * @param {Function} callback - receives (msg, stack)
 */

Environment.prototype.catchExceptions = function (callback) {
    process.on('uncaughtException', function (err) {
        var msg = err, stack = null;
        if (typeof err === 'object') {
            msg = err.message;
            stack = err.stack;
        }
        callback(msg, stack);
    });
};

/**
 * Create a pid file.
 *
 * @param {String} path
 */

Environment.prototype.pidFile = function (path) {
    fs.writeFileSync(path, process.pid);
    ['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGQUIT', 'SIGHUP', 'exit'].forEach(function (sig) {
        process.on(sig, function () {
            try {
                fs.unlinkSync(path);
            } catch (e) {}
            process.exit();
        });
    });
};

/**
 * Set a process title.
 *
 * @param {String} title
 * @param {String} args1..N (optional)
 * @api public
 */

Environment.prototype.processTitle = function (title, args) {
    process.title = util.format.apply(util, arguments);
};

