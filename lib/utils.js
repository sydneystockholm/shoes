var utils = exports;

/**
 * Merge defaults into an options object.
 *
 * @param {Object} options
 * @param {Object} defaults
 * @return {Object}
 */

utils.mergeDefaults = function (options, defaults) {
    options = options || {};
    for (var key in defaults) {
        if (typeof options[key] === 'undefined') {
            options[key] = defaults[key];
        } else if (typeof defaults[key] === 'object') {
            utils.mergeDefaults(options[key], defaults[key]);
        }
    }
    return options;
};
