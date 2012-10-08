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

