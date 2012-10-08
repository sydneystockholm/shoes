var express = require('express')
  , swig = require('swig')
  , mkdirp = require('mkdirp')
  , less = require('less')
  , uglify = require('uglify-js')
  , fs = require('fs')
  , utils = require('./utils')
  , log = require('sslog')
  , server = module.exports;

/**
 * Create an error to represent 404's.
 */

var NotFoundError = function () {
    this.name = 'NotFoundError';
    Error.apply(this, arguments);
    Error.captureStackTrace(this, arguments.callee);
}
NotFoundError.prototype.__proto__ = Error.prototype;

/**
 * Create a new server.
 *
 * @param {String} root
 * @param {Object} config (optional)
 */

var Server = exports.Server = function (root, config) {
    this.root = root;
    this.config = config || {};
    this.useragent_redirects = [];
    this.error_handler = null;
    this.view_helpers = {};
};

/**
 * Bind view helpers.
 *
 * @param {Object} helpers
 */

Server.prototype.viewHelpers = function (helpers) {
    this.view_helpers = helpers;
}

/**
 * Create a new express app.
 *
 * @return {Express} app
 */

Server.prototype.create = function () {
    var app = express.createServer()
      , config = this.config
      , root = this.root
      , self = this;

    //Setup swig views. Note that swig handles caching and layouts so
    //disable the express functionality
    swig.init({
          root: root + '/views'
        , allowErrors: true
        , filters: this.view_helpers
        , cache: !!config.production
    });
    app.set('views', root + '/views');
    app.set('view options', { layout: false });
    app.set('view cache', false);
    app.set('view engine', 'html');
    app.register('.html', swig);

    //Setup the CSS / JS compiler + minifier
    express.compiler.compilers.less.compile = this.compileCss
    express.compiler.compilers.js = {
        match: /\.js$/
      , ext: '.js'
      , compile: this.compileJs
    };
    app.use(express.compiler({
        src: root + '/public'
      , dest: root + '/compiled'
      , enable: ['less', 'js']
    }));

    //Create the compiled dirs if they don't exist
    mkdirp(root + '/compiled/js');
    mkdirp(root + '/compiled/css');

    //Delete existing compiled files on server start
    ['js', 'css'].forEach(function (dir) {
        try {
            fs.readdirSync(root + '/compiled/' + dir).forEach(function (file) {
                fs.unlinkSync(root + '/compiled/' + dir + '/' + file);
                log.info('Removed compiled file /' + dir + '/' + file);
            });
        } catch (e) {}
    });

    //Enable cache-busting
    app.use(function (request, response, next) {
        var original = request.url
          , match = request.url.match(/^\/(css|js)\/[^\/]+\/(.+)$/);
        if (match) {
            request.url = '/' + match[1] + '/' + match[2];
        }
        request.local('now', utils.md5(''+Date.now()).substr(0, 6));
        next();
    });

    //Enable hot reloading of JS/CSS in dev
    if (!config.production) {
        this.hotReloadJs();
        this.hotReloadCss();
    }

    //Enable request tracing?
    if (log.level >= 5) {
        app.use(function (request, response, next) {
            log.trace('%s %s', request.method.toUpperCase(), request.url);
            next();
        });
    }

    //Add additional middleware
    app.use(express.favicon(root + '/public/images/favicon.ico'));
    app.use(express.static(root + '/compiled'));
    app.use(express.static(root + '/public'));
    app.use(express.cookieParser());
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(this.useragentMiddleware());

    //Expose configuration to views
    app.use(function (request, response, next) {
        response.locals({
            config: config
          , request: request
          , production: config.production
        });
        next();
    });

    //Add the router and then catch requests that fall through as 404's
    app.use(app.router);
    app.use(function () {
        throw new NotFoundError;
    });

    //Catch all errors
    var default_error_handler = express.errorHandler({ dumpExceptions: true, showStack: true });
    app.error(function (err, request, response, next) {
        if (err instanceof NotFoundError) {
            response.statusCode = 404;
            return response.send('Not Found');
        }
        var msg = err || '', stack = {};
        if (typeof msg === 'object') {
            msg = err.message || err.msg;
            stack = err.stack;
        }
        if (self.error_handler) {
            self.error_handler(msg, stack);
        }
        log.warn('Request error at %s: %s', request.url, msg.trim());
        if (stack) {
            console.error(stack);
        }
        if (config.production) {
            response.statusCode = 500;
            return response.send('Internal Server Error')
        }
        return default_error_handler(err, request, response, next);
    });

    return app;
};

