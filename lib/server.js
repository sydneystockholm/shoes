var express = require('express')
  , mkdirp = require('mkdirp')
  , nunjucks = require('nunjucks')
  , less = require('less')
  , uglify = require('uglify-js')
  , fs = require('fs')
  , utils = require('./utils')
  , compiler = require('./compiler')
  , log = require('sslog')
  , path = require('path')
  , rimraf = require('rimraf')
  , flash = require('connect-flash')
  , default_helpers = require('./view_helpers')
  , server = module.exports;

/**
 * Generate a nonce.
 */

var nonce = utils.md5(''+Date.now()).substr(0, 6);

/**
 * Create an error to represent 404's.
 */

var NotFoundError = function () {
    this.name = 'NotFoundError';
    Error.apply(this, arguments);
    Error.captureStackTrace(this, arguments.callee);
};
NotFoundError.prototype.__proto__ = Error.prototype;

/**
 * Create a new server.
 *
 * @param {String} root
 * @param {Object} config (optional)
 * @param {Object} components (optional) - allows you to configure middleware
 */

var Server = exports.Server = function (root, config, components) {
    this.root = root;
    this.config = config || {};
    this.components = components || {
        session: false
    };
    this.useragent_redirects = [];
    this.error_handler = null;
    this.notfound_handler = null;
    this.view_helpers = default_helpers;
};

/**
 * Bind view helpers.
 *
 * @param {Object} helpers
 */

Server.prototype.viewHelpers = function (helpers) {
    helpers = utils.merge({}, helpers);
    this.view_helpers = utils.merge(helpers, this.view_helpers);
};

/**
 * Bind an existing express app to use.
 *
 * @param {Express} app
 */

Server.prototype.setApp = function (app) {
    this.app = app;
};

/**
 * Populate an express app with middleware
 *
 * @return {Express} app
 */

Server.prototype.create = function () {
    var config = this.config
      , root = this.root
      , self = this;

    var app = this.app;
    if (!app) {
        app = express();
    }

    //Send 400 when a malformed url is encountered
    app.use(function (request, response, next) {
        try {
            decodeURIComponent(request.url);
            next();
        } catch (e) {
            return response.send(400);
        }
    });

    //Use nunjucks for templating
    var views = path.normalize(path.join(root, 'views'))
      , loader = new nunjucks.FileSystemLoader(views)
      , env = new nunjucks.Environment(loader);
    if (config.production) {
        loader.upToDateFunc = function () {
            return function () { return true; };
        };
    }
    Object.keys(this.view_helpers).forEach(function (filter) {
        env.addFilter(filter, self.view_helpers[filter]);
    });
    app.use(function (request, response, next) {
        response.render = function (file, locals) {
            locals = locals || {};
            file += '.html';
            for (var key in response.locals) {
                locals[key] = response.locals[key];
            }
            try {
                var result = env.render(file, locals);
                response.send(result);
            } catch (e) {
                log.error('Template error in %s', file);
                next(e);
            }
        };
        next();
    });

    //Setup the cache-busting middleware
    app.nonce = nonce;
    var cacheBust = function (request, response, next) {
        var original = request.url
          , match = request.url.match(/^\/(css|js)\/([^\/]+)\/(.+)$/);
        if (match) {
            if (match[2] !== nonce) {
                return response.send(404);
            }
            request.url = '/' + match[1] + '/' + match[3];
        }
        next();
    };

    //Setup the CSS/JS compiler/minifier middleware
    var compilers = {
        less: {
            match: /\.css$/
          , ext: '.less'
          , compile: this.compileCss(this.root, this.config)
        },
        js: {
            match: /\.js$/
          , ext: '.js'
          , compile: this.compileJs(this.root, this.config)
        }
    };
    var staticCompiler = compiler({
        src: path.join(root, 'public')
      , dest: path.join(root, 'compiled')
    }, compilers);

    //Delete existing compiled files on server start
    try {
        var compiled = path.join(root, 'compiled');
        fs.readdirSync(compiled).forEach(function (dir) {
            try {
                rimraf.sync(path.join(compiled, dir));
            } catch (e) {}
        });
    } catch (e) {}

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

    //Serve favicons efficiently
    app.use(express.favicon(path.join(root, 'public/images/favicon.ico')));

    //Serve static assets
    var compiledServer = express.static(path.join(root, 'compiled'))
      , publicServer = express.static(path.join(root, 'public'));
    app.use(function (request, response, next) {
        response.locals.nonce = nonce;
        if (!/^\/(css|js|img|images|fonts)/i.test(request.url)) {
            return next();
        }
        cacheBust(request, response, function () {
            compiledServer(request, response, function (err) {
                if (err) return next(err);
                staticCompiler(request, response, function (err) {
                    if (err) return next(err);
                    compiledServer(request, response, function (err) {
                        if (err) return next(err);
                        publicServer(request, response, next);
                    });
                });
            });
        });
    });

    //Add additional middleware
    app.use(this.useragentMiddleware());
    app.use(express.cookieParser(config.secret));
    app.use(express.bodyParser());
    app.use(express.methodOverride());

    //Add session support?
    if (this.components.session) {
        app.use(express.session({
            secret: config.secret
          , key: 'sid'
        }));
        app.use(flash());
    }

    //Expose configuration to views
    app.use(function (request, response, next) {
        response.locals({
            config: config
          , request: request
          , production: config.production
          , url: request.url
        });
        next();
    });

    //Make IE use the latest rendering engine when multiple are available
    app.use(function (request, response, next) {
        response.setHeader('X-UA-Compatible', 'IE=edge,chrome=1');
        next();
    });

    //Add the router and then catch requests that fall through as 404's
    app.use(app.router);
    app.use(function () {
        throw new NotFoundError();
    });

    //Catch all errors
    var default_error_handler = express.errorHandler({ dumpExceptions: true, showStack: true });
    app.use(function (err, request, response, next) {
        if (err instanceof NotFoundError) {
            if (self.notfound_handler) {
                if (!self.notfound_handler(request, response)) {
                    return;
                }
            }
            response.statusCode = 404;
            return response.send('Not Found');
        }
        var msg = err || '', stack = {};
        if (typeof msg === 'object') {
            msg = err.message || err.msg;
            stack = err.stack;
        }
        log.warn('Request error at %s: %s', request.url, msg.trim());
        if (stack && !process.env.DISABLE_LOGGING) {
            console.error(stack);
        }
        if (self.error_handler) {
            if (!self.error_handler(msg, stack, request, response)) {
                return;
            }
        }
        if (config.production) {
            response.statusCode = 500;
            return response.send('Internal Server Error');
        }
        return default_error_handler(err, request, response, next);
    });

    this.app = app;

    return app;
};

