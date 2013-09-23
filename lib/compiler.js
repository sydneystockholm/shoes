/*!
 * Connect - compiler
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var fs = require('fs')
  , path = require('path')
  , mkdirp = require('mkdirp')
  , parse = require('url').parse;

/**
 * Setup compiler.
 *
 * Options:
 *
 *   - `src`     Source directory, defaults to **CWD**.
 *   - `dest`    Destination directory, defaults `src`.
 *
 * @param {Object} options
 * @param {Object} compilers
 * @api public
 */

exports = module.exports = function compiler(options, compilers) {
    options = options || {};

    var srcDir = options.src || process.cwd()
      , destDir = options.dest || srcDir
      , enable = Object.keys(compilers);

    if (!enable || enable.length === 0) {
        throw new Error('compiler\'s "enable" option is not set, nothing will be compiled.');
    }

    return function assetCompiler(req, res, next) {
        if ('GET' !== req.method) return next();
        var pathname = parse(req.url).pathname;
        for (var i = 0, len = enable.length; i < len; ++i) {
            var name = enable[i]
              , compiler = compilers[name];
            if (compiler.match.test(pathname)) {
                var src = (srcDir + pathname).replace(compiler.match, compiler.ext)
                  , dest = destDir + pathname;

                var compile = function () {
                    fs.readFile(src, 'utf8', function (err, str) {
                        if (err) {
                            next(err);
                        } else {
                            compiler.compile(str, function (err, str) {
                                if (err) {
                                    next(err);
                                } else {
                                    mkdirp(path.dirname(dest), function (err) {
                                        if (err) return next(err);
                                        fs.writeFile(dest, str, 'utf8', function (err) {
                                            next(err);
                                        });
                                    });
                                }
                            });
                        }
                    });
                };

                // Compare mtimes
                fs.stat(src, function (err, srcStats) {
                    if (err) {
                        if ('ENOENT' === err.code) {
                            next();
                        } else {
                            next(err);
                        }
                    } else {
                        fs.stat(dest, function (err, destStats) {
                            if (err) {
                                if ('ENOENT' === err.code) {
                                    compile();
                                } else {
                                    next(err);
                                }
                            } else {
                                if (srcStats.mtime > destStats.mtime) {
                                    compile();
                                } else {
                                    next();
                                }
                            }
                        });
                    }
                });
                return;
            }
        }
        next();
    };
};