/**
 * Set the server error handler.
 *
 * @param {Function} callback - receives the error as (msg, stack)
 */

Server.prototype.errorHandler = function (callback) {
    this.error_handler = callback;
};

/**
 * Compile/compress a LESS string into CSS.
 *
 * @param {String} str
 * @param {Function} callback
 */

Server.prototype.compileCss = function (str, callback) {
    var config = {
        compress : this.config.minify
      , paths    : [ this.root + '/public/css' ]
    }
    var parser = new (less.Parser)(config);
    parser.parse(str, function (err, root) {
        if (err && err.message) {
            err.message = 'Less: ' + err.message;
            return callback(err);
        }
        try {
            str = root.toCSS(config);
            callback(null, str);
        } catch (err) {
            callback(err.message);
        }
    });
};

/**
 * Compile/compress a JS string.
 *
 * @param {String} str
 * @param {Function} callback
 */

Server.prototype.compileJs = function (str, callback) {
    try {
        if (this.config.minify) {
            var ast = uglify.parser.parse(str);
            ast = uglify.uglify.ast_mangle(ast);
            ast = uglify.uglify.ast_squeeze(ast);
            str = uglify.uglify.gen_code(ast);
        }
        callback(null, str);
    } catch (err) {
        callback(err);
    }
};

/**
 * Hot-reload JS files by deleting the compiled version when
 * the original changes.
 */

Server.prototype.hotReloadJs = function () {
    var root = this.root;
    fs.readdir(root + '/public/js', function (err, files) {
        if (err) return;
        files.forEach(function (file) {
            file = root + '/public/js/' + file;
            var compiled = file.replace(/\/public\//, '/compiled/');
            fs.watchFile(file, { persisent: false, interval: 500 }, function (curr, prev) {
                if (curr.mtime > prev.mtime || curr.size !== prev.size) {
                    log.info('Changed JS file %s', file);
                    log.info('Deleting %s', compiled);
                    try {
                        fs.unlinkSync(compiled);
                    } catch (e) {}
                }
            });
        });
    });
};

/**
 * Hot-reload CSS (less) files by deleting the compiled when the original
 * (or anything it includes, recursively) changes.
 */

Server.prototype.hotReloadCss = function () {
    var root = this.root;
    (function watchCSSDir(dir) {
        dir = dir.replace(/\/$/, '');
        fs.readdir(dir, function (err, files) {
            if (err) return;
            files.forEach(function (file) {
                file = dir + '/' + file;
                fs.stat(file, function (err, stat) {
                    if (err) throw err;
                    if (stat.isDirectory()) {
                        watchCSSDir(file);
                    } else {
                        fs.watchFile(file, { persisent: false, interval: 500 }, function (curr, prev) {
                            if (curr.mtime > prev.mtime || curr.size !== prev.size) {
                                log.info('Changed less file %s', file);
                                try {
                                    fs.readdirSync(root + '/compiled/css').forEach(function (f) {
                                        log.info('Deleting %s', f);
                                        try {
                                            fs.unlinkSync(root + '/compiled/css/' + f);
                                        } catch (e) {}
                                    });
                                } catch (e) {}
                            }
                        });
                    }
                });
            });
        });
    })(root + '/public/css');
};

/**
 * Redirect a useragent.
 *
 * @param {RegExp} pattern - e.g. /MSIE [5-8]/
 * @param {String} redirect_to - e.g. '/upgrade'
 */

Server.prototype.redirectUseragent = function (pattern, redirect_to) {
    this.useragent_redirects.push({ pattern: pattern, redirect: redirect_to });
};

/**
 * Create useragent redirect middleware.
 *
 * @return {Function} middleware
 */

Server.prototype.useragentMiddleware = function () {
    var self = this;
    return function (request, response, next) {
        var ua = request.headers['user-agent'] || null
          , redirect;
        if (ua) {
            self.useragent_redirects.forEach(function (next) {
                if (next.pattern.test(ua)) {
                    redirect = next.redirect;
                }
            }
        }
        if (redirect && redirect !== request.url) {
            return response.redirect(redirect);
        }
        next();
    };
};

