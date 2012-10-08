var crypto = require('crypto')
  , utils = module.exports;

/**
 * Get the MD5 hash of a string.
 *
 * @param {String} str
 * @return {String} hash
 * @api public
 */

utils.md5 = function (str) {
    return crypto.createHash('md5').update(str).digest('hex');
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

