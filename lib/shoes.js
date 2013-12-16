var express = require('express')
  , ferguson = require('ferguson')
  , path = require('path')
  , fs = require('fs')
  , utils = require('./utils');

/**
 * Default options.
 */

var defaults = {
    production: false
  , static: 'public'
};

/**
 * Create a new shoes instance.
 *
 * @param {String} dir
 * @param {Object} options (optional)
 */

function shoes(dir, options) {
    options = utils.mergeDefaults(options, defaults);

    var app = express();

    //Setup the asset manager
    var assets = ferguson(path.join(dir, options.static), {
        compress: options.production
      , hotReload: !options.production
      , separateBundles: !options.production
    });

    assets.bind(app);

    //Patch app.listen() so that it handles sockets correctly
    app.listen = patchedListen(app);

    //TODO

    return app;
}

/**
 * Patch app.listen() so that it handles sockets correctly.
 *
 * We need to set the process umask and also remove the socket
 * file if it already exists.
 *
 * @param {Express} app
 * @return {Function}
 */

function patchedListen(app) {
    var listen = app.listen;
    return function () {
        var args = Array.prototype.slice.call(arguments);
        if (typeof args[0] === 'string' && !/^[0-9]+$/.test(args[0])) {
            try {
                fs.unlinkSync(args[0]);
            } catch (err) {}
        }
        var callback;
        if (typeof args[args.length - 1] === 'function') {
            callback = args.pop();
        }
        var mask = process.umask(0);
        args.push(function () {
            process.umask(mask);
            if (callback) {
                callback.apply(null, arguments);
            }
        });
        listen.apply(app, args);
    };
}

/**
 * Export the module with express/connect middleware attached.
 */

for (var middleware in express) {
    shoes[middleware] = express[middleware];
}

module.exports = shoes;
