var crypto = require('crypto')
  , fs = require('fs')
  , path = require('path')
  , utils = module.exports;

/**
 * Get the MD5 hash of a string.
 *
 * @param {String} str
 * @return {String} hash
 * @api public
 */

utils.md5 = function (str) {
    return crypto.createHash('md5').update(str + '').digest('hex');
};

/**
 * Recursively copy properties from `src` to `dest` if they don't exist.
 *
 * @param {object} dest
 * @param {object} src
 * @return {object} dest
 * @api private
 */

utils.merge = function (dest, src) {
    for (var i in src) {
        if (typeof dest[i] === "undefined") {
            dest[i] = src[i];
        } else if (typeof dest[i] === "object" && !Array.isArray(dest[i])) {
            utils.merge(dest[i], src[i]);
        }
    }
    return dest;
};

/**
 * Create a set from an array where elements are stored as object keys.
 *
 * @param {Array} arr
 * @return {Object} set
 * @api public
 */

utils.createSet = function (arr) {
    var obj = {};
    arr.forEach(function (elem) {
        obj[elem] = 1;
    });
    return obj;
};

/**
 * Check if a string contains only numbers.
 *
 * @param {String} str
 * @return {Boolean} numeric
 * @api public
 */

utils.isNumeric = function (str) {
    return (/^[0-9]+$/).test(str + '');
};

/**
 * A helper for watching a directory tree for changes.
 *
 * @param {String} dir
 * @param {Function} onchange
 */

var watched_directories = {};
utils.watchDirectoryTree = function (dir, onchange) {
    if (dir in watched_directories) {
        return;
    }
    fs.watch(dir, { persistent: false }, onchange);
    watched_directories[dir] = true;
    fs.readdirSync(dir).forEach(function (file) {
        file = path.join(dir, file);
        if (fs.statSync(file).isDirectory()) {
            utils.watchDirectoryTree(file, onchange);
        }
    });
};

