
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
  , parse = require('url').parse;

/**
 * Require cache.
 */

var cache = {};

/**
 * Setup compiler.
 *
 * Options:
 *
 *   - `src`     Source directory, defaults to **CWD**.
 *   - `dest`    Destination directory, defaults `src`.
 *   - `enable`  Array of enabled compilers.
 *
 * Compilers:
 *
 *   - `sass`   Compiles sass to css
 *   - `less`   Compiles less to css
 *   - `coffeescript`   Compiles coffee to js
 *
 * @param {Object} options
 * @api public
 */

exports = module.exports = function compiler(options){
  options = options || {};

  var srcDir = options.src || process.cwd()
    , destDir = options.dest || srcDir
    , enable = options.enable;

  if (!enable || enable.length === 0) {
    throw new Error('compiler\'s "enable" option is not set, nothing will be compiled.');
  }

  return function compiler(req, res, next){
    if ('GET' != req.method) return next();
    var pathname = parse(req.url).pathname;
    for (var i = 0, len = enable.length; i < len; ++i) {
      var name = enable[i]
        , compiler = compilers[name];
      if (compiler.match.test(pathname)) {
        var src = (srcDir + pathname).replace(compiler.match, compiler.ext)
          , dest = destDir + pathname;

        // Compare mtimes
        fs.stat(src, function(err, srcStats){
          if (err) {
            if ('ENOENT' == err.code) {
              next();
            } else {
              next(err);
            }
          } else {
            fs.stat(dest, function(err, destStats){
              if (err) {
                // Oh snap! it does not exist, compile it
                if ('ENOENT' == err.code) {
                  compile();
                } else {
                  next(err);
                }
              } else {
                // Source has changed, compile it
                if (srcStats.mtime > destStats.mtime) {
                  compile();
                } else {
                  // Defer file serving
                  next();
                }
              }
            });
          }
        });

        // Compile to the destination
        function compile() {
          fs.readFile(src, 'utf8', function(err, str){
            if (err) {
              next(err);
            } else {
              compiler.compile(str, function(err, str){
                if (err) {
                  next(err);
                } else {
                  fs.writeFile(dest, str, 'utf8', function(err){
                    next(err);
                  });
                }
              });
            }
          });
        }
        return;
      }
    }
    next();
  };
};

var compilers = exports.compilers = {};