/**
 * Set the server error (500) handler.
 *
 * @param {Function} callback - receives (msg, stack, request, response)
 */

Server.prototype.errorHandler = function (callback) {
    this.error_handler = callback;
};

/**
 * Set the not found (404) handler.
 *
 * @param {Function} callback - receives (request, response)
 */

Server.prototype.notFoundHandler = function (callback) {
    this.notfound_handler = callback;
};

/**
 * Get a LESS compiler for the specified directory.
 *
 * @param {String} root
 * @param {Object} config
 * @return {Function} compiler
 */

Server.prototype.compileCss = function (root, config) {
    root = path.join(root, 'public/css');
    var parser = new (less.Parser)({ paths: [ root ] });
    return function (str, callback) {
        parser.parse(str, function (err, root) {
            if (err && err.message) {
                err.message = 'Less: ' + err.message;
                return callback(err);
            }
            try {
                str = root.toCSS({ compress: config.production });
                callback(null, str);
            } catch (e) {
                callback(e.message);
            }
        });
    };
};

/**
 * Get a JS compiler for the specified directory.
 *
 * @param {String} root
 * @param {Object} config
 * @return {Function} compiler
 */

Server.prototype.compileJs = function (root, config) {
    return function (str, callback) {
        try {
            if (config.production) {
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
            (function registerWatch(file) {
                fs.watch(file, { persistent: false }, function () {
                    log.verbose('Deleting %s', compiled);
                    try {
                        fs.unlinkSync(compiled);
                    } catch (e) {}
                    registerWatch(file);
                });
            })(file);
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
                        (function registerWatch(file) {
                            fs.watch(file, { persistent: false }, function () {
                                log.verbose('Changed less file %s', file);
                                try {
                                    fs.readdirSync(root + '/compiled/css').forEach(function (f) {
                                        log.verbose('Deleting %s', f);
                                        try {
                                            fs.unlinkSync(root + '/compiled/css/' + f);
                                        } catch (e) {}
                                    });
                                } catch (e) {}
                                registerWatch(file);
                            });
                        })(file);
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
            });
        }
        if (redirect && redirect !== request.url) {
            response.setHeader('X-Accel-Expires', 0);
            return response.redirect(redirect);
        }
        next();
    };
};

/**
 * Listen on the specified port / socket.
 *
 * @param {Number|String} port (or socket)
 */

Server.prototype.listen = function (port) {
    if (!this.app) {
        this.create();
    }
    if (!utils.isNumeric(port)) {
        try {
            fs.unlinkSync(port);
        } catch (e) {}
    }
    var mask = process.umask(0);
    this.server = this.app.listen(port, function () {
        process.umask(mask);
    });
    return this.server;
};

/**
 * Close the server.
 */

Server.prototype.close = function () {
    if (this.server) {
        this.server.close();
    }
};

