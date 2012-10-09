var utils = require('./utils')
  , url = require('url')
  , helpers = exports;

/**
 * Create a slug.
 *
 * @param {String} str
 * @return {String} slug
 */

helpers.slug = function (str) {
    var slug = str.toLowerCase()
                  .replace(/[^a-z0-9]/ig, '-')
                  .replace(/--+/g, '-')
                  .replace(/^-|-$/g, '');
    return slug;
};

/**
 * Fix title widows.
 *
 * @param {String} title
 * @return {String}
 */

helpers.widow = function (title) {
    return (title || '').replace(/[ ]([^ ]+)$/g, '&nbsp;$1');
};

/**
 * Add to the query string.
 *
 * @param {String} url
 * @param {Object} query
 */

helpers.query = function (url, query) {
    var params = [];
    for (var key in query) {
        params.push(key + '=' + query[key]);
    }
    return url + (url.indexOf('?') !== -1 ? '&' : '?') + params.join('&');
};

/**
 * Add a thousand separator to a number.
 *
 * @param {Number} number
 * @return {String} formatted_number
 */

helpers.number_format = function (number) {
    if (!number) {
        return '0';
    }
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * Return a canonical url.
 *
 * @param {String} original_url
 * @param {String|Array} allowed_query_keys
 * @return {String} canonical_url
 */

helpers.canonical = function (original_url, allowed_query_keys) {
    if (!allowed_query_keys) {
        allowed_query_keys = [];
    } else if (!Array.isArray(allowed_query_keys)) {
        allowed_query_keys = [ allowed_query_keys ];
    }
    allowed_query_keys = utils.createSet(allowed_query_keys);
    original_url = url.parse(original_url, true);
    delete original_url.search;
    original_url.path = original_url.pathname;
    if (original_url.query) {
        var stripped_query = {};
        Object.keys(original_url.query).filter(function (key) {
            return key in allowed_query_keys;
        }).forEach(function (key) {
            stripped_query[key] = original_url.query[key];
        });
        original_url.query = stripped_query;
    }
    return url.format(original_url);
};

